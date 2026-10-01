'use client';

/**
 * Degraded-load warning.
 *
 * Shown when the backend served only part of the data — almost always because
 * a migration was never run against the database. The app stays usable (the
 * collections that did load are live), so this is a quiet, dismissible banner
 * with the one thing the user needs: which SQL file repairs the missing
 * section.
 */

import { useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { Button } from '@/components/ui/button';
import { IconChevronDown, IconX } from '@/components/ui/icons';

export function DataWarning() {
  const { loadIssues, dismissLoadIssues, reload, repoKind } = useData();
  const [open, setOpen] = useState(false);

  if (loadIssues.length === 0) return null;

  const headline =
    loadIssues.length === 1
      ? `${loadIssues[0].label} could not be loaded`
      : `${loadIssues.length} sections could not be loaded`;
  const affected = loadIssues.map((issue) => issue.label).join(', ');

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pt-8 sm:px-8 sm:pt-10 2xl:max-w-6xl">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-warning-soft/60 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-ink">{headline}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
            {repoKind === 'supabase' ? (
              <>
                Everything else loaded normally, so the rest of the app is unaffected — but your database is
                missing part of the schema ({affected}). Run the SQL below in the Supabase editor, then reload
                the data.
              </>
            ) : (
              <>Everything else loaded normally, so the rest of the app is unaffected. Local storage may be
              unavailable or full ({affected}).</>
            )}
          </p>

          {repoKind === 'supabase' ? (
            <>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-2 transition-colors hover:text-ink"
              >
                <IconChevronDown
                  width={13}
                  height={13}
                  className={`transition-transform ${open ? 'rotate-180' : ''}`}
                />
                {open ? 'Hide what to run' : 'What to run'}
              </button>

              {open ? (
                <ul className="mt-2 space-y-1.5">
                  {loadIssues.map((issue) => (
                    <li key={String(issue.key)} className="text-[12.5px] leading-relaxed text-ink-2">
                      <span className="font-medium text-ink">{issue.label}</span>
                      {' — run '}
                      <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11.5px] text-ink">
                        {issue.fix}
                      </code>
                      <br />
                      <span className="text-ink-3">{issue.message}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="secondary" onClick={reload}>
            Try again
          </Button>
          <button
            type="button"
            onClick={dismissLoadIssues}
            aria-label="Dismiss"
            className="rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <IconX width={15} height={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
