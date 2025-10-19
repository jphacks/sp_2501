// src/components/AuthButton.tsx
'use client';

import { useSession, signIn, signOut } from 'next-auth/react';

export default function AuthButton() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <p>認証状態を確認しています…</p>;
  }

  if (session) {
    // ログイン済みの状態
    return (
      <div>
        <p>ようこそ、{session.user?.email}</p>
        <button 
          onClick={() => signOut()} 
          style={{ padding: '10px', color: 'white', background: 'red' }}
        >
          ログアウト
        </button>
      </div>
    );
  }

  // ログインしていない状態
  return (
    <div>
      <p>ログインされていません。</p>
      <button 
        onClick={() => signIn('google')} 
        style={{ padding: '10px', color: 'white', background: 'blue' }}
      >
        Google アカウントでログイン
      </button>
    </div>
  );
}