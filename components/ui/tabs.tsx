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
    <div className={`inline-flex items-center gap-1 rounded-xl border border-line bg-surface p-1 ${className}`}>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150 ${
            active === item.id
              ? 'bg-accent text-white shadow-[0_1px_2px_rgba(0,0,0,0.1)]'
              : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
