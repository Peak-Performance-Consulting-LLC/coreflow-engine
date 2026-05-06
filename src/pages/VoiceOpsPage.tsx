import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, PhoneCall, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { AppPageGuide } from '../context/AppGuideContext';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { VoiceCallDetailDrawer } from '../components/voice/VoiceCallDetailDrawer';
import { VoiceCallFilters, type VoiceCallFilterState } from '../components/voice/VoiceCallFilters';
import { VoiceCallsTable } from '../components/voice/VoiceCallsTable';
import { Card } from '../components/ui/Card';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { useAuth } from '../hooks/useAuth';
import { usePageGuide } from '../hooks/useAppGuide';
import { isWorkspaceOwner } from '../lib/utils';
import {
  getVoiceCallDetail,
  listVoiceCalls,
  resolveVoiceReview,
  retryVoiceAction,
  retryVoiceCallLeadCreate,
  type VoiceCallDetailResponse,
  type VoiceCallListResponse,
} from '../lib/voice-ops-service';

const defaultFilters: VoiceCallFilterState = {
  outcome_status: '',
  review_status: '',
  assistant_id: '',
  phone_number_id: '',
  has_record: 'all',
};

export function VoiceOpsPage() {
  const navigate = useNavigate();
  const { session, workspace, signOut } = useAuth();
  const [filters, setFilters] = useState<VoiceCallFilterState>(defaultFilters);
  const [listData, setListData] = useState<VoiceCallListResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VoiceCallDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [retryingLead, setRetryingLead] = useState(false);
  const [retryingActionId, setRetryingActionId] = useState<string | null>(null);
  const [resolvingReview, setResolvingReview] = useState(false);

  const openReviewCount = useMemo(
    () => (listData?.calls ?? []).filter((call) => call.review_status === 'open').length,
    [listData],
  );
  const failedCount = useMemo(
    () => (listData?.calls ?? []).filter((call) => call.outcome_status && call.outcome_status !== 'lead_created').length,
    [listData],
  );
  const leadCount = useMemo(
    () => (listData?.calls ?? []).filter((call) => call.outcome_status === 'lead_created').length,
    [listData],
  );
  const guide = useMemo<AppPageGuide>(
    () => ({
      key: 'voice-ops',
      title: 'Review the inbound call queue',
      summary:
        'This page is the shared operations queue for inbound calls. It helps the team filter the queue, inspect call details, resolve review items, and retry automation safely.',
      nextStep:
        openReviewCount > 0
          ? 'Start with the open review items so unresolved call outcomes do not linger in the queue.'
          : 'Use the filters to narrow the queue, then open the next call that needs review or a retry.',
      highlights: ['Call review queue', 'Retry actions', 'Task creation from calls'],
      autoStart: 'once' as const,
      steps: [
        {
          id: 'voice-ops-refresh',
          title: 'Refresh the live queue',
          body: 'Use refresh when the team wants the latest call outcomes and review statuses before acting.',
          targetId: 'voice-ops-refresh',
        },
        {
          id: 'voice-ops-filters',
          title: 'Filter the queue by what needs attention',
          body: 'The filters let users isolate review-needed calls, assistant-specific traffic, or calls that still need a linked CRM record.',
          targetId: 'voice-ops-filters',
        },
        {
          id: 'voice-ops-table',
          title: 'Open a call from the table',
          body: 'Selecting a call opens the detail drawer where users can inspect artifacts, retry actions, resolve review status, and create follow-up tasks.',
          targetId: 'voice-ops-table',
          placement: 'top',
        },
      ],
    }),
    [openReviewCount],
  );

  usePageGuide(guide);

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  async function loadCalls(options?: {
    nextSelectedCallId?: string | null;
    page?: number;
    pageSize?: number;
  }) {
    if (!session || !workspace) {
      return;
    }

    setListLoading(true);

    try {
      const nextPage = options?.page ?? page;
      const nextPageSize = options?.pageSize ?? pageSize;
      const result = await listVoiceCalls(session, {
        workspace_id: workspace.id,
        outcome_status: filters.outcome_status || null,
        review_status: filters.review_status || null,
        assistant_id: filters.assistant_id || null,
        phone_number_id: filters.phone_number_id || null,
        has_record: filters.has_record === 'all' ? null : filters.has_record === 'yes',
        page: nextPage,
        page_size: nextPageSize,
      });
      setListData(result);
      const preservedCallId = result.calls.some((call) => call.id === selectedCallId) ? selectedCallId : null;
      const nextCallId = options?.nextSelectedCallId ?? preservedCallId ?? null;
      setSelectedCallId(nextCallId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load voice calls.';
      toast.error(message);
    } finally {
      setListLoading(false);
    }
  }

  async function loadDetail(voiceCallId: string | null) {
    if (!session || !workspace || !voiceCallId) {
      setDetail(null);
      return;
    }

    setDetailLoading(true);

    try {
      const result = await getVoiceCallDetail(session, workspace.id, voiceCallId);
      setDetail(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load voice call detail.';
      toast.error(message);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!session || !workspace) {
      return;
    }

    void loadCalls();
  }, [
    session,
    workspace?.id,
    filters.outcome_status,
    filters.review_status,
    filters.assistant_id,
    filters.phone_number_id,
    filters.has_record,
    page,
    pageSize,
  ]);

  useEffect(() => {
    void loadDetail(selectedCallId);
  }, [selectedCallId, session, workspace?.id]);

  async function handleRetryLeadCreate() {
    if (!session || !workspace || !selectedCallId) {
      return;
    }

    setRetryingLead(true);

    try {
      await retryVoiceCallLeadCreate(session, workspace.id, selectedCallId);
      toast.success('Lead creation retried.');
      await loadCalls({ nextSelectedCallId: selectedCallId });
      await loadDetail(selectedCallId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to retry lead creation.';
      toast.error(message);
    } finally {
      setRetryingLead(false);
    }
  }

  async function handleRetryAction(actionRunId: string) {
    if (!session || !workspace || !selectedCallId) {
      return;
    }

    setRetryingActionId(actionRunId);

    try {
      await retryVoiceAction(session, workspace.id, actionRunId);
      toast.success('Action retried.');
      await loadCalls({ nextSelectedCallId: selectedCallId });
      await loadDetail(selectedCallId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to retry action.';
      toast.error(message);
    } finally {
      setRetryingActionId(null);
    }
  }

  async function handleResolveReview(reviewStatus: 'open' | 'resolved' | 'dismissed') {
    if (!session || !workspace || !selectedCallId) {
      return;
    }

    setResolvingReview(true);

    try {
      await resolveVoiceReview(session, {
        workspace_id: workspace.id,
        voice_call_id: selectedCallId,
        review_status: reviewStatus,
      });
      toast.success(`Review marked ${reviewStatus}.`);
      await loadCalls({ nextSelectedCallId: selectedCallId });
      await loadDetail(selectedCallId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update review.';
      toast.error(message);
    } finally {
      setResolvingReview(false);
    }
  }

  if (!session || !workspace) {
    return <FullPageLoader label="Loading voice operations..." />;
  }

  const isOwner = isWorkspaceOwner(workspace);

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={handleSignOut}>
      <div className="space-y-5 bg-[#f3f3f3] p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-medium text-[#7a8196]">
              Voice Operations <span className="mx-2 text-[#b0b6c6]">|</span> <span className="text-[#4c39df]">Inbound call queue</span>
            </div>
            <h1 className="mt-1 font-display text-[44px] leading-[1.02] tracking-tight text-[#1c2a3d]">Inbound call queue</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium text-[#667086]">
              Inspect inbound calls, resolve review-needed outcomes, and retry failed automations without leaving your workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-guide-id="voice-ops-refresh"
              onClick={() => void loadCalls({ nextSelectedCallId: selectedCallId })}
              disabled={listLoading}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d9deea] bg-white px-4 text-sm font-semibold text-[#4f586e] shadow-sm transition hover:bg-[#f6f8fc] disabled:opacity-60"
            >
              <RefreshCcw className={`h-4 w-4 ${listLoading ? 'animate-spin' : ''}`} />
              Refresh queue
            </button>
            {isOwner ? (
              <Link
                to="/voice/numbers"
                className="inline-flex h-10 items-center rounded-lg bg-[#4c39df] px-4 text-sm font-semibold text-white shadow-[0_10px_20px_-12px_rgba(76,57,223,0.68)] transition hover:bg-[#412fd0]"
              >
                Voice workspace
              </Link>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border border-[#d9deea] bg-white p-5 shadow-[0_8px_20px_-16px_rgba(34,45,74,0.2)]">
            <div className="flex items-start justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#efeefe] text-[#4c39df]">
                <PhoneCall className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8f97ab]">Live view</span>
            </div>
            <div className="mt-3 text-sm font-medium text-[#667086]">Calls loaded</div>
            <div className="mt-1 font-display text-4xl font-semibold tracking-tight text-[#1f2b3f]">{listData?.total ?? 0}</div>
          </Card>

          <Card className="border border-[#d9deea] bg-white p-5 shadow-[0_8px_20px_-16px_rgba(34,45,74,0.2)]">
            <div className="flex items-start justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fff4e7] text-[#d28626]">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#d28626]">Action needed</span>
            </div>
            <div className="mt-3 text-sm font-medium text-[#667086]">Open review</div>
            <div className="mt-1 font-display text-4xl font-semibold tracking-tight text-[#1f2b3f]">{openReviewCount}</div>
          </Card>

          <Card className="border border-[#d9deea] bg-white p-5 shadow-[0_8px_20px_-16px_rgba(34,45,74,0.2)]">
            <div className="flex items-start justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#edf9ee] text-[#4a9c5b]">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#4a9c5b]">Growth</span>
            </div>
            <div className="mt-3 text-sm font-medium text-[#667086]">Leads created</div>
            <div className="mt-1 font-display text-4xl font-semibold tracking-tight text-[#1f2b3f]">{leadCount}</div>
            <div className="mt-1 text-xs font-medium text-[#8a92a7]">{failedCount} non-success outcomes in view</div>
          </Card>
        </div>

        <div data-guide-id="voice-ops-filters">
          <VoiceCallFilters
            filters={filters}
            calls={listData?.calls ?? []}
            loading={listLoading}
            onChange={(patch) => {
              setPage(1);
              setFilters((current) => ({ ...current, ...patch }));
            }}
            onReset={() => {
              setPage(1);
              setFilters(defaultFilters);
            }}
          />
        </div>

        <div data-guide-id="voice-ops-table">
          <VoiceCallsTable
            calls={listData?.calls ?? []}
            loading={listLoading}
            selectedCallId={selectedCallId}
            onSelect={setSelectedCallId}
            page={listData?.page ?? page}
            pageSize={listData?.pageSize ?? pageSize}
            total={listData?.total ?? 0}
            hasNextPage={Boolean(listData?.next_page)}
            hasPrevPage={(listData?.page ?? page) > 1}
            onPageChange={(nextPage) => {
              if (nextPage < 1 || listLoading) {
                return;
              }

              setPage(nextPage);
            }}
            onPageSizeChange={(nextPageSize) => {
              if (listLoading) {
                return;
              }

              setPage(1);
              setPageSize(nextPageSize);
            }}
          />
        </div>
      </div>

      <VoiceCallDetailDrawer
        isOpen={Boolean(selectedCallId)}
        detail={detail}
        loading={detailLoading}
        retryingLead={retryingLead}
        retryingActionId={retryingActionId}
        resolvingReview={resolvingReview}
        onClose={() => setSelectedCallId(null)}
        onRetryLeadCreate={handleRetryLeadCreate}
        onRetryAction={handleRetryAction}
        onResolveReview={handleResolveReview}
      />
    </WorkspaceLayout>
  );
}
