"use client"; // ★ 1.クライアントコンポーネントとして指定

import { useSession, signIn, signOut } from "next-auth/react";
import Image from "next/image"; // Next.jsのImageコンポーネントをインポート

export default function Home() {
  // 2. useSessionフックでセッション情報と状態を取得
  const { data: session, status } = useSession();

  // 3. ローディング状態の処理
  if (status === "loading") {
    return (
      <main>
        <p>セッション情報を読み込み中です...</p>
      </main>
    );
  }

  // 4. ログイン済みの場合 (セッションがある場合)
  if (session) {
    return (
      <main style={{ padding: '2rem' }}>
        <h1>ようこそ、{session.user?.name}さん</h1>
        {session.user?.image && (
          <Image
            src={session.user.image}
            alt="Google Profile Picture"
            width={50}
            height={50}
            style={{ borderRadius: '50%' }}
          />
        )}
        <p>メールアドレス: {session.user?.email}</p>
        <button 
          onClick={() => signOut()} // 5. ログアウト関数呼び出し
          style={{ padding: '0.5rem 1rem', background: 'red', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          ログアウト
        </button>
      </main>
    );
  }

  // 6. ログインしていない場合 (セッションがない場合)
  return (
    <main style={{ padding: '2rem' }}>
      <h1>JPHacks API サーバー</h1>
      <p>ログインしていません。</p>
      <button
        className="google-login-button"
        id="googleLoginButton"
        onClick={() => signIn('google')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.5rem 1rem', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer' }}
      >
        <svg className="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <span>Googleでログイン</span>
      </button>
    </main>
  );
}