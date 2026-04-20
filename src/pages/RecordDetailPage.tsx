import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { RecordActivityTimeline } from '../components/records/RecordActivityTimeline';
import { RecordForm } from '../components/records/RecordForm';
import { RecordNotesSection } from '../components/records/RecordNotesSection';
import { RecordTasksSection } from '../components/records/RecordTasksSection';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { SectionSkeleton } from '../components/ui/SectionSkeleton';
import { useAuth } from '../hooks/useAuth';
import { useCrmWorkspace } from '../hooks/useCrmWorkspace';
import {
  addRecordNote,
  createRecordTask,
  getCachedRecordDetails,
  getRecordDetails,
  moveRecordStage,
  updateRecord,
} from '../lib/crm-service';
import type { CrmWorkspaceConfig, RecordDetailResponse, RecordSaveInput } from '../lib/crm-types';
import { enrollLead } from '../lib/email-service';

function findStageName(config: CrmWorkspaceConfig, stageId: string | null) {
  for (const pipeline of config.pipelines) {
    const stage = pipeline.stages.find((item) => item.id === stageId);
    if (stage) return stage.name;
  }

  return 'Unstaged';
}

function findSourceName(config: CrmWorkspaceConfig, sourceId: string | null) {
  return config.sources.find((source) => source.id === sourceId)?.name ?? 'No source';
}

function findAssigneeName(config: CrmWorkspaceConfig, assigneeUserId: string | null) {
  return config.assignees.find((assignee) => assignee.userId === assigneeUserId)?.fullName ?? 'Unassigned';
}

