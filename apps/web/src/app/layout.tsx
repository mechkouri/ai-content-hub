import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProvider } from '@/lib/app-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Content Hub',
  description: 'One input, a complete digital campaign.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
