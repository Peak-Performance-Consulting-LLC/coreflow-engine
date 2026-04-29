import { Bot, Mail, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buttonStyles } from '../ui/Button';
import { SetupTaskCard } from './SetupTaskCard';

export interface WorkspaceSetupActionItem {
  id: string;
  title: string;
  description: string;
  to: string;
  configured: boolean;
  actionLabel: string;
}

interface WorkspaceSetupChecklistProps {
  actions: WorkspaceSetupActionItem[];
}

export function WorkspaceSetupChecklist({ actions }: WorkspaceSetupChecklistProps) {
  const totalSteps = actions.length;
  const completedCount = actions.filter((action) => action.configured).length;
  const progress = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;
  const firstIncompleteId = actions.find((action) => !action.configured)?.id;
  const isSetupComplete = totalSteps > 0 && completedCount === totalSteps;

  function getStepTone(stepId: string) {
    if (stepId === 'setup-number') {
      return 'number' as const;
    }
    if (stepId === 'setup-assistant') {
      return 'assistant' as const;
    }
    return 'email' as const;
  }

  function getStepIcon(stepId: string) {
    if (stepId === 'setup-number') {
      return <Phone className="h-4 w-4" />;
    }
    if (stepId === 'setup-assistant') {
      return <Bot className="h-4 w-4" />;
    }
    return <Mail className="h-4 w-4" />;
  }

  function getManageButtonClass(stepId: string) {
    if (stepId === 'setup-number') {
      return 'border-cyan-500/70 bg-gradient-to-r from-cyan-600 to-teal-600 text-white hover:from-cyan-700 hover:to-teal-700 shadow-md shadow-cyan-500/25';
    }
    if (stepId === 'setup-assistant') {
      return 'border-indigo-500/70 bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 shadow-md shadow-indigo-500/25';
    }
    return 'border-amber-500/70 bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-700 hover:to-orange-700 shadow-md shadow-amber-500/25';
  }

  return (
    <div className="space-y-3.5">
      <div className="setup-progress-surface rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-indigo-100/85 via-sky-50/85 to-cyan-100/85 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-indigo-950">
            {completedCount} of {totalSteps} completed
          </p>
          <p className="text-xs text-indigo-700/80">Workspace setup progress</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-indigo-200/60">
          <div
            className="setup-progress-fill h-full rounded-full bg-gradient-to-r from-indigo-600 via-violet-500 to-cyan-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={totalSteps}
            aria-valuenow={completedCount}
            aria-label="Workspace setup progress"
          />
        </div>
      </div>

      {isSetupComplete ? (
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-100/80 via-teal-50/85 to-cyan-100/70 p-5 shadow-sm">
          <p className="text-sm font-semibold text-emerald-900">Workspace setup complete</p>
          <p className="mt-1 text-sm text-emerald-800/90">
            All core channels are configured. You can jump in and manage settings any time.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {actions.map((action) => (
              <Link
                key={action.id}
                to={action.to}
                className={`${buttonStyles('secondary', 'sm')} ${getManageButtonClass(action.id)}`}
              >
                {action.id === 'setup-number'
                  ? 'Manage number'
                  : action.id === 'setup-assistant'
                    ? 'Manage assistant'
                    : 'Manage email'}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {!isSetupComplete
        ? actions.map((action, index) => (
            <SetupTaskCard
              key={action.id}
              stepNumber={index + 1}
              title={action.title}
              description={action.description}
              icon={getStepIcon(action.id)}
              tone={getStepTone(action.id)}
              status={action.configured ? 'completed' : 'pending'}
              isRecommended={!action.configured && action.id === firstIncompleteId}
              buttonLabel={action.actionLabel}
              to={action.to}
            />
          ))
        : null}
    </div>
  );
}
