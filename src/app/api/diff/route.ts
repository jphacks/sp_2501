import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
// ★ 'User' 타입을 임포트하여 헬퍼 함수에서 사용
import { PrismaClient, User } from '@prisma/client';
import { getServerSession } from 'next-auth';
// ★ authOptions 경로가 정확한지 확인하세요.
import { authOptions } from '../auth/[...nextauth]/route';

// --- Prisma Client 싱글톤 ---
// 개발 환경에서 Next.js의 Hot Reload 시 PrismaClient가 과도하게 생성되는 것을 방지
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}
const prisma = global.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.prisma = prisma;

// --- OpenAI API 설정 ---
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
// ★ 'gpt-5-nano'는 존재하지 않는 모델입니다. 'gpt-4o' 또는 'gpt-4-turbo' 등으로 변경해야 합니다.
const OPENAI_MODEL_NAME = 'gpt-4o';

// --- Developer Prompt (선택 사항) ---
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
} catch (e) {
  // developer-prompt.txt가 없어도 정상 동작
}

// --- 타입 정의 ---

interface ScreenshotPayload {
  filename: string;
  data: string; // Base64 data URI (data:image/png;base64,...)
}

// ★ userSystemId를 제거하고 userId로 통일
interface UploadRequestBody {
  screenshots: ScreenshotPayload[];
  userId?: string; // NextAuth의 session.user.id (User 모델의 @id 필드)
}

// AI가 반환할 것으로 기대되는 JSON 스키마
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

// --- 헬퍼 함수 1: Data URI 파싱 ---
function parseDataURI(dataURI: string): { buffer: Buffer; mimeType: string } {
  const match = dataURI.match(/^data:(.+);(base64),(.+)$/);
  if (!match || match.length < 4) {
    throw new Error('無効なData URI形式です。');
  }
  return { mimeType: match[1], buffer: Buffer.from(match[3], 'base64') };
}

// --- 헬퍼 함수 2: OpenAI API 호출 ---
async function analyzeScreenshotWithOpenAI(
  apiKey: string,
  screenshot: ScreenshotPayload
): Promise<DiffAnalysis> {
  const { filename, data } = screenshot;

  const messages: any[] = [
    {
      role: 'system',
      content:
        'あなたは提供されたスクリーンショットを分析し、指定されたJSONスキーマで分析結果を返すアシスタントです。',
    },
  ];

  if (developerPrompt) {
    messages.push({ role: 'developer', content: developerPrompt });
  }

  messages.push({
    role: 'user',
    content: [
      {
        type: 'text', // OpenAI 표준 'text' 사용
        text: `"${filename}" という名前のスクリーンショットを分析してください。`,
      },
      {
        type: 'image_url', // OpenAI 표준 'image_url' 사용
        image_url: { url: data },
      },
    ],
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
      max_tokens: 512,
      temperature: 0.3,
      // response_format: { type: "json_object" }, // JSON 출력을 강제하려면 이 옵션을 권장
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API エラー: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  try {
    // OpenAI가 마크다운(```json ... ```)으로 응답할 경우를 대비
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1]) as DiffAnalysis;
    }
    return JSON.parse(text) as DiffAnalysis;
  } catch (e) {
    throw new Error(`OpenAIがJSON形式でない応答を返しました: ${text}`);
  }
}

// --- 헬퍼 함수 3: 사용자 찾기 (중복 로직 통합) ---
async function findDatabaseUser(
  body: UploadRequestBody,
  request: NextRequest // 쿠키 접근을 위해 NextRequest가 필요
): Promise<User | null> {
  
  // 1. uploader.py가 명시적으로 ID를 보낸 경우 (가장 빠름)
  if (body.userId) {
    // userId corresponds to User.id in the schema
    const user = await prisma.user.findUnique({ where: { id: body.userId } });
    if (user) return user;
  }

  // 2. 세션/쿠키를 통해 서버에서 사용자를 찾는 경우 (Fallback)
  try {
    const session = await getServerSession(authOptions as any);
    // NextAuth.js 어댑터는 User 모델의 @id 필드를 session.user.id에 담아줍니다.
    if ((session as any)?.user?.id) {
      const user = await prisma.user.findUnique({ where: { id: (session as any).user.id } });
      if (user) return user;
    }
    // 이메일로도 확인
    if ((session as any)?.user?.email) {
      const user = await prisma.user.findUnique({ where: { email: (session as any).user.email } });
      if (user) return user;
    }
  } catch (e) {
    console.error('[diff] getServerSession failed', (e as Error).message);
  }

  // 3. (제공된 코드 로직 유지) 쿠키에서 직접 세션 토큰을 찾아 DB 쿼리
  try {
    const cookieNames = ['__Secure-next-auth.session-token', 'next-auth.session-token'];
    let tokenValue: string | undefined;
    for (const name of cookieNames) {
      const c = request.cookies.get(name);
      if (c?.value) {
        tokenValue = c.value;
        break;
      }
    }

    if (tokenValue) {
      const dbSession = await prisma.session.findUnique({
        where: { sessionToken: tokenValue },
        include: { user: true },
      });
      if (dbSession?.user) return dbSession.user;
    }
  } catch (e) {
    console.error('[diff] Cookie-based session lookup failed', (e as Error).message);
  }
  
  return null;
}

