// src/app/api/user/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromAuth } from '@/lib/auth'; // 4段階認証ヘルパー

export async function PUT(request: NextRequest) {
  try {
    // 1. 인증
    const userId = await getUserIdFromAuth(request);
    if (!userId) {
      return NextResponse.json({ status: 'error', message: '認証に失敗しました' }, { status: 401 });
    }

    // 2. 요청 본문에서 설정 값 읽기
    const body = await request.json();
    const autoSummaryEnabled = typeof body.autoSummaryEnabled === 'boolean' ? body.autoSummaryEnabled : null;

  if (autoSummaryEnabled === null) {
    return NextResponse.json({ status: 'error', message: 'autoSummaryEnabled の値が必要です。' }, { status: 400 });
  }

    // 3. DB 업데이트
    await prisma.user.update({
      where: { id: userId },
      data: { autoSummaryEnabled: autoSummaryEnabled },
    });

  return NextResponse.json({ status: 'success', message: '設定が更新されました。', autoSummaryEnabled });

  } catch (error) {
    console.error('[API /api/user/settings Error]', error);
  return NextResponse.json({ status: 'error', message: '設定の更新中にエラーが発生しました' }, { status: 500 });
  }
}

// (선택) 현재 설정을 가져오는 GET 핸들러도 추가할 수 있습니다.
export async function GET(request: NextRequest) {
    try {
        const userId = await getUserIdFromAuth(request);
        if (!userId) {
          return NextResponse.json({ status: 'error', message: '認証に失敗しました' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { autoSummaryEnabled: true }
        });

     if (!user) {
       return NextResponse.json({ status: 'error', message: 'ユーザーが見つかりません' }, { status: 404 });
     }

  return NextResponse.json({ status: 'success', autoSummaryEnabled: user.autoSummaryEnabled });

    } catch (error) {
        console.error('[API /api/user/settings GET Error]', error);
    return NextResponse.json({ status: 'error', message: '設定の取得中にエラーが発生しました' }, { status: 500 });
    }
}