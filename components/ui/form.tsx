import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

const controlClass =
  'w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-3 transition-colors duration-150 hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`h-10 ${controlClass} ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`min-h-24 py-2.5 leading-relaxed ${controlClass} ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={`h-10 w-full cursor-pointer appearance-none rounded-xl border border-line bg-surface bg-[url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2216%22%20height=%2216%22%20viewBox=%220%200%2024%2024%22%20fill=%22none%22%20stroke=%22%238b8d81%22%20stroke-width=%222%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22><polyline%20points=%226%209%2012%2015%2018%209%22/></svg>')] bg-[length:16px_16px] bg-[right_0.75rem_center] bg-no-repeat px-3.5 pr-9 text-sm text-ink transition-colors duration-150 hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-ink">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-all duration-150 ${
          checked ? 'border-accent bg-accent text-white' : 'border-line-strong bg-surface hover:border-accent'
        }`}
      >
        {checked ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 5 5L20 7" />
          </svg>
        ) : null}
      </button>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
