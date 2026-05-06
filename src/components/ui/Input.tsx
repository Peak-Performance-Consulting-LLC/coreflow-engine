import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  rightElement?: ReactNode;
  fieldSize?: 'md' | 'lg';
}

export function Input({ label, error, hint, rightElement, className, fieldSize = 'md', ...props }: InputProps) {
  return (
    <label className="flex w-full flex-col gap-2 text-xs text-slate-800">
      <span className="font-semibold text-slate-900">{label}</span>
      <span
        className={cn(
          'relative flex items-center rounded-xl border bg-white px-4 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-all duration-200',
          fieldSize === 'lg' ? 'h-12 rounded-2xl' : 'h-10',
          error
            ? 'border-rose-400 ring-2 ring-rose-100'
            : 'border-slate-300/90 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-100/80',
        )}
      >
        <input
          className={cn(
            'h-full w-full bg-transparent text-slate-900 placeholder:text-slate-500',
            fieldSize === 'lg' ? 'text-[1.05rem]' : 'text-sm',
            rightElement ? 'pr-10' : '',
            className,
          )}
          {...props}
        />
        {rightElement ? <span className="absolute right-3 text-slate-500">{rightElement}</span> : null}
      </span>
      {error ? <span className="text-xs text-rose-500">{error}</span> : null}
      {!error && hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
