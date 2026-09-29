'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useData } from '@/components/data/data-provider';
import { UIProvider } from '@/components/ui/ui-provider';
import { Toaster } from '@/components/ui/toaster';
import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';
import { QuickAdd } from './quick-add';
import { FocusMode } from './focus-mode';
import { RegisterSW } from '@/components/pwa/register-sw';
import { useNotificationScheduler } from '@/lib/notifications';
import { applyTheme, watchSystemTheme } from '@/lib/theme';

const LAST_SECTION_KEY = 'pace.lastSection';

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, data } = useData();
  useNotificationScheduler();

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
      <main className="pb-24 lg:pb-0 lg:pl-[248px]">
        {!ready ? (
          <div className="flex min-h-dvh items-center justify-center">
            <div className="h-6 w-6 animate-pulse rounded-full border-2 border-line-strong border-t-accent" />
          </div>
        ) : (
          children
        )}
      </main>
      <QuickAdd />
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
