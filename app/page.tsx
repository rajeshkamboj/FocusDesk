'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/components/data/data-provider';
import { LAST_SECTION_KEY } from '@/components/layout/app-shell';

/**
 * Entry point. Honors the "Start on Today" setting: when enabled the app
 * always opens on Today; otherwise it returns to the last visited section.
 */
export default function Home() {
  const router = useRouter();
  const { ready, data } = useData();

  useEffect(() => {
    if (!ready) return;
    let target = '/today';
    if (!data.settings.general.startOnToday) {
      try {
        const last = window.localStorage.getItem(LAST_SECTION_KEY);
        if (last && last.startsWith('/')) target = last;
      } catch {
        /* ignore */
      }
    }
    router.replace(target);
  }, [ready, data.settings.general.startOnToday, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="h-6 w-6 animate-pulse rounded-full border-2 border-line-strong border-t-accent" />
    </div>
  );
}
