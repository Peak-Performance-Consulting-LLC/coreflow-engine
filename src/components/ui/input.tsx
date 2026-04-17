import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  rightElement?: ReactNode;
}

export function Input({ label, error, hint, rightElement, className, ...props }: InputProps) {
  return (
    <label className="flex w-full flex-col gap-1.5 text-sm text-slate-800">
      <span className="font-semibold text-slate-800">{label}</span>
      <span
        className={cn(
          'relative flex h-11 items-center rounded-xl border bg-white px-3.5 transition-all',
          error
            ? 'border-rose-400 ring-2 ring-rose-100'
            : 'border-slate-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100',
        )}
      >
        <input
          className={cn(
            'h-full w-full bg-transparent text-[15px] text-slate-900 placeholder:text-slate-500',
            rightElement ? 'pr-10' : '',
            className,
          )}
          {...props}
        />
        {rightElement ? <span className="absolute right-3.5 text-slate-500">{rightElement}</span> : null}
      </span>
      {error ? <span className="text-xs text-rose-500">{error}</span> : null}
      {!error && hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
