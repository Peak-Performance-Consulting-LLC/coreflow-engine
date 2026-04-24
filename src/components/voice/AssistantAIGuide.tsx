import { Sparkles } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { cn } from '../../lib/utils';

interface AssistantAIGuideProps {
  title: string;
  body: string;
  buttonLabel?: string;
  onAction?: () => void;
  className?: string;
  variant?: 'page' | 'modal';
}

export function AssistantAIGuide({
  title,
  body,
  buttonLabel,
  onAction,
  className,
  variant = 'page',
}: AssistantAIGuideProps) {
  return (
    <Card
      className={cn(
        'overflow-hidden border-slate-200',
        variant === 'page' ? 'bg-indigo-50/70' : 'bg-slate-50',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="flex min-w-0 gap-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
              variant === 'page' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600',
            )}
          >
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
          </div>
        </div>
        {buttonLabel && onAction ? (
          <Button type="button" variant={variant === 'page' ? 'primary' : 'secondary'} onClick={onAction}>
            {buttonLabel}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
