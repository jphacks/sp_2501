/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 👇 [추가] images 설정을 추가합니다.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**', // Google 사용자 이미지 경로 허용
      },
    ],
  },
};

export default nextConfig;