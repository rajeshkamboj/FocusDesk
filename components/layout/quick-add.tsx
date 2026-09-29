'use client';

import { useEffect, useRef, useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { useUI } from '@/components/ui/ui-provider';
import { IconInbox } from '@/components/ui/icons';

/**
 * Global quick capture: Ctrl + Shift + Space.
 * Type, press Enter, done — it lands in the Inbox for later classification.
 */
export function QuickAdd() {
  const { quickAddOpen, openQuickAdd, closeQuickAdd } = useUI();
  const { actions, ready } = useData();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'Space') {
        e.preventDefault();
        openQuickAdd();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openQuickAdd]);

  const [wasOpen, setWasOpen] = useState(quickAddOpen);
  if (wasOpen !== quickAddOpen) {
    setWasOpen(quickAddOpen);
    if (quickAddOpen) setValue('');
  }

  if (!quickAddOpen) return null;

  const submit = async () => {
    const title = value.trim();
    if (!title || !ready) return;
    await actions.addInboxItem(title);
    setValue('');
    inputRef.current?.focus();
  };

  return (
    <div className="fixed inset-0 z-[60]">
      <button className="absolute inset-0 animate-fade-in bg-ink/30 backdrop-blur-[2px]" aria-label="Close" onClick={closeQuickAdd} />
      <div className="animate-rise-in relative mx-auto mt-[18vh] w-[92%] max-w-lg rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5 text-ink-3">
          <IconInbox width={18} height={18} />
          <span className="text-xs font-medium uppercase tracking-wider">Quick capture</span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            ref={inputRef}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeQuickAdd();
            }}
            placeholder="What do you want to capture?"
            className="w-full bg-transparent px-4 py-4 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
          <div className="flex items-center justify-between px-4 pb-3.5 text-[11px] text-ink-3">
            <span>
              Saved to <span className="font-medium text-ink-2">Inbox</span> — decide what it is later.
            </span>
            <span>
              <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-sans">Enter</kbd> to save
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
