// src/app/providers.tsx
'use client';

import { SessionProvider } from 'next-auth/react';
import React from 'react';

export default function Providers({ children }: { children: React.ReactNode }) {
  // 1단계에서 만든 API 라우트를 기반으로 세션을 관리합니다.
  return <SessionProvider>{children}</SessionProvider>;
}