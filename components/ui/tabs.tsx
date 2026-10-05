'use client';

export interface TabItem {
  id: string;
  label: string;
}

export function Tabs({
  items,
  active,
  onChange,
  className = '',
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    /*
     * Two elements on purpose.
     *
     * The outer one is the viewport: `max-w-full min-w-0` means it can never
     * be wider than whatever contains it (and stays content-sized when it is
     * dropped into a flex row, such as PageHeader's `actions`), while
     * `.scroll-strip` makes any excess scroll inside the control instead of
     * dragging the document sideways. The seven-item Tasks filter is ~570px
     * wide — wider than every phone we support — and because a flex item will
     * not shrink below its own content, the old single `inline-flex` pushed
     * the whole Tasks page into horizontal scroll at 320–430px.
     *
     * The inner one is the pill: `w-max` keeps the border hugging the buttons
     * (an `inline-flex` inside a block scroll container would otherwise be
     * clamped to the container width and clip its own children), and the
     * buttons keep their full padding and 13px type — the row scrolls rather
     * than the labels getting squeezed.
     */
    <div className={`scroll-strip max-w-full min-w-0 ${className}`}>
      <div className="inline-flex w-max items-center gap-1 rounded-xl border border-line bg-surface p-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            // `whitespace-nowrap` is safe — and necessary — here precisely
            // because the strip above scrolls: a label may leave the viewport,
            // it may never break onto a second line inside its own chip.
            className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150 ${
              active === item.id
                ? 'bg-accent text-white shadow-[0_1px_2px_rgba(0,0,0,0.1)]'
                : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
