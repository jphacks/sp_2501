// src/lib/auth.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * [アップグレード済] Bearer トークン(Python) または セッションクッキー(ブラウザ) を検証し、
 * ユーザー ID を返します。
 * @param request NextRequest
 * @returns {Promise<string | null>} 成功時 userId、失敗時 null
 */
export async function getUserIdFromAuth(request: NextRequest): Promise<string | null> {
  let sessionToken: string | undefined;

  // 1. Bearer トークンの確認 (Python / Postman)
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    sessionToken = authHeader.split(' ')[1];
  }

  // 2. Bearer トークンが無い場合はクッキーを確認 (ブラウザ)
  if (!sessionToken) {
    // ステップ1で Vercel 配置時に使用するクッキー名
    const cookieName = '__Secure-next-auth.session-token'; 
    // ステップ1でローカルテスト時に使用するクッキー名
    const localCookieName = 'next-auth.session-token';
    
    // next/headers からクッキーを取得
    const cookieStore = request.cookies; 
  const secureCookie = cookieStore.get(cookieName);
  const localCookie = cookieStore.get(localCookieName);

    if (secureCookie) {
      sessionToken = secureCookie.value;
    } else if (localCookie) {
      sessionToken = localCookie.value;
    }
  }
  
  // 3. トークンがない (ログインしていない)
  if (!sessionToken) {
    console.warn('[Auth] No session token found in headers or cookies.');
    return null;
  }

  // 4. DB でセッション検証 (DB 戦略)
  try {
    const session = await prisma.session.findUnique({
      where: {
        sessionToken: sessionToken,
      },
      include: {
        user: true,
      },
    });

    if (session && session.expires > new Date() && session.user) {
      return session.user.id; // ★ 成功!
    } else {
      console.warn(`[Auth] Invalid or expired token: ${sessionToken}`);
      return null;
    }
  } catch (error) {
    console.error('[Auth] Error during session validation:', error);
    return null;
  }
}