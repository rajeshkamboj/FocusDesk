import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { themeInitScript } from '@/lib/theme';
import './globals.css';
import { AuthProvider } from '@/components/auth/auth-provider';
import { DataProvider } from '@/components/data/data-provider';
import { AppShell } from '@/components/layout/app-shell';

export const metadata: Metadata = {
  title: {
    default: 'Focus Desk',
    template: '%s · Focus Desk',
  },
  description:
    'A calm personal execution system: decide what matters today, move the important things forward, and review honestly.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Focus Desk',
  },
};

export const viewport: Viewport = {
  themeColor: '#151613',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
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