// --- 헬퍼 함수 4: DB 저장 (중복 로직 통합 및 최적화) ---
async function saveAnalysisToDb(userId: string, analysis: DiffAnalysis) {
  try {
    // 1. 오늘의 날짜 (YYYY-MM-DD 형식의 Date 객체)
    const today = new Date();
    // UTC 기준으로 날짜를 생성하여 시간대를 통일
    const dateOnly = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    // 2. 타임스탬프 키 생성 (JSON 내부 키)
    const now = new Date();
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    const tsKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}:${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, '0')}`;

    // 3. Upsert (Update or Insert) 로직
    // findFirst avoids relying on generated "WhereUniqueInput" names and works with the fields
  const existing = await prisma.userTaskPersonalLog.findFirst({ where: { userId, taskDateId: dateOnly } as any });

    let mapObj: Record<string, any> = {};

    // 4. 기존 taskTempTxt(JSON)가 있으면 가져와서 병합
    if (existing?.taskTempTxt && typeof existing.taskTempTxt === 'object' && !Array.isArray(existing.taskTempTxt)) {
      mapObj = existing.taskTempTxt as Record<string, any>;
    } else if (existing?.taskTempTxt && Array.isArray(existing.taskTempTxt)) {
      // (제공된 코드의 배열 -> 객체 변환 로직 유지)
      try {
        for (const it of existing.taskTempTxt as any[]) {
          if (it && it.time) mapObj[String(it.time)] = it.analysis ?? it;
        }
      } catch (e) { mapObj = {}; }
    }

    // 5. 새 분석 결과를 타임스탬프 키로 추가
    mapObj[tsKey] = analysis;

    // 6. DB 실행: Upsert
    if (existing) {
      // updateMany used to avoid composite unique where typing issues
              await prisma.userTaskPersonalLog.updateMany({ where: { userId, taskDateId: dateOnly } as any, data: { taskTempTxt: mapObj } });
    } else {
      await prisma.userTaskPersonalLog.create({ data: { user: { connect: { id: userId } }, taskDateId: dateOnly, taskTempTxt: mapObj } });
    }

  } catch (dbErr) {
    console.error('[diff] DB 저장 에러:', dbErr);
    // 이 에러는 클라이언트에게 치명적인 에러로 반환하지 않고, 서버에만 로깅
  }
}

// --- API 메인 핸들러 ---
export const runtime = 'nodejs'; // Vercel 엣지 런타임이 아닌 Node.js 런타임 사용 명시

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const body = (await request.json()) as UploadRequestBody;
    const { screenshots } = body;

    // 1. 유효성 검사
    if (!screenshots || !Array.isArray(screenshots) || screenshots.length === 0) {
      return NextResponse.json({ status: 'error', message: 'スクリーンショット配列が見つかりません。' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ status: 'error', message: 'OPENAI_API_KEYがサーバーに設定されていません。' }, { status: 500 });
    }

    // 2. 사용자 인증 (루프 시작 전 한 번만 실행)
    // ★ request 객체를 전달하여 쿠키도 조회할 수 있도록 함
    const dbUser = await findDatabaseUser(body, request);

    // 3. 각 스크린샷 처리
    const processedFiles: { filename: string; size: number }[] = [];
    const analysisResults: AnalysisResult[] = [];

    for (const shot of screenshots) {
      try {
        // 4. 임시 파일 저장 (디버깅/로깅용)
  const { buffer } = parseDataURI(shot.data);
  const tempFilePath = path.join(os.tmpdir(), shot.filename);
  await fs.promises.writeFile(tempFilePath, buffer as unknown as Uint8Array);
        processedFiles.push({ filename: shot.filename, size: buffer.length });

        // 5. OpenAI 분석
        let analysis: DiffAnalysis | undefined;
        try {
          analysis = await analyzeScreenshotWithOpenAI(apiKey, shot);
          analysisResults.push({ filename: shot.filename, analysis });
        } catch (openAiErr: any) {
          console.error(`[diff] OpenAI エラー (${shot.filename}):`, openAiErr);
          analysisResults.push({ filename: shot.filename, error: openAiErr?.message || String(openAiErr) });
          continue; // AI 분석 실패 시 DB 저장을 건너뛰고 다음 루프로
        }

        // 6. DB 저장
        if (dbUser && analysis) {
          // dbUser.id is the primary identifier
          saveAnalysisToDb(dbUser.id, analysis).catch(dbErr => {
            console.error(`[diff] DB async save error (${shot.filename}):`, dbErr);
          });
        } else if (!dbUser) {
          console.warn(`[diff] ユーザーが見つからないため、DBに保存できませんでした。 (${shot.filename})`);
        }

      } catch (loopErr: any) {
        // (파일 저장 실패, Data URI 파싱 실패 등)
        console.error(`[diff] ファイル処理エラー (${shot.filename}):`, loopErr);
        analysisResults.push({ filename: shot.filename, error: loopErr?.message || String(loopErr) });
      }
    }

    // 7. 최종 응답
    return NextResponse.json({
      status: 'success',
      message: `サーバー側で ${processedFiles.length}件 のファイルを処理しました。`,
      processedFiles,
      analysisResults,
    });

  } catch (err: any) {
    // (JSON 파싱 실패 등 요청 자체의 문제)
    console.error('[diff] リクエスト処理中の致命적인エラー:', err);
    return NextResponse.json(
      { status: 'error', message: `サーバーエラー: ${err.message}` },
      { status: 500 }
    );
  }
}