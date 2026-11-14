import type { Metadata, Viewport } from 'next';
import './globals.css';
import { I18nProvider } from '@/lib/i18n';
import { Shell } from './shell';

export const metadata: Metadata = {
  title: 'Pay-at-table proposal for Qlub KSA (unofficial)',
  description: 'An independent proposal with a working prototype. Not affiliated with or endorsed by Qlub.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f5c4d' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <I18nProvider>
          <Shell>{children}</Shell>
        </I18nProvider>
      </body>
    </html>
  );
}
