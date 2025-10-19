// src/app/api/cron-handler/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

// --- サマリープロンプト読み込み (summary API と同じ) ---
const promptFilePath = path.join(process.cwd(), 'src', 'app', 'api', 'summary', 'developer-prompt.txt');
let SUMMARY_PROMPT_TEMPLATE: string;
try {
  SUMMARY_PROMPT_TEMPLATE = fs.readFileSync(promptFilePath, 'utf-8');
} catch {
  SUMMARY_PROMPT_TEMPLATE = "アクティビティログをMarkdownで要約してください。";
}

// --- OpenAI 呼び出し関数 (summary API と同じ) ---
async function requestSummaryFromOpenAI(contentToSummarize: string) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({ /* ... 모델, 메시지 등 설정 ... */
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SUMMARY_PROMPT_TEMPLATE },
          { role: 'user', content: contentToSummarize },
        ],
        max_tokens: 1024,
        temperature: 0.3,
    });
    const summary = response.choices[0].message.content;
    if (!summary) throw new Error('OpenAI returned empty summary');
    return summary;
}

// --- GET ハンドラ (Cron Job は GET リクエストを送信します) ---
export async function GET(request: NextRequest) {
  // 1. Cron Job 認証
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // CRON_SECRET が一致しない場合は 401 Unauthorized を返す
    return NextResponse.json({ status: 'error', message: '認証に失敗しました' }, { status: 401 });
  }

  console.log('[Cron] Daily summary job started...');
  let processedCount = 0;
  let errorCount = 0;

  try {
    // 2. 昨日の日付を計算 (UTC 基準)
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const taskDateId = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate()));

    // 3. 自動要約が有効なユーザー一覧を取得
    const usersToProcess = await prisma.user.findMany({
      where: { autoSummaryEnabled: true },
      select: { id: true }, // userId만 가져옴
    });

    console.log(`[Cron] Found ${usersToProcess.length} users with auto-summary enabled for date ${taskDateId.toISOString().split('T')[0]}.`);

    // 4. 各ユーザーに対して要約を生成
    for (const user of usersToProcess) {
      const userId = user.id;
      try {
        // 4-1. 해당 사용자의 어제자 taskTempTxt 조회
        const log = await prisma.personalTaskLog.findUnique({
          where: { userId_taskDateId: { userId, taskDateId } },
          select: { taskTempTxt: true, taskContent: true }, // taskContent도 확인 (이미 생성되었는지)
        });

        // データがない、taskTempTxt がない、または既に要約がある場合はスキップ
        if (!log || !log.taskTempTxt || typeof log.taskTempTxt !== 'object' || Array.isArray(log.taskTempTxt) || log.taskContent) {
           if (log && log.taskContent) {
               console.log(`[Cron] User ${userId}: Summary already exists for ${taskDateId.toISOString().split('T')[0]}. Skipping.`);
           } else if (log && !log.taskTempTxt) {
                console.log(`[Cron] User ${userId}: No taskTempTxt data found for ${taskDateId.toISOString().split('T')[0]}. Skipping.`);
           }
           continue; // 다음 사용자로
        }

        // 4-2. AI に送るテキストを再構成 (summary API と同じロジック)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const taskData = log.taskTempTxt as Record<string, any>;
        let contentToSummarize = `昨日(${taskDateId.toISOString().split('T')[0]})のアクティビティログデータです...\n\n`;
        const sortedKeys = Object.keys(taskData).sort();
    for (const timeKey of sortedKeys) {
      const entry = taskData[timeKey];
      // entry を文字列化して要約に追加
      contentToSummarize += JSON.stringify(entry) + "\n";
    }

        // 4-3. AI 要約呼び出し
        const markdownSummary = await requestSummaryFromOpenAI(contentToSummarize);

        // 4-4. DB の taskContent を更新
        await prisma.personalTaskLog.update({
          where: { userId_taskDateId: { userId, taskDateId } },
          data: { taskContent: markdownSummary },
        });

        console.log(`[Cron] User ${userId}: Successfully generated summary for ${taskDateId.toISOString().split('T')[0]}.`);
        processedCount++;

      } catch (userError) {
        console.error(`[Cron] Error processing user ${userId}:`, userError);
        errorCount++;
      }
    } // end for loop

    console.log(`[Cron] Daily summary job finished. Processed: ${processedCount}, Errors: ${errorCount}`);
    return NextResponse.json({ status: 'success', processed: processedCount, errors: errorCount });

  } catch (error) {
    console.error('[Cron] Fatal error during cron job:', error);
    return NextResponse.json({ status: 'error', message: 'Cron ジョブの実行中に致命的なエラーが発生しました' }, { status: 500 });
  }
}