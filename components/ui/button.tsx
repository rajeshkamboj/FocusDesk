import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover active:scale-[0.98] shadow-[0_1px_2px_rgba(0,0,0,0.08)]',
  secondary:
    'bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2 active:scale-[0.98]',
  soft: 'bg-accent-soft text-accent-ink hover:opacity-85 active:scale-[0.98]',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2',
  danger: 'bg-danger-soft text-danger hover:opacity-85 active:scale-[0.98]',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl',
};

export function Button({ variant = 'secondary', size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      /* `print:hidden` — every Button in this app is an action, and
         actions have no place on paper (the print buttons included:
         once the dialog is open, the page behind it is the output). */
      className={`inline-flex select-none items-center justify-center font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-45 print:hidden ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
