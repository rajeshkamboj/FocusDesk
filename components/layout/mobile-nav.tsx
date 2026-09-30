'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { IconInbox, IconPlus, IconTasks, IconToday, IconMenu, IconX } from '@/components/ui/icons';
import { MOBILE_NAV_ITEMS, MORE_NAV_ITEMS } from './nav';
import { BrandMark } from './sidebar';
import { useUI } from '@/components/ui/ui-provider';

const ICONS = {
  '/today': IconToday,
  '/tasks': IconTasks,
  '/inbox': IconInbox,
} as const;

export function MobileNav() {
  const pathname = usePathname();
  const { data, ready } = useData();
  const { openQuickAdd } = useUI();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 animate-fade-in bg-ink/30" aria-label="Close menu" onClick={() => setMoreOpen(false)} />
          <div className="animate-rise-in absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-line bg-surface pb-8 pt-3 shadow-pop">
            <div className="mb-2 flex items-center justify-between px-5">
              <div className="flex items-center gap-2.5">
                <BrandMark size={26} />
                <span className="text-sm font-semibold text-ink">Pace</span>
              </div>
              <button className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2" aria-label="Close" onClick={() => setMoreOpen(false)}>
                <IconX width={18} height={18} />
              </button>
            </div>
            {MORE_NAV_ITEMS.map((item) => {
              const active = pathname === item.href || (pathname ?? '').startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-3 px-5 py-3 text-[15px] font-medium ${
                    active ? 'text-accent' : 'text-ink-2'
                  }`}
                >
                  <Icon width={20} height={20} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="flex h-16 items-center justify-around px-2">
          {MOBILE_NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (pathname ?? '').startsWith(`${item.href}/`);
            const Icon = ICONS[item.href as keyof typeof ICONS] ?? item.icon;
            const count = item.href === '/inbox' && ready ? data.inbox.length : 0;
            return (
              <Link key={item.href} href={item.href} className="relative flex w-16 flex-col items-center gap-1 py-1">
                <span className={`relative ${active ? 'text-accent' : 'text-ink-3'}`}>
                  <Icon width={22} height={22} />
                  {count > 0 ? (
                    <span className="absolute -right-2 -top-1 rounded-full bg-accent px-1 text-[9px] font-bold leading-3.5 text-white">
                      {count > 9 ? '9+' : count}
                    </span>
                  ) : null}
                </span>
                <span className={`text-[10px] font-medium ${active ? 'text-accent' : 'text-ink-3'}`}>{item.label}</span>
              </Link>
            );
          })}

          <button
            onClick={openQuickAdd}
            aria-label="Quick capture"
            className="flex w-14 flex-col items-center"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-pop">
              <IconPlus width={20} height={20} />
            </span>
          </button>

          <button
            onClick={() => setMoreOpen(true)}
            className="flex w-16 flex-col items-center gap-1 py-1"
            aria-label="More sections"
          >
            <span className="text-ink-3">
              <IconMenu width={22} height={22} />
            </span>
            <span className="text-[10px] font-medium text-ink-3">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
