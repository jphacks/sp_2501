import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// --- OpenAI API 向け設定 ---
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL_NAME = 'gpt-5';

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
    console.log('[summary/dev]', ...args);
  }
};

if (isDeveloperModeEnabled) {
  developerLog('Developer prompt path:', developerPromptPath);
  developerLog('Developer prompt content:', developerPrompt);
}

// --- リクエスト／レスポンス型 ---
type SummaryRequestBody = {
  text: string;
  instructions?: string;
  language?: string;
};

type SummaryResponseBody = {
  summary: string;
  model: string;
  rationale?: string;
};

// OpenAI API に要約生成を依頼するヘルパー関数
async function requestSummaryFromOpenAI(
  apiKey: string,
  { text, instructions, language }: SummaryRequestBody
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

  const text = body.text?.trim();

  if (!text) {
    return NextResponse.json({ message: 'text フィールドは必須です。' }, { status: 400 });
  }

  developerLog('リクエストボディを受信しました。', {
    instructions: body.instructions,
    language: body.language,
    textPreview: text.slice(0, 120),
  });

  try {
    const summary = await requestSummaryFromOpenAI(apiKey, { ...body, text });
    return NextResponse.json(summary);
  } catch (error) {
    console.error('[summary] OpenAI API エラー:', error);
    return NextResponse.json(
      { message: '要約の生成に失敗しました。', details: (error as Error).message },
      { status: 502 }
    );
  }
}
