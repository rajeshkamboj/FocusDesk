'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useData } from '@/components/data/data-provider';
import { UIProvider } from '@/components/ui/ui-provider';
import { Toaster } from '@/components/ui/toaster';
import { PrintHeader } from './print-header';
import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';
import { QuickAdd } from './quick-add';
import { TimerDock } from './timer-dock';
import { FocusMode } from './focus-mode';
import { RegisterSW } from '@/components/pwa/register-sw';
import { useNotificationNavigation, useNotificationScheduler } from '@/lib/notifications';
import { applyTheme, watchSystemTheme } from '@/lib/theme';

const LAST_SECTION_KEY = 'pace.lastSection';

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, data } = useData();
  useNotificationScheduler();
  useNotificationNavigation();

  useEffect(() => {
    if (pathname && pathname !== '/') {
      try {
        window.localStorage.setItem(LAST_SECTION_KEY, pathname);
      } catch {
        /* ignore */
      }
    }
  }, [pathname]);

  // Apply the appearance preference (and follow the OS while it is 'system').
  useEffect(() => {
    if (!ready) return;
    applyTheme(data.settings.appearance.theme);
    return watchSystemTheme();
  }, [ready, data.settings.appearance.theme]);

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <MobileNav />
      {/*
        Bottom clearance derived from the bar it has to clear, not guessed.
        MobileNav is `h-16` (4rem) plus `pb-[env(safe-area-inset-bottom)]`, so
        4rem + the inset is the exact overlap and the extra 1rem is the gap.
        The old flat `pb-24` was both too much on an ordinary phone (96px of
        dead space under every short page) and too little on a device with a
        home indicator, where the bar grows past 96px and clipped the last row.
      */}
      <main className="pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-[248px] print:p-0">
        <PrintHeader />
        {!ready ? (
          <div className="flex min-h-dvh items-center justify-center">
            <div className="h-6 w-6 animate-pulse rounded-full border-2 border-line-strong border-t-accent" />
          </div>
        ) : (
          children
        )}
      </main>
      <QuickAdd />
      <TimerDock />
      <FocusMode />
      <Toaster />
      <RegisterSW />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <UIProvider>
      <Shell>{children}</Shell>
    </UIProvider>
  );
}

export { LAST_SECTION_KEY };
