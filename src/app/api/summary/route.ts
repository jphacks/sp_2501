import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// --- OpenAI API 向け設定 ---
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL_NAME = 'gpt-4o-mini';

// --- Developer Prompt 読み込み ---
const developerPromptPath = path.join(
  process.cwd(),
  'src',
  'app',
  'api',
  'summary',
  'developer-prompt.txt'
);

let developerPrompt = '';

try {
  developerPrompt = fs.readFileSync(developerPromptPath, 'utf-8').trim();
} catch (error) {
  console.error('[summary] Developer prompt の読み込みに失敗しました:', error);
}

const isDeveloperModeEnabled = process.env.SUMMARY_DEVELOPER_MODE === 'true';

const developerLog = (...args: unknown[]) => {
  if (isDeveloperModeEnabled) {
    // debug log removed
  }
};

if (isDeveloperModeEnabled) {
  developerLog('Developer prompt path:', developerPromptPath);
  developerLog('Developer prompt content:', developerPrompt);
}

// --- リクエスト／レスポンス型 ---
type SummaryRequestBody = {
  userSystemId: string;
  taskDate: string;
  instructions?: string;
  language?: string;
};

type SummaryResponseBody = {
  summary: string;
  model: string;
  rationale?: string;
};

type SummaryGenerationParams = {
  text: string;
  instructions?: string;
  language?: string;
};

// OpenAI API に要約生成を依頼するヘルパー関数
async function requestSummaryFromOpenAI(
  apiKey: string,
  { text, instructions, language }: SummaryGenerationParams
): Promise<SummaryResponseBody> {
  const systemPrompt = [
    'あなたは正確で簡潔な要約を生成するアシスタントです。',
    language ? `${language} で回答してください。` : '入力と同じ言語で回答してください。',
    instructions?.trim() ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const messages: Array<{ role: 'system' | 'developer' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  if (developerPrompt) {
    messages.push({ role: 'developer', content: developerPrompt });
  }

  messages.push({
    role: 'user',
    content: `次の文章を要約してください:\n\n${text}`,
  });

  developerLog('要約リクエストを作成しました。', {
    instructions,
    language,
    textPreview: text.slice(0, 120),
    developerPromptIncluded: Boolean(developerPrompt),
  });

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages,
      max_tokens: 320,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({} as Record<string, unknown>));
    throw new Error(
      `OpenAI API へのリクエストがステータス ${response.status} で失敗しました: ${
        (errorPayload as { error?: { message?: string } }).error?.message ?? '原因不明のエラー'
      }`
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
      logprobs?: Record<string, unknown>;
    }>;
    usage?: { total_tokens?: number };
  };

  const summary = payload.choices?.[0]?.message?.content?.trim();

  if (!summary) {
    throw new Error('OpenAI API から要約が返されませんでした。');
  }

  developerLog('OpenAI から要約を受信しました。', {
    summaryPreview: summary.slice(0, 120),
    totalTokens: payload.usage?.total_tokens,
  });

  return {
    summary,
    model: MODEL_NAME,
  };
}

export const runtime = 'nodejs';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prisma = globalThis.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

export async function POST(request: NextRequest) {
  // App Router 経由でのメソッド制限
  if (request.method !== 'POST') {
    return NextResponse.json({ message: '許可されていないメソッドです。' }, { status: 405 });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { message: 'OPENAI_API_KEY がサーバーに設定されていません。' },
      { status: 500 }
    );
  }

  let body: SummaryRequestBody;

  try {
    body = (await request.json()) as SummaryRequestBody;
  } catch (error) {
    return NextResponse.json({ message: 'JSON ボディが不正です。' }, { status: 400 });
  }

  const userSystemId = body.userSystemId?.trim();
  const taskDate = body.taskDate?.trim();

  if (!userSystemId || !taskDate) {
    return NextResponse.json(
      { message: 'userSystemId と taskDate は必須です。' },
      { status: 400 }
    );
  }

  developerLog('リクエストパラメータを受信しました。', {
    userSystemId,
    taskDate,
    instructions: body.instructions,
    language: body.language,
  });

  const taskDateObj = new Date(taskDate);

  if (Number.isNaN(taskDateObj.getTime())) {
    return NextResponse.json({ message: 'taskDate の形式が不正です。' }, { status: 400 });
  }

  let text: string | null = null;

  try {
    const logEntry = await prisma.userTaskPersonalLog.findUnique({
      where: {
        userSystemId_taskDateId: {
          userSystemId,
          taskDateId: taskDateObj,
        },
      },
      select: {
        taskContent: true,
      },
    });

    text = logEntry?.taskContent?.trim() ?? null;

    developerLog('データベースからタスク内容を取得しました。', {
      found: Boolean(logEntry),
      hasContent: Boolean(text),
      textPreview: text?.slice(0, 120),
    });
  } catch (error) {
    console.error('[summary] DB 取得エラー:', error);
    return NextResponse.json(
      { message: 'タスク内容の取得に失敗しました。', details: (error as Error).message },
      { status: 500 }
    );
  }

  if (!text) {
    return NextResponse.json(
      { message: '指定されたタスク内容が見つかりません。' },
      { status: 404 }
    );
  }

  try {
    const summary = await requestSummaryFromOpenAI(apiKey, {
      text,
      instructions: body.instructions,
      language: body.language,
    });
    return NextResponse.json(summary);
  } catch (error) {
    console.error('[summary] OpenAI API エラー:', error);
    return NextResponse.json(
      { message: '要約の生成に失敗しました。', details: (error as Error).message },
      { status: 502 }
    );
  }
}
