// src/app/api/summary/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromAuth } from '@/lib/auth';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

// ----------------------------------------------------------------
// 1. AI 요약 프롬프트 (소스 1 파일 로드)
// ----------------------------------------------------------------
const promptFilePath = path.join(
  process.cwd(),
  'src',
  'app',
  'api',
  'summary',
  'developer-prompt.txt'
);

let SUMMARY_PROMPT_TEMPLATE: string;
try {
  SUMMARY_PROMPT_TEMPLATE = fs.readFileSync(promptFilePath, 'utf-8');
} catch (error) {
  console.error("summary/developer-prompt.txt 파일을 읽는 데 실패했습니다.", error);
  SUMMARY_PROMPT_TEMPLATE = "활동 로그를 Markdown으로 요약해 주세요."; // 오류 시 비상 프롬프트
}

// ----------------------------------------------------------------
// 2. OpenAI 호출 함수
// ----------------------------------------------------------------
async function requestSummaryFromOpenAI(contentToSummarize: string) {
  // 빌드 오류 방지를 위해 함수 내에서 생성
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o', // 👈 gpt-5 대신 gpt-4o 사용
    messages: [
      {
        role: 'system',
        content: SUMMARY_PROMPT_TEMPLATE, // 👈 (소스 1) 파일 내용
      },
      {
        role: 'user',
        content: contentToSummarize, // 👈 3번에서 생성한 JSON 조각 텍스트
      },
    ],
    max_tokens: 1024,
    temperature: 0.3,
  });

  const summary = response.choices[0].message.content;
  if (!summary) {
    throw new Error('OpenAI가 요약 내용을 반환하지 않았습니다.');
  }
  return summary; // Markdown 텍스트
}

