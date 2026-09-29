'use client';

import { useData } from '@/components/data/data-provider';

export function Toaster() {
  const { toasts, dismissToast } = useData();
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2 sm:bottom-6">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className="animate-rise-in pointer-events-auto rounded-full border border-line-strong/60 bg-ink px-4 py-2 text-[13px] font-medium text-background shadow-pop"
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
