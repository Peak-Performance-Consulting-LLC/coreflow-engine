import type { ReactNode } from 'react';
import { Card } from '../ui/Card';
import { cn } from '../../lib/utils';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  tone?: 'accent' | 'neutral';
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, tone = 'accent', className }: PageHeaderProps) {
  return (
    <Card
      className={cn(
        'relative overflow-hidden border border-white/60 p-5 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.55)] backdrop-blur-xl sm:p-6',
        tone === 'accent'
          ? 'bg-[linear-gradient(135deg,rgba(255,255,255,0.82)_0%,rgba(244,248,255,0.78)_55%,rgba(238,246,255,0.8)_100%)]'
          : 'bg-[linear-gradient(135deg,rgba(255,255,255,0.78)_0%,rgba(247,249,252,0.76)_58%,rgba(242,247,253,0.78)_100%)]',
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.16)_0%,rgba(99,102,241,0)_72%)]" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.14)_0%,rgba(56,189,248,0)_72%)]" />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-600">{eyebrow}</div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {title}
          </h1>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </Card>
  );
}

