import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SignupStepIndicatorProps {
  currentStep: 1 | 2;
}

const stepLabels = ['Account', 'Workspace setup'] as const;

export function SignupStepIndicator({ currentStep }: SignupStepIndicatorProps) {
  return (
    <div className="rounded-2xl border border-slate-300 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-accent-blue">Step {currentStep} of 2</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {stepLabels.map((label, index) => {
          const stepNumber = (index + 1) as 1 | 2;
          const isDone = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <div
              key={label}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm',
                isCurrent
                  ? 'border-accent-blue/35 bg-accent-blue/10 text-slate-900'
                  : 'border-slate-300 bg-slate-50 text-slate-600',
              )}
            >
              {isDone ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <Circle className="h-4 w-4" />}
              <span className={cn(isCurrent && 'font-semibold')}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
