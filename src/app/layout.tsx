import React from 'react';

export const metadata = {
  title: 'processLog',
  description: 'JPHacks API server placeholder',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
      </body>
    </html>
  );
}
