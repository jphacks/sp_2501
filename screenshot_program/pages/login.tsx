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
        onClick={() => signIn("google")} // 7. 'google'プロバイダーでログイン関数呼び出し
        style={{ padding: '0.5rem 1rem', background: 'blue', color: 'white', border: 'none', cursor: 'pointer' }}
      >
        Googleでログイン
      </button>
    </main>
  );
}