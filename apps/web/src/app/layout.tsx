import type { Metadata } from 'next';
import { Cairo, Geist, Inter, Plus_Jakarta_Sans, Tajawal } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppProvider } from '@/lib/app-context';
import './globals.css';

// Synthetix type system: Plus Jakarta Sans (display), Inter (body), Geist (labels and metrics).
const display = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
  display: 'swap',
});
const body = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});
const label = Geist({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-label',
  display: 'swap',
});
// Arabic (RTL) uses Cairo for headings and Tajawal for interface text.
const arDisplay = Cairo({
  subsets: ['arabic'],
  weight: ['600', '700'],
  variable: '--font-ar-display',
  display: 'swap',
});
const arBody = Tajawal({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  variable: '--font-ar-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI Content Hub',
  description: 'One input, a complete digital campaign.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const fonts = [display, body, label, arDisplay, arBody].map((f) => f.variable).join(' ');
  return (
    <html lang="en">
      <body className={fonts}>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
