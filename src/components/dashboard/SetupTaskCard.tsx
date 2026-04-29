import { CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { buttonStyles } from '../ui/Button';

type SetupTaskStatus = 'pending' | 'completed';
type SetupTaskTone = 'number' | 'assistant' | 'email';

interface SetupTaskCardProps {
  stepNumber: number;
  title: string;
  description: string;
  icon: ReactNode;
  status: SetupTaskStatus;
  tone: SetupTaskTone;
  isRecommended?: boolean;
  buttonLabel: string;
  to: string;
  onClick?: () => void;
}

export function SetupTaskCard({
  stepNumber,
  title,
  description,
  icon,
  status,
  tone,
  isRecommended = false,
  buttonLabel,
  to,
  onClick,
}: SetupTaskCardProps) {
  const isCompleted = status === 'completed';
  const statusLabel = isCompleted ? 'Completed' : 'Pending / Not started';
  const toneStyles: Record<
    SetupTaskTone,
    {
      card: string;
      pendingCard: string;
      iconWrap: string;
      chip: string;
      actionButton: string;
    }
  > = {
    number: {
      card: 'from-cyan-100/85 via-teal-50/85 to-sky-100/85 border-cyan-200/80',
      pendingCard: 'from-cyan-100/70 via-teal-50/70 to-sky-100/70 border-cyan-200/70',
      iconWrap: 'border-cyan-200 bg-cyan-100 text-cyan-800',
      chip: 'border-cyan-200 bg-cyan-100 text-cyan-800',
      actionButton:
        'border-cyan-500/70 bg-gradient-to-r from-cyan-600 to-teal-600 text-white hover:from-cyan-700 hover:to-teal-700',
    },
    assistant: {
      card: 'from-indigo-100/85 via-violet-50/85 to-blue-100/85 border-indigo-200/80',
      pendingCard: 'from-indigo-100/70 via-violet-50/70 to-blue-100/70 border-indigo-200/70',
      iconWrap: 'border-indigo-200 bg-indigo-100 text-indigo-800',
      chip: 'border-indigo-200 bg-indigo-100 text-indigo-800',
      actionButton:
        'border-indigo-500/70 bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700',
    },
    email: {
      card: 'from-amber-100/85 via-orange-50/85 to-rose-100/85 border-amber-200/80',
      pendingCard: 'from-amber-100/70 via-orange-50/70 to-rose-100/70 border-amber-200/70',
      iconWrap: 'border-amber-200 bg-amber-100 text-amber-800',
      chip: 'border-amber-200 bg-amber-100 text-amber-800',
      actionButton:
        'border-amber-500/70 bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-700 hover:to-orange-700',
    },
  };
  const currentTone = toneStyles[tone];
  const actionButtonClass = isRecommended
    ? 'border-indigo-500/70 bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 shadow-md shadow-indigo-500/25'
    : `${currentTone.actionButton} shadow-md`;

  return (
    <div
      className={`setup-task-surface rounded-2xl border bg-gradient-to-br p-5 transition-all duration-200 ${
        isRecommended
          ? 'setup-task-surface-recommended border-indigo-300 from-indigo-100/85 via-violet-50/85 to-cyan-100/80 shadow-sm hover:shadow-lg'
          : isCompleted
            ? `shadow-sm hover:shadow-lg ${currentTone.card}`
            : `shadow-sm hover:shadow-lg ${currentTone.pendingCard}`
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              isRecommended
                ? 'border-indigo-200 bg-indigo-100 text-indigo-700'
                : isCompleted
                  ? currentTone.iconWrap
                  : 'border-slate-200 bg-slate-100 text-slate-600'
            }`}
            aria-hidden
          >
            {icon}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Step {stepNumber}
              </span>
              {isRecommended ? (
                <span className="setup-recommended-chip rounded-full border px-2 py-0.5 text-[11px] font-semibold text-indigo-50">
                  Recommended
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-900">{title}</p>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
        </div>

        <div
          className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
            isCompleted ? currentTone.chip : 'border-amber-200 bg-amber-100 text-amber-800'
          }`}
        >
          {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : null}
          <span>{statusLabel}</span>
        </div>
      </div>

      <div className="mt-4">
        <Link
          to={to}
          onClick={onClick}
          className={`${buttonStyles(isRecommended ? 'primary' : 'secondary', 'sm')} ${actionButtonClass}`}
        >
          {buttonLabel}
        </Link>
      </div>
    </div>
  );
}
