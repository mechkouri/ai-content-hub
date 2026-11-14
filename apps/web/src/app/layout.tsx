import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProvider } from '@/lib/app-context';
import { LocaleProvider } from '@/lib/i18n';
import { LOCALE_BOOT_SCRIPT } from '@/lib/i18n/boot-script';
// Self-hosted fonts (no network access at build time): Plus Jakarta Sans for display, Inter for body,
// Geist for labels and metrics, and Cairo + Tajawal for Arabic (RTL). The CSS variables are in globals.css.
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/geist/latin-500.css';
import '@fontsource/geist/latin-600.css';
import '@fontsource/geist/latin-700.css';
import '@fontsource/cairo/arabic-600.css';
import '@fontsource/cairo/arabic-700.css';
import '@fontsource/tajawal/arabic-400.css';
import '@fontsource/tajawal/arabic-500.css';
import '@fontsource/tajawal/arabic-700.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Content Hub',
  description: 'One input, a complete digital campaign.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The language and direction are set on <html> by a script before paint, and browser extensions often add
    // attributes to <head>, <script> and <body> before React loads, so React must not complain about those.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: LOCALE_BOOT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <LocaleProvider>
          <AppProvider>{children}</AppProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
