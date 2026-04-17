import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative rounded-2xl border border-slate-300 bg-white shadow-card',
        className,
      )}
      {...props}
    />
  );
}
