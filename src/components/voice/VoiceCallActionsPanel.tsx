import type { VoiceOpsActionRunRecord, VoiceOpsCallRecord } from '../../lib/voice-ops-service';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface VoiceCallActionsPanelProps {
  call: VoiceOpsCallRecord;
  actionRuns: VoiceOpsActionRunRecord[];
  retryingLead: boolean;
  retryingActionId: string | null;
  resolvingReview: boolean;
  onRetryLeadCreate: () => Promise<void> | void;
  onRetryAction: (actionRunId: string) => Promise<void> | void;
  onResolveReview: (reviewStatus: 'open' | 'resolved' | 'dismissed') => Promise<void> | void;
}

export function VoiceCallActionsPanel({
  call,
  actionRuns,
  retryingLead,
  retryingActionId,
  resolvingReview,
  onRetryLeadCreate,
  onRetryAction,
  onResolveReview,
}: VoiceCallActionsPanelProps) {
  const canRetryLead = !call.record_id && call.gather_result && call.outcome_status !== 'lead_created';
  const failedRuns = actionRuns.filter((run) => run.status === 'failed');

  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-[0.28em] text-accent-blue">Recovery actions</div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={onRetryLeadCreate} disabled={!canRetryLead} loading={retryingLead}>
          Retry lead create
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => onResolveReview('resolved')} loading={resolvingReview}>
          Resolve review
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onResolveReview('dismissed')} loading={resolvingReview}>
          Dismiss
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onResolveReview('open')} loading={resolvingReview}>
          Re-open
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        {actionRuns.length === 0 ? (
          <div className="text-sm text-slate-600">No voice action runs have been queued for this call yet.</div>
        ) : actionRuns.map((run) => (
          <div key={run.id} className="rounded-3xl border border-slate-300 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium text-slate-900">{run.action_type}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {run.status} • attempts {run.attempt_count}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRetryAction(run.id)}
                disabled={run.status !== 'failed'}
                loading={retryingActionId === run.id}
              >
                Retry action
              </Button>
            </div>
            {run.last_error ? <div className="mt-2 text-xs text-rose-200">{run.last_error}</div> : null}
          </div>
        ))}
      </div>

      {failedRuns.length > 0 ? (
        <div className="mt-4 text-xs text-slate-500">
          Failed actions stay durable here until they are retried or superseded by operator review.
        </div>
      ) : null}
    </Card>
  );
}
