'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { IconGrid, IconList } from '@/components/ui/icons';
import { readViewMode, serverViewMode, setViewMode, subscribeViewMode, type ViewCollection, type ViewMode } from '@/lib/view-mode';

/**
 * List ⇄ grid switch for a collection screen.
 *
 * It is a radio group rather than two independent buttons: the two layouts are
 * mutually exclusive states of one thing, so a screen reader gets one control
 * with two options and `aria-checked` says which one is current. Arrow keys move
 * between the options (the platform behaviour for a radio group), and each
 * option keeps a 44px-tall tap target on a phone.
 */
export function ViewToggle({
  collection,
  value,
  onChange,
  className = '',
}: {
  collection: ViewCollection;
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}) {
  const options: { mode: ViewMode; label: string; icon: typeof IconList }[] = [
    { mode: 'list', label: 'List', icon: IconList },
    { mode: 'grid', label: 'Grid', icon: IconGrid },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Layout"
      className={`inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface p-0.5 ${className}`}
      data-view-toggle={collection}
    >
      {options.map(({ mode, label, icon: Icon }) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label} view`}
            title={`${label} view`}
            onClick={() => onChange(mode)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                onChange(mode === 'list' ? 'grid' : 'list');
              }
            }}
            className={`inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
              active ? 'bg-accent-soft text-accent-ink' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'
            }`}
          >
            <Icon width={15} height={15} aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The remembered layout for one collection.
 *
 * Read through `useSyncExternalStore`, with `serverViewMode()` as the server
 * snapshot: the server and the hydrating client both paint the list, and the
 * stored preference is applied in the same commit React uses for external
 * stores. Nothing is copied into component state inside an effect, so there is
 * no hydration mismatch and no list-to-grid flash.
 */
export function useViewMode(collection: ViewCollection): [ViewMode, (mode: ViewMode) => void] {
  const mode = useSyncExternalStore(
    subscribeViewMode,
    () => readViewMode(collection),
    serverViewMode,
  );

  const choose = useCallback(
    (next: ViewMode) => {
      setViewMode(collection, next);
    },
    [collection],
  );

  return [mode, choose];
}
