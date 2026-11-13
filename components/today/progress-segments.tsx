import { IconClock, IconGoals } from '@/components/ui/icons';

export function ProgressSegments({
  done,
  total,
  plannedMinutes = 0,
}: {
  done: number;
  total: number;
  plannedMinutes?: number;
}) {
  const safeTotal = Math.max(0, total);
  const safeDone = Math.max(0, done);
  const percent = safeTotal > 0 ? Math.min(100, Math.round((safeDone / safeTotal) * 100)) : 0;
  const remaining = Math.max(0, safeTotal - safeDone);
  const message = safeTotal === 0
    ? 'Add a task to get started.'
    : remaining === 0
      ? 'All done for today. Nice work.'
      : 'Keep going. One step at a time.';

  return (
    <section
      aria-label="Today's progress"
      className="h-full min-h-[130px] rounded-2xl border border-line bg-surface px-4 py-4 shadow-card"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <IconGoals width={21} height={21} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-3">
            Today&apos;s progress
          </p>
          <p className="mt-1 whitespace-nowrap text-[19px] font-semibold leading-none tracking-tight text-ink tabular-nums">
            {safeDone}
            <span className="ml-1.5 text-[13px] font-medium text-ink-3">/ {safeTotal} tasks</span>
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[22px] font-semibold leading-none tracking-tight text-accent tabular-nums">
            {percent}%
          </p>
          <p className="mt-1 text-[10px] text-ink-3">completed</p>
        </div>
      </div>

      <div className="mt-4">
        <div
          role="progressbar"
          aria-label="Today's task completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${safeDone} of ${safeTotal} tasks completed`}
          className="h-2.5 overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 text-[10px] leading-relaxed text-ink-3">{message}</p>
        <span className="shrink-0 text-[10px] font-medium text-ink-2 tabular-nums">
          {safeTotal === 0 ? 'No tasks' : `${remaining} remaining`}
        </span>
      </div>

      {plannedMinutes > 0 ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-ink-3">
          <IconClock width={12} height={12} />
          {Math.floor(plannedMinutes / 60) > 0 ? `${Math.floor(plannedMinutes / 60)}h ` : ''}
          {plannedMinutes % 60 > 0 ? `${plannedMinutes % 60}m` : ''}
          {' '}of work planned
        </p>
      ) : null}
    </section>
  );
}
