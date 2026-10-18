'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useData } from '@/components/data/data-provider';
import { NAV_ITEMS } from './nav';

export function Sidebar() {
  const pathname = usePathname();
  const { data, ready, repoKind } = useData();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface lg:flex">
      <div className="flex items-center shrink-0 gap-2.5 px-6 pb-2 pt-6">
        <BrandMark />
        <div>
          <div className="text-[15px] font-semibold leading-tight tracking-tight text-ink">Focus Desk</div>
          <div className="text-[11px] leading-tight text-ink-3">Personal execution system</div>
        </div>
      </div>

      <nav className="mt-4 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (pathname ?? '').startsWith(`${item.href}/`);
          const Icon = item.icon;
          // Inbox count is persisted in localStorage (browser-only state).
          // DataProvider keeps `ready` false for both SSR and the initial client
          // render, then exposes the persisted count after hydration.
          const count = item.href === '/inbox' && ready ? data.inbox.length : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 ${
                active
                  ? 'bg-accent-soft text-accent-ink'
                  : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              }`}
            >
              <Icon width={19} height={19} className={active ? 'text-accent' : 'text-ink-3 group-hover:text-ink-2'} />
              <span className="flex-1">{item.label}</span>
              {count > 0 ? (
                <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${active ? 'bg-accent text-white' : 'bg-surface-3 text-ink-2'}`}>
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <footer className="shrink-0 border-t border-line px-5 py-4 text-[11px] leading-relaxed text-ink-3">
        <p>
          {repoKind === 'supabase'
            ? 'Your data syncs with Supabase when connected.'
            : 'Your data stays on this device until Supabase sync is enabled.'}
        </p>
        <p className="mt-2 text-ink-2">
          Developed with love for <span className="font-medium text-ink">Rajesh Singh</span>
        </p>
        <div className="mt-2 flex items-center gap-2">
          <a href="https://pixldot.com/" target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-sm">
            <Image src="/Logo-2x.png" alt="PixlDot logo" width={24} height={24} className="h-6 w-auto" />
          </a>
          <span>
            Built by{' '}
            <a href="https://pixldot.com/" target="_blank" rel="noopener noreferrer" className="font-medium text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-accent-ink">
              PixlDot
            </a>
          </span>
        </div>
      </footer>
    </aside>
  );
}

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path
        d="M9 20.5c2.5 1.8 5 1.8 7 0s4.5-1.8 7 0"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="12" r="3.2" stroke="white" strokeWidth="2.2" />
    </svg>
  );
}
