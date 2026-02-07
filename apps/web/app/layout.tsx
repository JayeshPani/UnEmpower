import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'UnEmpower - AI-First Worker Lending',
  description: 'Blockchain-enforced lending platform powered by AI credit scoring',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ background: '#030303' }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          background: '#030303',
          color: '#ffffff',
          margin: 0,
          minHeight: '100vh',
        }}
      >
        <div style={{ background: '#030303', minHeight: '100vh' }}>
          <Providers>
            {children}
          </Providers>
        </div>
      </body>
    </html>
  );
}