export function RecordDetailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { recordId = '' } = useParams();
  const { session, workspace, signOut } = useAuth();
  const workspaceId = workspace?.id ?? null;
  const { config, configError, configLoading, configRefreshing } = useCrmWorkspace();
  const [detail, setDetail] = useState<RecordDetailResponse | null>(() =>
    workspaceId && recordId ? getCachedRecordDetails(workspaceId, recordId) : null,
  );
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(() => !detail);
  const [detailRefreshing, setDetailRefreshing] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState(detail?.record.stage_id ?? '');
  const [movingStage, setMovingStage] = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  const visibleDetail = detail?.record.id === recordId ? detail : null;

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  async function loadRecord() {
    if (!session || !workspaceId || !recordId) {
      return;
    }

    const cachedDetail = getCachedRecordDetails(workspaceId, recordId);

    if (cachedDetail) {
      setDetail(cachedDetail);
      setSelectedStageId(cachedDetail.record.stage_id ?? '');
      setDetailLoading(false);
      setDetailRefreshing(true);
    } else {
      setDetailLoading(true);
    }

    setDetailError(null);

    try {
      const nextDetail = await getRecordDetails(session, workspaceId, recordId);
      setDetail(nextDetail);
      setSelectedStageId(nextDetail.record.stage_id ?? '');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load record.';
      setDetailError(message);
      toast.error(message);
    } finally {
      setDetailLoading(false);
      setDetailRefreshing(false);
    }
  }

  useEffect(() => {
    if (!workspaceId || !recordId) {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      setDetailRefreshing(false);
      setSelectedStageId('');
      return;
    }

    const cachedDetail = getCachedRecordDetails(workspaceId, recordId);

    setDetail(cachedDetail);
    setDetailError(null);
    setDetailLoading(!cachedDetail);
    setDetailRefreshing(Boolean(cachedDetail));
    setSelectedStageId(cachedDetail?.record.stage_id ?? '');

    void loadRecord();
  }, [workspaceId, recordId]);

  useEffect(() => {
    if (location.hash !== '#tasks' || !visibleDetail) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document.getElementById('tasks')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [location.hash, visibleDetail]);

  async function handleSave(payload: RecordSaveInput) {
    if (!session || !visibleDetail) return;

    try {
      const nextDetail = await updateRecord(session, visibleDetail.record.id, payload);
      setDetail(nextDetail);
      setSelectedStageId(nextDetail.record.stage_id ?? '');
      toast.success('Record updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update record.';
      toast.error(message);
      throw error;
    }
  }

  async function handleMoveStage() {
    if (!session || !workspaceId || !visibleDetail || !selectedStageId) return;

    setMovingStage(true);

    try {
      const nextDetail = await moveRecordStage(session, workspaceId, visibleDetail.record.id, selectedStageId);
      setDetail(nextDetail);
      toast.success('Stage updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to move stage.';
      toast.error(message);
    } finally {
      setMovingStage(false);
    }
  }

  async function handleAddNote(body: string) {
    if (!session || !workspaceId || !visibleDetail) return;
    await addRecordNote(session, workspaceId, visibleDetail.record.id, body);
    await loadRecord();
    toast.success('Note added.');
  }

  async function handleCreateTask(payload: {
    title: string;
    description: string | null;
    priority: string;
    due_at: string | null;
    assigned_to: string | null;
  }) {
    if (!session || !workspaceId || !visibleDetail) return;
    await createRecordTask(session, workspaceId, visibleDetail.record.id, payload);
    await loadRecord();
    toast.success('Task created.');
  }

  async function handleEnrollEmail() {
    if (!visibleDetail) return;
    setEnrolling(true);
    try {
      const result = await enrollLead(visibleDetail.record.id);
      toast.success(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enroll lead.';
      toast.error(message);
    } finally {
      setEnrolling(false);
    }
  }

  if (!session || !workspace || !workspaceId) {
    return <FullPageLoader label="Loading record details..." />;
  }

  const stageOptions =
    config?.pipelines.find((pipeline) => pipeline.id === visibleDetail?.record.pipeline_id)?.stages ??
    config?.pipelines.flatMap((pipeline) => pipeline.stages) ??
    [];

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={handleSignOut}>
      <div className="space-y-5">
        <div>
          <Link to="/records" className="text-sm text-accent-blue transition hover:text-accent-blue">
            Back to records
          </Link>
          <h2 className="mt-2 font-display text-3xl text-slate-900">{visibleDetail?.record.title ?? 'Record details'}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Edit fixed fields, dynamic metadata fields, stage, notes, tasks, and timeline in one shared view.
          </p>
        </div>

        {configRefreshing || detailRefreshing ? (
          <Card className="p-4 text-sm text-slate-600">Refreshing record data in the background...</Card>
        ) : null}

        {configError && !config ? (
          <Card className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{configError}</Card>
        ) : null}

        {detailError && !visibleDetail ? (
          <Card className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{detailError}</Card>
        ) : null}

        {config && visibleDetail ? (
          <>
            <div className="grid gap-4 lg:grid-cols-4">
              <Card className="p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Stage</div>
                <div className="mt-3 font-display text-2xl text-slate-900">
                  {findStageName(config, visibleDetail.record.stage_id)}
                </div>
              </Card>
              <Card className="p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Source</div>
                <div className="mt-3 font-display text-2xl text-slate-900">
                  {findSourceName(config, visibleDetail.record.source_id)}
                </div>
              </Card>
              <Card className="p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Assignee</div>
                <div className="mt-3 font-display text-2xl text-slate-900">
                  {findAssigneeName(config, visibleDetail.record.assignee_user_id)}
                </div>
              </Card>
              <Card className="p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Updated</div>
                <div className="mt-3 text-sm leading-7 text-slate-700">
                  {new Date(visibleDetail.record.updated_at).toLocaleString()}
                </div>
              </Card>
            </div>

            <Card className="p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Quick stage move</div>
                  <h3 className="mt-2 font-display text-2xl text-slate-900">Current stage</h3>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <select
                    value={selectedStageId}
                    onChange={(event) => setSelectedStageId(event.target.value)}
                    className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900"
                  >
                    <option value="">Select stage</option>
                    {stageOptions.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                  </select>
                  <Button type="button" size="sm" onClick={() => void handleMoveStage()} loading={movingStage}>
                    Move stage
                  </Button>
                </div>
              </div>
            </Card>

            {/* ── Email Sequence Enrollment ── */}
            <Card className="overflow-hidden p-0">
              <div className="flex items-center justify-between gap-4 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">Email Follow-up Sequence</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Automatically send a series of follow-up emails to this lead.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  loading={enrolling}
                  onClick={() => void handleEnrollEmail()}
                >
                  {enrolling ? 'Enrolling…' : 'Enroll in Sequence'}
                </Button>
              </div>
              <div className="border-t border-slate-100 bg-slate-50 px-6 py-2.5">
                <p className="text-[11px] text-slate-400">
                  Requires email automation enabled and a default sender connected in{' '}
                  <a href="/email" className="text-violet-500 underline hover:text-violet-700">Email Settings</a>.
                </p>
              </div>
            </Card>

            <RecordForm
              key={visibleDetail.record.id}
              workspaceId={workspaceId}
              config={config}
              initialRecord={visibleDetail.record}
              initialCustom={visibleDetail.custom}
              submitLabel="Save changes"
              onSubmit={handleSave}
            />

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <RecordNotesSection notes={visibleDetail.notes} onAddNote={handleAddNote} />
              <div id="tasks">
                <RecordTasksSection
                  tasks={visibleDetail.tasks}
                  assignees={config.assignees}
                  onCreateTask={handleCreateTask}
                />
              </div>
            </div>

            <RecordActivityTimeline
              activities={visibleDetail.activities}
              config={config}
              record={visibleDetail.record}
              notes={visibleDetail.notes}
              tasks={visibleDetail.tasks}
            />
          </>
        ) : detailLoading || configLoading ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionSkeleton title="Record summary" rows={2} />
              <SectionSkeleton title="Record summary" rows={2} />
            </div>
            <SectionSkeleton title="Record form" rows={6} />
          </>
        ) : null}
      </div>
    </WorkspaceLayout>
  );
}
