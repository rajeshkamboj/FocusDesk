'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useData } from '@/components/data/data-provider';
import { NAV_ITEMS } from './nav';

export function Sidebar() {
  const pathname = usePathname();
  const { data, ready } = useData();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface lg:flex print:hidden">
      <div className="flex items-center gap-2.5 px-6 pb-2 pt-6">
        <BrandMark />
        <div>
          <div className="text-[15px] font-semibold leading-tight tracking-tight text-ink">Pace</div>
          <div className="text-[11px] leading-tight text-ink-3">Personal execution system</div>
        </div>
      </div>

      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3">
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

      <div className="px-6 pb-5 pt-3 text-[11px] leading-relaxed text-ink-3">
        Your data stays on this device
        <br />
        until Supabase sync is enabled.
        <div className="mt-2">
          Built by{' '}
          <a href="https://pixldot.com" target="_blank" rel="noopener noreferrer" className="hover:text-ink-2">
            PixlDot
          </a>
        </div>
      </div>
    </aside>
  );
}

/**
 * The app's identity mark — the same master icon as the favicon, PWA install
 * icon and taskbar icon, so the brand is one image everywhere (see
 * scripts/generate-icons.mjs). Served at 192px and drawn at `size` px, which
 * is 2x-crisp on retina screens and sharp at 30px on standard ones.
 */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <Image
      src="/icons/icon-192.png"
      width={size}
      height={size}
      alt=""
      aria-hidden
      className="shrink-0 select-none"
      draggable={false}
    />
  );
}
