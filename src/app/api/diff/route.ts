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
  console.error('[diff] Developer prompt の読み込みに失敗しました:', error);
}

const isDeveloperModeEnabled = process.env.DIFF_DEVELOPER_MODE === 'true';

const developerLog = (...args: unknown[]) => {
  if (isDeveloperModeEnabled) {
    console.log('[diff/dev]', ...args);
  }
};

if (isDeveloperModeEnabled) {
  developerLog('Developer prompt path:', developerPromptPath);
  developerLog('Developer prompt content:', developerPrompt);
}

// --- 型定義 ---
interface ScreenshotPayload {
  filename: string;
  data: string; // data:image/png;base64,... 形式の Data URI
}

interface UploadRequestBody {
  screenshots: ScreenshotPayload[];
}

type ApiResponse = {
  status: 'success' | 'error';
  message: string;
  processedFiles?: { filename: string; size: number }[];
  analysisResults?: { filename: string; result: string }[];
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

// --- ヘルパー関数 ---

/**
 * Data URI (data:image/png;base64,...) を Buffer と MIME タイプに変換します。
 */
function parseDataURI(dataURI: string): { buffer: Buffer; mimeType: string } {
  try {
    const regex = /^data:(.+);(base64),(.+)$/;
    const match = dataURI.match(regex);

    if (!match || match.length < 4) {
      throw new Error('無効な Data URI 形式です。');
    }

    const mimeType = match[1];
    const base64Data = match[3];
    const buffer = Buffer.from(base64Data, 'base64');

    return { buffer, mimeType };
  } catch (error: any) {
    console.error('Data URI のパースに失敗:', error.message);
    throw new Error('無効な Data URI');
  }
}

/**
 * スクリーンショットを OpenAI API に送信し、解析結果を取得します。
 */
async function analyzeScreenshotWithOpenAI(
  apiKey: string,
  screenshot: ScreenshotPayload
): Promise<string> {
  const { filename, data } = screenshot;

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'あなたはスクリーンショットの差分解析を手伝うアシスタントです。画像から読み取れる要点を簡潔に列挙してください。',
    },
  ];

  if (developerPrompt) {
    messages.push({ role: 'developer', content: developerPrompt });
  }

  messages.push({
    role: 'user',
    content: [
      { type: 'input_text', text: `ファイル名「${filename}」のスクリーンショットを解析し、重要なポイントや変更点を報告してください。` },
      { type: 'input_image', image_url: { url: data } },
    ],
  });

  developerLog('OpenAI 解析リクエストを作成しました。', {
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
      max_tokens: 320,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({} as Record<string, unknown>));
    throw new Error(
      `OpenAI API リクエストがステータス ${response.status} で失敗しました: ${
        (errorPayload as { error?: { message?: string } }).error?.message ?? '原因不明のエラー'
      }`
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('OpenAI API から解析結果が返されませんでした。');
  }

  developerLog('OpenAI 解析結果を受信しました。', {
    filename,
    preview: content.slice(0, 120),
  });

  return content;
}

// --- API メインハンドラ (App Router 形式) ---

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const body = (await request.json()) as UploadRequestBody;
    const { screenshots } = body;

    if (!screenshots || !Array.isArray(screenshots) || screenshots.length === 0) {
      return NextResponse.json(
        {
          status: 'error',
          message: '無効なペイロードです。"screenshots" 配列が見つかりません。',
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'OPENAI_API_KEY がサーバーに設定されていません。',
        },
        { status: 500 }
      );
    }

    console.log(`受信したスクリーンショット: ${screenshots.length}件`);
    developerLog('解析対象スクリーンショット一覧', screenshots.map((shot) => shot.filename));

    const processedFiles: { filename: string; size: number }[] = [];
    const analysisResults: { filename: string; result: string }[] = [];

    for (const shot of screenshots) {
      const { filename, data } = shot;

      const { buffer } = parseDataURI(data);

      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, filename);
      fs.writeFileSync(tempFilePath, buffer);

      processedFiles.push({ filename, size: buffer.length });
      console.log(`一時ファイルとして保存完了: ${tempFilePath}`);

      try {
        const result = await analyzeScreenshotWithOpenAI(apiKey, shot);
        analysisResults.push({ filename, result });
      } catch (error) {
        console.error(`[diff] OpenAI API エラー (${filename}):`, error);
        analysisResults.push({
          filename,
          result: `OpenAI API エラー: ${(error as Error).message}`,
        });
      }
    }

    return NextResponse.json({
      status: 'success',
      message: `サーバー側で ${processedFiles.length}件 のファイルを受信・処理しました。`,
      processedFiles,
      analysisResults,
    });
  } catch (error: any) {
    console.error('アップロード処理中のエラー:', error);
    return NextResponse.json(
      { status: 'error', message: `サーバー側でエラー: ${error.message}` },
      { status: 500 }
    );
  }
}
