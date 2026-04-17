import type { ReactNode } from 'react';
import { Card } from '../ui/Card';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <Card className="p-5 sm:p-6 bg-gradient-to-r from-indigo-500/5 via-blue-500/5 to-purple-500/5 border-l-4 border-indigo-500">
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

