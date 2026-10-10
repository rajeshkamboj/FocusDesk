import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { AuthProvider } from '@/components/auth/auth-provider';
import { DataProvider } from '@/components/data/data-provider';
import { AppShell } from '@/components/layout/app-shell';

export const metadata: Metadata = {
  title: {
    default: 'FocusDesk',
    template: '%s · FocusDesk',
  },
  description:
    'A calm personal execution system: decide what matters today, move the important things forward, and review honestly.',
  manifest: '/manifest.webmanifest',
  icons: {
    // Generated from assets/icon-master.png by `npm run icons` — never
    // edit the files in public/icons by hand.
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FocusDesk',
  },
};

export const viewport: Viewport = {
  themeColor: '#f6f6f3',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Theme-flash prevention script.
 *
 * Runs before any of the React tree hydrates so the <html data-theme="…">
 * attribute is set before first paint — avoids a white flash when the user
 * prefers dark mode. Reads (in order):
 *   1. explicit preference stored under `pace.theme`
 *   2. appearance.theme saved inside the legacy `pace.db.v1` blob
 *   3. system preference via matchMedia
 *
 * Delivered via next/script with strategy="beforeInteractive" so Next injects
 * it as a blocking inline script (the React 19 / Next 16 compatible approach;
 * a plain React <script dangerouslySetInnerHTML> produces a
 * "Scripts inside React components are never executed on the client" warning).
 */
const themeInitScript = `(function(){try{var t=null;try{t=localStorage.getItem('pace.theme');}catch(e){}if(!t){try{var d=JSON.parse(localStorage.getItem('pace.db.v1')||'{}');t=d&&d.settings&&d.settings.appearance&&d.settings.appearance.theme;}catch(e){}}var dark=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',dark?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <AuthProvider>
          <DataProvider>
            <AppShell>{children}</AppShell>
          </DataProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
