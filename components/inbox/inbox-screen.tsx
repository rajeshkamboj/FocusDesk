'use client';

import { useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/card';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/menu';
import { ConfirmDialog } from '@/components/ui/confirm';
import { IconArrowRight, IconInbox, IconPlus, IconTrash } from '@/components/ui/icons';
import { PageHeader } from '@/components/layout/page-header';
import { useUI } from '@/components/ui/ui-provider';
import { formatShortDate, todayISO } from '@/lib/dates';
import type { InboxItem } from '@/lib/types';

/**
 * The Inbox: capture anything, decide what it is later.
 */
export function InboxScreen() {
  const { data, actions } = useData();
  const { openQuickAdd } = useUI();
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<InboxItem | undefined>(undefined);

  const submit = async () => {
    const title = draft.trim();
    if (!title) return;
    await actions.addInboxItem(title);
    setDraft('');
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8 sm:px-8 sm:pt-10">
      <PageHeader
        title="Inbox"
        subtitle="Capture without deciding. Convert anything into a task, project, goal or idea when you are ready."
      />

      {/* Quick capture */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mb-3 flex gap-2.5"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="+ Quick Capture — what's on your mind?"
          className="h-12 flex-1 rounded-xl border border-line bg-surface px-4 text-[15px] text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <Button type="submit" variant="primary" size="lg" disabled={!draft.trim()}>
          <IconPlus width={16} height={16} />
          Capture
        </Button>
      </form>
      <p className="mb-7 text-[11px] text-ink-3">
        Tip: press <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-sans">Ctrl + Shift + Space</kbd>{' '}
        anywhere to capture instantly.{' '}
        <button onClick={openQuickAdd} className="underline underline-offset-2 hover:text-ink-2">
          Try it now
        </button>
      </p>

      {data.inbox.length === 0 ? (
        <EmptyState
          icon={<IconInbox width={24} height={24} />}
          title="Your inbox is empty"
          hint="Anything you capture lands here first — thoughts, ideas, reminders — until you decide what each one becomes."
        />
      ) : (
        <div className="space-y-2">
          {data.inbox.map((item) => (
            <div
              key={item.id}
              className="group flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-card"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-snug text-ink">{item.title}</p>
                {item.note ? <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{item.note}</p> : null}
                <p className="mt-1 text-[11px] text-ink-3">Captured {formatShortDate(item.createdAt.slice(0, 10))}</p>
              </div>

              <Menu
                trigger={({ toggle }) => (
                  <button
                    onClick={toggle}
                    className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-2 opacity-0 transition-all hover:border-line-strong hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <IconArrowRight width={13} height={13} /> Convert
                    </span>
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <MenuLabel>Turn into</MenuLabel>
                    <MenuItem onClick={() => { void actions.convertInboxItem(item.id, 'task', { scheduledDate: todayISO(), status: 'today' }); close(); }}>
                      Task (today)
                    </MenuItem>
                    <MenuItem onClick={() => { void actions.convertInboxItem(item.id, 'task'); close(); }}>
                      Task (unscheduled)
                    </MenuItem>
                    <MenuItem onClick={() => { void actions.convertInboxItem(item.id, 'someday'); close(); }}>
                      Someday
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem onClick={() => { void actions.convertInboxItem(item.id, 'project'); close(); }}>
                      Project
                    </MenuItem>
                    <MenuItem onClick={() => { void actions.convertInboxItem(item.id, 'goal'); close(); }}>
                      Goal
                    </MenuItem>
                    <MenuItem onClick={() => { void actions.convertInboxItem(item.id, 'idea'); close(); }}>
                      Idea
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem danger onClick={() => { setDeleting(item); close(); }}>
                      <IconTrash width={13} height={13} /> Delete
                    </MenuItem>
                  </>
                )}
              </Menu>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== undefined}
        title="Delete inbox item?"
        message={`“${deleting?.title ?? ''}” will be permanently removed.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleting(undefined)}
        onConfirm={() => {
          if (deleting) void actions.deleteInboxItem(deleting.id);
          setDeleting(undefined);
        }}
      />
    </div>
  );
}
