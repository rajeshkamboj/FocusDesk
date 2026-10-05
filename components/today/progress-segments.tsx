export function ProgressSegments({ done, total }: { done: number; total: number }) {
  const percent = total ? Math.round(done / total * 100) : 0;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
        <span className="font-semibold uppercase tracking-[0.12em] text-ink-2">Today&apos;s progress</span>
        <span className="tabular-nums text-ink-2">{done} of {total} completed · <strong className="text-accent">{percent}%</strong></span>
      </div>
      <div role="progressbar" aria-label="Today's task completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${done} of ${total} tasks completed`} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(total || 1, 20)}, minmax(0, 1fr))` }}>
        {Array.from({ length: total || 1 }, (_, i) => <span key={i} className={`h-2 rounded-full ${i < done ? 'bg-accent' : 'bg-surface-3'}`} />)}
      </div>
    </div>
  );
}
