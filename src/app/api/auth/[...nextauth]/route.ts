import NextAuth, { type NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
// Prisma Adapter (설치된 패키지와 일치)
import { PrismaAdapter } from "@auth/prisma-adapter"
import { PrismaClient } from "@prisma/client"

// PrismaClient 싱글톤 (개발 모드에서 HMR로 인한 중복 인스턴스 방지)
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

const prisma = global.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== "production") global.prisma = prisma

const authOptions: NextAuthOptions = {
  // Prisma Adapter 설정 (기본 사용법)
  adapter: PrismaAdapter(prisma),

  // 1. 인증 프로바이더 설정
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
  ],

  // 2. (선택적) JWT 사용 시
  // session: {
  //   strategy: "jwt",
  // },

  // 3. NextAuth.js 비밀 키
  secret: process.env.NEXTAUTH_SECRET,
  
  // 4. (중요) 커스텀 ID를 세션에 올바르게 전달하기 위한 콜백
  callbacks: {
    session({ session, user }: { session: any; user: any }) {
      // 'user' 객체(DB의 User 모델)에서 'userSystemId'를 가져와 세션에 주입
      if (session.user && user) {
        // NextAuth v5 (Auth.js)는 user.id를 사용합니다.
        // 어댑터가 올바르게 매핑했다면 user.id는 userSystemId 값이어야 합니다.
        // (session.user as any).id = user.id; // user.id가 userSystemId 값임
      }
      return session
    },
  }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST }
