// src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Process Log',
  description: 'Your activity logger',
};
const InitializeThemeScript = `
  (function() {
    try {
      const isDarkMode = localStorage.getItem('darkMode') === '1';
      if (isDarkMode) {
        document.body.classList.add('dark');
      }
    } catch (e) {
      console.error('Failed to initialize theme:', e);
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <script dangerouslySetInnerHTML={{ __html: InitializeThemeScript }} />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}