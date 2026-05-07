import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative rounded-[12px] border border-slate-300 bg-white shadow-card',
        className,
      )}
      {...props}
    />
  );
}