// ----------------------------------------------------------------
// 3. POST 핸들러 (인증 및 로직 수정됨)
// ----------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    // 1. 인증 (헤더 또는 쿠키 확인)
    const userId = await getUserIdFromAuth(request); //  헬퍼 재사용
    if (!userId) {
      return NextResponse.json({ status: 'error', message: '인증 실패' }, { status: 401 });
    }

    // 2. 오늘 날짜 (UTC 기준)
    const today = new Date();
    const taskDateId = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    // 3. DB 조회 (taskContent 대신 taskTempTxt)
    const log = await prisma.personalTaskLog.findUnique({
      where: {
        userId_taskDateId: { userId, taskDateId }, // 👈 userSystemId 대신 userId
      },
      select: {
        taskTempTxt: true, // 👈 taskContent 대신 taskTempTxt
        updatedAt: true, // 👈 [추가] 마지막 업데이트 시간 조회
        taskContent: true, // 👈 [추가] 기존 요약본 확인용
      },
    });

    if (!log || !log.taskTempTxt || typeof log.taskTempTxt !== 'object' || Array.isArray(log.taskTempTxt)) {
      return NextResponse.json({ status: 'error', message: '요약할 데이터가 없습니다.' }, { status: 404 });
    }
    
    // 4. (Q5-3 동의) AI에 보낼 텍스트 재구성
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taskData = log.taskTempTxt as Record<string, any>;
    const taskDataKeys = Object.keys(taskData);
    let contentToSummarize = `与えられた複数のテキスト（txt群）を時系列的に解釈し、全体の流れや文脈を把握したうえで、1つのまとまった活動記録（時系列に沿った説明文）としてまとめてください。**出力は必ずMarkdown形式で記載してください。**

- まず各テキストから発生時刻や順序、主要な出来事・行動内容を把握し、論理的な時系列に並べ替えるか、補完してください。（タイムスタンプや内容の手がかりから順序を推論）
- 各出来事間の関係性や背景、流れを考察し、ストーリー性や論理的つながりを明確にしてください。
- 情報が断片的な場合、合理的な推察や繋がりの補完を行ってください。（ただし過剰な想像や事実の改変は避けてください。元テキスト情報を中心に編集）
- 全体が自然な活動経過報告（活動記録）となるようMarkdown形式でまとめてください。

**出力フォーマット:（必須）**  
- 必ずMarkdown記法で出力してください（段落、時系列の箇条書き、太字・時刻など適宜利用可）。  
- 長文の場合は段落ごとまたは出来事ごとに分けてください。  
- 入力テキストへの途中の推論やメモは表示せず、完成した活動記録文のみMarkdown形式で出力してください。

**思考ステップ（必ず内部実行し、最終記録文のみ出力）:**
1. 各テキスト内容から概要・出来事・順序を判断
2. 時系列・関連性の推論→全体構成を内的に組み立てる
3. Markdown形式で活動記録文を執筆（最終文は必ず最後）

# 出力フォーマット

- 出力は**Markdown形式**の日本語活動記録文（段落/箇条書きなどは適宜Markdown記法で）
- 見出し・太字・時刻表記などは必要に応じて活用
- 冗長な説明や推論の過程、メモは出力しない

# 例

---

【入力例1】  
- 10:00 入室  
- 10:05 パソコン起動  
- 10:30 プレゼン資料作成  
- 11:00 会議  
- 12:00 退室

【出力例1】  
\`\`\`
10時に入室し、その後パソコンを起動しました。10時30分からはプレゼン資料の作成に取り組み、11時から会議に参加しました。業務を終えて12時には退室しました。
\`\`\`

---

【入力例2】  
- 朝会  
- コードレビュー（15:00）  
- 昼食前に資料確認  
- テスト実施

【出力例2】
\`\`\`
朝会を行った後、昼食前に資料の確認を済ませました。その後はテストを実施し、15時からはコードレビューを行いました。
\`\`\`
※実際の出力は内容次第で複数段落や箇条書き利用も可。

---

# 注意

- 必ずMarkdown形式で出力してください。
- 推論や思考ステップは内部でのみ行い、出力には含めず活動記録文のみを生成してください。
- どんなに長い入力でも時系列と出来事のつながりが明確になるようセクション・段落・時刻・太字などMarkdown記法を効果的に使用してください。
- 出力の頭や末尾に余計な説明を付さないでください。

【リマインダー】  
与えられた情報を時系列・文脈・ストーリーとして解釈し、必ずMarkdown記法のみで1つのまとまった活動記録として表現してください。`;
  const lastEntryTimeKey = taskDataKeys.length > 0 ? taskDataKeys.sort().pop() : null;
    // 시간순 정렬 (키 "HH-MM-SS" 기준)
  const sortedKeys = Object.keys(taskData).sort();
    
    for (const timeKey of sortedKeys) {
      const entry = taskData[timeKey];
      // (소스 1) 프롬프트가 잘 이해하도록 JSON 형식 유지
      const dataChunk = {
        time: timeKey,
        summary: entry.summary || 'N/A',
        importance: entry.importanceScore || 0.0,
        details: {
          observations: entry.observationB || entry.observationA,
          diff: entry.differences,
        }
      };
      contentToSummarize += JSON.stringify(dataChunk) + "\n";
    }

    // 5. AI 요약 호출
    const markdownSummary = await requestSummaryFromOpenAI(contentToSummarize);

    // 6. DB의 'taskContent' 필드에 덮어쓰기
    await prisma.personalTaskLog.update({
      where: {
        userId_taskDateId: { userId, taskDateId },
      },
      data: {
        taskContent: markdownSummary,
      },
    });

    // 7. 클라이언트에 요약본 반환
    return NextResponse.json({
      status: 'success',
      summary: markdownSummary,
    });

  } catch (error) {
    console.error('[API /api/summary Error]', error);
    const errorMessage = error instanceof OpenAI.APIError ? error.message : String(error);
    return NextResponse.json({ status: 'error', message: errorMessage }, { status: 500 });
  }
}