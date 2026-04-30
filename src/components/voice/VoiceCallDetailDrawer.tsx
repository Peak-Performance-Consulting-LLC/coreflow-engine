import { X } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { VoiceCallDetailResponse } from '../../lib/voice-ops-service';
import { Button } from '../ui/Button';
import { VoiceCallActionsPanel } from './VoiceCallActionsPanel';
import { VoiceCallArtifactsPanel } from './VoiceCallArtifactsPanel';

function formatDateTime(value: string | null) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getPendingJobDelayMinutes(value: string) {
  const availableAt = Date.parse(value);

  if (!Number.isFinite(availableAt)) {
    return null;
  }

  return (Date.now() - availableAt) / 60_000;
}

function getStalledPipelineHint(detail: VoiceCallDetailResponse) {
  const pendingPostCallJob = detail.processing_jobs.find(
    (job) => job.job_type === 'post_call_pipeline' && job.status === 'pending',
  );

  if (!pendingPostCallJob || pendingPostCallJob.attempt_count > 0) {
    return null;
  }

  const pendingMinutes = getPendingJobDelayMinutes(pendingPostCallJob.available_at);

  if (pendingMinutes === null || pendingMinutes < 2) {
    return null;
  }

  return 'Lead creation has not started because the background voice worker has not picked up this job. Check the Vercel voice cron route and the VOICE_JOBS_CRON_SECRET / SUPABASE_URL server environment variables.';
}

interface VoiceCallDetailDrawerProps {
  isOpen: boolean;
  detail: VoiceCallDetailResponse | null;
  loading: boolean;
  retryingLead: boolean;
  retryingActionId: string | null;
  resolvingReview: boolean;
  onClose: () => void;
  onRetryLeadCreate: () => Promise<void> | void;
  onRetryAction: (actionRunId: string) => Promise<void> | void;
  onResolveReview: (reviewStatus: 'open' | 'resolved' | 'dismissed') => Promise<void> | void;
}

export function VoiceCallDetailDrawer({
  isOpen,
  detail,
  loading,
  retryingLead,
  retryingActionId,
  resolvingReview,
  onClose,
  onRetryLeadCreate,
  onRetryAction,
  onResolveReview,
}: VoiceCallDetailDrawerProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const stalledPipelineHint = detail ? getStalledPipelineHint(detail) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close voice call details"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
      />

      <aside className="voice-call-detail-shell relative z-10 flex h-[min(92vh,980px)] w-full max-w-6xl flex-col overflow-hidden rounded-[30px] border border-slate-200 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.62)]">
        <div className="relative z-10 flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] voice-call-chip">
              Voice call
            </div>
            <h2 className="mt-3 truncate font-display text-2xl text-slate-900">
              {detail?.call.from_number_e164 ?? 'Loading...'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {detail?.call.outcome_status ?? 'Inspect routing, gather, CRM creation, and recovery actions.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white/85 text-slate-700 transition hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {loading || !detail ? (
            <div className="text-sm text-slate-600">Loading voice call detail...</div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="voice-call-stat rounded-3xl p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Assistant</div>
                  <div className="mt-2 text-base font-medium text-slate-900">
                    {detail.call.voice_agent_name ?? detail.call.runtime_mode}
                  </div>
                </div>
                <div className="voice-call-stat rounded-3xl p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Number</div>
                  <div className="mt-2 text-base font-medium text-slate-900">
                    {detail.call.phone_number_e164_label ?? detail.call.to_number_e164}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Last webhook: {formatDateTime(detail.call.voice_number_last_webhook_observed_at ?? null)}
                  </div>
                </div>
                <div className="voice-call-stat rounded-3xl p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Gather</div>
                  <div className="mt-2 text-base font-medium text-slate-900">{detail.call.gather_status}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {detail.call.provider_gather_status ?? 'No provider gather status'}
                  </div>
                </div>
                <div className="voice-call-stat rounded-3xl p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Review</div>
                  <div className="mt-2 text-base font-medium text-slate-900">{detail.call.review_status}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {detail.call.outcome_error ?? detail.call.outcome_reason ?? 'No failure note'}
                  </div>
                </div>
              </div>

              <div className="voice-call-section rounded-3xl p-5 text-sm text-slate-700">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Created</div>
                    <div className="mt-1 font-medium text-slate-900">{formatDateTime(detail.call.created_at)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Ended</div>
                    <div className="mt-1 font-medium text-slate-900">{formatDateTime(detail.call.ended_at)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Runtime mode</div>
                    <div className="mt-1 font-medium text-slate-900">{detail.call.runtime_mode}</div>
                  </div>
                </div>
                {detail.call.record_id ? (
                  <div className="mt-4">
                    <Link className="text-sm font-medium text-accent-blue hover:text-accent-blue" to={`/records/${detail.call.record_id}`}>
                      Open linked CRM record
                    </Link>
                  </div>
                ) : null}
              </div>

              <VoiceCallActionsPanel
                call={detail.call}
                actionRuns={detail.action_runs}
                retryingLead={retryingLead}
                retryingActionId={retryingActionId}
                resolvingReview={resolvingReview}
                onRetryLeadCreate={onRetryLeadCreate}
                onRetryAction={onRetryAction}
                onResolveReview={onResolveReview}
              />

              <VoiceCallArtifactsPanel call={detail.call} />

              <section className="voice-call-section rounded-3xl p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-accent-blue">Processing jobs</div>
                <div className="mt-4 space-y-3">
                  {stalledPipelineHint ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      {stalledPipelineHint}
                    </div>
                  ) : null}
                  {detail.processing_jobs.length === 0 ? (
                    <div className="text-sm text-slate-500">No background jobs recorded for this call yet.</div>
                  ) : (
                    detail.processing_jobs.map((job) => (
                      <div
                        key={job.id}
                        className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-[0_10px_22px_-22px_rgba(15,23,42,0.45)]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium text-slate-900">{job.job_type}</div>
                          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{job.status}</div>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          Attempts: {job.attempt_count}/{job.max_attempts} · Available: {formatDateTime(job.available_at)}
                        </div>
                        {job.last_error ? <div className="mt-2 text-xs text-rose-600">{job.last_error}</div> : null}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}
        </div>

        <div className="relative z-10 flex justify-end border-t border-slate-200 px-4 py-4 sm:px-6">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </aside>
    </div>
  );
}

