import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, PhoneCall, RefreshCcw, Waves } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../components/dashboard/PageHeader';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { VoiceCallDetailDrawer } from '../components/voice/VoiceCallDetailDrawer';
import { VoiceCallFilters, type VoiceCallFilterState } from '../components/voice/VoiceCallFilters';
import { VoiceCallsTable } from '../components/voice/VoiceCallsTable';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { useAuth } from '../hooks/useAuth';
import {
  createVoiceTaskFromRecommendation,
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
  const { session, workspace, signOut, user } = useAuth();
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
  const [creatingTaskArtifactId, setCreatingTaskArtifactId] = useState<string | null>(null);

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

  async function handleCreateTaskFromRecommendation(artifactId: string) {
    if (!session || !workspace || !selectedCallId || !artifactId) {
      return;
    }

    setCreatingTaskArtifactId(artifactId);

    try {
      const task = await createVoiceTaskFromRecommendation(session, {
        workspace_id: workspace.id,
        voice_call_id: selectedCallId,
        artifact_id: artifactId,
      });
      toast.success(`Task created: ${task.title}`);
      await loadCalls({ nextSelectedCallId: selectedCallId });
      await loadDetail(selectedCallId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create task.';
      toast.error(message);
    } finally {
      setCreatingTaskArtifactId(null);
    }
  }

  if (!session || !workspace) {
    return <FullPageLoader label="Loading voice operations..." />;
  }

  const isOwner = workspace.ownerId === user?.id;

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={handleSignOut}>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Voice operations"
          title="Inbound call queue"
          description="Inspect inbound calls, resolve review-needed outcomes, and retry failed automations without leaving your workspace."
          actions={(
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void loadCalls({ nextSelectedCallId: selectedCallId })}
                loading={listLoading}
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh queue
              </Button>
              {isOwner ? (
                <Link
                  to="/voice/numbers"
                  className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Voice workspace
                </Link>
              ) : null}
            </>
          )}
        />

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <PhoneCall className="h-4 w-4 text-indigo-500" />
              Calls loaded
            </div>
            <div className="mt-2 font-display text-3xl text-slate-900">{listData?.total ?? 0}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <AlertTriangle className="h-4 w-4 text-indigo-500" />
              Open review
            </div>
            <div className="mt-2 font-display text-3xl text-slate-900">{openReviewCount}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <Waves className="h-4 w-4 text-indigo-500" />
              Leads created
            </div>
            <div className="mt-2 font-display text-3xl text-slate-900">{leadCount}</div>
            <div className="mt-1 text-xs text-slate-500">Other non-success outcomes in view: {failedCount}</div>
          </Card>
        </div>

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

      <VoiceCallDetailDrawer
        isOpen={Boolean(selectedCallId)}
        detail={detail}
        loading={detailLoading}
        retryingLead={retryingLead}
        retryingActionId={retryingActionId}
        resolvingReview={resolvingReview}
        creatingTaskArtifactId={creatingTaskArtifactId}
        onClose={() => setSelectedCallId(null)}
        onRetryLeadCreate={handleRetryLeadCreate}
        onRetryAction={handleRetryAction}
        onResolveReview={handleResolveReview}
        onCreateTaskFromRecommendation={handleCreateTaskFromRecommendation}
      />
    </WorkspaceLayout>
  );
}
