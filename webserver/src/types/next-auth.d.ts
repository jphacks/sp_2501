// src/types/next-auth.d.ts

import { DefaultSession } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

// JWT トークンに id と role を含めるように拡張
declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
  }
}

// Session の user オブジェクトに id と role を含めるように拡張
declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
        } & DefaultSession['user'];
    }
}