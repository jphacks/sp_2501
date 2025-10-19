import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';

// --- OpenAI API 設定 ---
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL_NAME = 'gpt-4o-mini';

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

// PrismaClient 싱글톤
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

const prisma = global.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') global.prisma = prisma

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

  // debug log removed
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
  // use async write to satisfy types (cast Buffer to Uint8Array)
  await fs.promises.writeFile(tempFilePath, buffer as unknown as Uint8Array);

  processedFiles.push({ filename, size: buffer.length });
  // debug log removed

      try {
        const analysis = await analyzeScreenshotWithOpenAI(apiKey, shot);
        analysisResults.push({ filename, analysis });
        // --- DB 저장 로직: 로그인한 유저의 오늘 기록에 추가 ---
        try {
          // 1) 우선 NextAuth의 getServerSession을 사용해서 세션을 얻어본다.
          //    (실환경/런타임 차이로 동작하지 않으면 아래 쿠키 기반 폴백으로 넘어간다.)
          let dbUser: any | null = null

          try {
            const serverSession: any = await getServerSession(authOptions as any)
            // 가능한 경우 id와 email 둘다 확인하여 더 정확히 사용자 매핑
            if (serverSession?.user) {
              if (serverSession.user.id) {
                dbUser = await prisma.user.findUnique({ where: { id: serverSession.user.id } })
              }
              if (!dbUser && serverSession.user.email) {
                dbUser = await prisma.user.findUnique({ where: { email: serverSession.user.email } })
              }
            }
          } catch (e) {
            // getServerSession 호출이 어떤 환경에서 실패할 수 있으므로 디버그 로그만 남기고 폴백 처리
            developerLog('getServerSession failed, will fallback to cookie lookup', { err: (e as Error).message })
          }

          // 2) getServerSession 으로 못찾았으면 기존 쿠키->session 테이블 조회 방식 폴백
          if (!dbUser) {
            const cookieNames = ['__Secure-next-auth.session-token', 'next-auth.session-token', 'next-auth.session-token']
            let tokenValue: string | undefined
            for (const name of cookieNames) {
              const c = request.cookies.get(name)
              if (c && c.value) {
                tokenValue = c.value
                break
              }
            }

            if (tokenValue) {
              const dbSession = await prisma.session.findUnique({ where: { sessionToken: tokenValue }, include: { user: true } })
              if (dbSession && dbSession.user) dbUser = dbSession.user
            }
          }

          // 3) dbUser가 있으면 오늘 날짜 레코드를 만들거나 업데이트하여 배열에 누적 저장
          if (dbUser) {
            const { userSystemId } = dbUser
            const today = new Date()
            const yyyy = today.getFullYear()
            const mm = String(today.getMonth() + 1).padStart(2, '0')
            const dd = String(today.getDate()).padStart(2, '0')
            // Prisma Date 타입(날짜만)으로 저장하기 위해 yyyy-mm-dd 형식 사용
            const dateOnly = new Date(`${yyyy}-${mm}-${dd}`)

            const existing = await prisma.userTaskPersonalLog.findUnique({ where: { userSystemId_taskDateId: { userSystemId, taskDateId: dateOnly } } })

            // 고유성 확보를 위해 Unix timestamp 사용
            const timestamp = Date.now()
            // 새 스키마: taskTempTxt는 배열로 누적 저장
            const entry = { time: timestamp, filename, analysis }

            if (existing) {
              // 기존 값이 배열인지 확인하고 아니면 변환
              let prevArray: any[] = []
              if (existing.taskTempTxt) {
                if (Array.isArray(existing.taskTempTxt)) prevArray = existing.taskTempTxt as any[]
                else {
                  // 이전에 객체 형태로 저장된 경우(호환성 유지): 변환하여 배열로 만든다.
                  try {
                    const asObj = existing.taskTempTxt as Record<string, unknown>
                    prevArray = Object.keys(asObj).map((k) => ({ time: k, analysis: (asObj as any)[k] }))
                  } catch (e) {
                    prevArray = []
                  }
                }
              }

              prevArray.push(entry)

              await prisma.userTaskPersonalLog.update({
                where: { userSystemId_taskDateId: { userSystemId, taskDateId: dateOnly } },
                data: { taskTempTxt: prevArray },
              })
            } else {
              await prisma.userTaskPersonalLog.create({ data: { userSystemId, taskDateId: dateOnly, taskTempTxt: [entry] } })
            }
          }
        } catch (dbErr) {
          console.error('[diff] DB save error:', dbErr)
        }
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
