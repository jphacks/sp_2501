import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

// --- OpenAI API 設定 ---
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL_NAME = 'gpt-5-nano';

// --- Developer Prompt 読み込み ---
const developerPromptPath = path.join(
  process.cwd(),
  'src',
  'app',
  'api',
  'diff',
  'developer-prompt.txt'
);

let developerPrompt = '';

try {
  developerPrompt = fs.readFileSync(developerPromptPath, 'utf-8').trim();
} catch (error) {
  console.error('[diff] Failed to read developer prompt:', error);
}

// 開発者モード用フラグ（詳細ログ出力を制御）
const isDeveloperModeEnabled = process.env.DIFF_DEVELOPER_MODE === 'true';

const developerLog = (...args: unknown[]) => {
  if (isDeveloperModeEnabled) {
    console.log('[diff/dev]', ...args);
  }
};

if (isDeveloperModeEnabled) {
  developerLog('Developer prompt path', developerPromptPath);
  developerLog('Developer prompt content', developerPrompt);
}

// --- リクエスト／レスポンス型 ---
interface ScreenshotPayload {
  filename: string;
  data: string; // Base64 data URI (data:image/png;base64,...)
}

interface UploadRequestBody {
  screenshots: ScreenshotPayload[];
}

type DiffAnalysis = {
  observationA: string[];
  observationB: string[];
  sharedFeatures: string[];
  differences: string[];
  summary: string;
  importanceScore: number;
  importanceReason: string;
};

type AnalysisResult = {
  filename: string;
  analysis?: DiffAnalysis;
  error?: string;
};

type ApiResponse = {
  status: 'success' | 'error';
  message: string;
  processedFiles?: { filename: string; size: number }[];
  analysisResults?: AnalysisResult[];
};

type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'developer'; content: string }
  | {
      role: 'user';
      content: Array<
        | { type: 'input_text'; text: string }
        | { type: 'input_image'; image_url: { url: string } }
      >;
    };

// Data URI を Buffer と MIME タイプに変換
function parseDataURI(dataURI: string): { buffer: Buffer; mimeType: string } {
  const regex = /^data:(.+);(base64),(.+)$/;
  const match = dataURI.match(regex);

  if (!match || match.length < 4) {
    throw new Error('Invalid Data URI.');
  }

  const mimeType = match[1];
  const base64Data = match[3];
  const buffer = Buffer.from(base64Data, 'base64');

  return { buffer, mimeType };
}

// スクリーンショットを OpenAI API に送って解析する
async function analyzeScreenshotWithOpenAI(
  apiKey: string,
  screenshot: ScreenshotPayload
): Promise<DiffAnalysis> {
  const { filename, data } = screenshot;

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You help analyze pairs of screenshots and report comparisons accurately and concisely.',
    },
  ];

  if (developerPrompt) {
    // developer-prompt.txt が存在する場合は developer ロールとして追加
    messages.push({ role: 'developer', content: developerPrompt });
  }

  messages.push({
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: `Analyze the screenshot named "${filename}" and follow the specified comparison format.`,
      },
      { type: 'input_image', image_url: { url: data } },
    ],
  });

  developerLog('Created OpenAI analysis request', {
    filename,
    withDeveloperPrompt: Boolean(developerPrompt),
    dataSnippet: data.slice(0, 48),
  });

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL_NAME,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'diff_analysis',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              observationA: {
                type: 'array',
                minItems: 1,
                items: { type: 'string' },
                description: 'Observations specific to screenshot A.',
              },
              observationB: {
                type: 'array',
                minItems: 1,
                items: { type: 'string' },
                description: 'Observations specific to screenshot B.',
              },
              sharedFeatures: {
                type: 'array',
                minItems: 1,
                items: { type: 'string' },
                description: 'Features common to both screenshots.',
              },
              differences: {
                type: 'array',
                minItems: 1,
                items: { type: 'string' },
                description: 'Notable differences between the screenshots.',
              },
              summary: {
                type: 'string',
                description: 'Overall summary of the comparison.',
              },
              importanceScore: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'Importance score for screenshot B (0.0-1.0).',
              },
              importanceReason: {
                type: 'string',
                description: 'Reason for the assigned importance score.',
              },
            },
            required: [
              'observationA',
              'observationB',
              'sharedFeatures',
              'differences',
              'summary',
              'importanceScore',
              'importanceReason',
            ],
          },
        },
      },
      max_tokens: 320,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({} as Record<string, unknown>));
    throw new Error(
      `OpenAI request failed with status ${response.status}: ${
        (errorPayload as { error?: { message?: string } }).error?.message ?? 'unknown error'
      }`
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('OpenAI returned an empty analysis result.');
  }

  let parsed: DiffAnalysis;

  try {
    parsed = JSON.parse(content) as DiffAnalysis;
  } catch (error) {
    developerLog('Failed to parse OpenAI analysis JSON', { filename, content });
    throw new Error('OpenAI response was not valid JSON.');
  }

  developerLog('Received OpenAI analysis result', {
    filename,
    summaryPreview: parsed.summary.slice(0, 120),
    observationACount: parsed.observationA.length,
    observationBCount: parsed.observationB.length,
  });

  return parsed;
}

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const body = (await request.json()) as UploadRequestBody;
    const { screenshots } = body;

    if (!screenshots || !Array.isArray(screenshots) || screenshots.length === 0) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Invalid payload. The "screenshots" array is required.',
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'OPENAI_API_KEY is not configured on the server.',
        },
        { status: 500 }
      );
    }

    console.log(`Received ${screenshots.length} screenshots.`);
    developerLog(
      'Screenshot filenames',
      screenshots.map((shot) => shot.filename)
    );

    const processedFiles: { filename: string; size: number }[] = [];
    const analysisResults: AnalysisResult[] = [];

    for (const shot of screenshots) {
      const { filename, data } = shot;

      const { buffer } = parseDataURI(data);

      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, filename);
      fs.writeFileSync(tempFilePath, buffer);

      processedFiles.push({ filename, size: buffer.length });
      console.log(`Stored temporary file: ${tempFilePath}`);

      try {
        const analysis = await analyzeScreenshotWithOpenAI(apiKey, shot);
        analysisResults.push({ filename, analysis });
      } catch (error) {
        console.error(`[diff] OpenAI error (${filename}):`, error);
        analysisResults.push({
          filename,
          error: `OpenAI API error: ${(error as Error).message}`,
        });
      }
    }

    return NextResponse.json({
      status: 'success',
      message: `Processed ${processedFiles.length} files on the server.`,
      processedFiles,
      analysisResults,
    });
  } catch (error: any) {
    console.error('Upload processing error:', error);
    return NextResponse.json(
      { status: 'error', message: `Server error: ${error.message}` },
      { status: 500 }
    );
  }
}
