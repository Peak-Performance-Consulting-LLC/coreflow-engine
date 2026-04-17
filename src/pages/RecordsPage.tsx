import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '../components/dashboard/PageHeader';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { RecordCreateDrawer } from '../components/records/RecordCreateDrawer';
import { RecordEditDrawer } from '../components/records/RecordEditDrawer';
import { RecordList, RecordListSkeleton } from '../components/records/RecordList';
import { RecordQuickActionDrawer, type RecordQuickActionMode } from '../components/records/RecordQuickActionDrawer';
import { buttonStyles } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { SectionSkeleton } from '../components/ui/SectionSkeleton';
import { useAuth } from '../hooks/useAuth';
import { useCrmWorkspace } from '../hooks/useCrmWorkspace';
import {
  addRecordNote,
  createRecordTask,
  getCachedWorkspaceRecords,
  listWorkspaceRecords,
  moveRecordStage,
  updateRecord,
} from '../lib/crm-service';
import type { RecordListFilters, RecordListPageResult, RecordListQuery, RecordSummary } from '../lib/crm-types';
import { buildActiveFilterChips, buildOperationalMetrics } from '../lib/record-workbench';
import { formatCrmLabel } from '../lib/utils';

const defaultFilters: Omit<RecordListFilters, 'workspace_id'> = {
  search: '',
  stage_id: null,
  source_id: null,
  assignee_user_id: null,
  status: null,
  include_archived: false,
};
const defaultPage = 1;
const defaultPageSize = 10;

function createEmptyRecordPage(page = defaultPage, pageSize = defaultPageSize): RecordListPageResult {
  return {
    items: [],
    records: [],
    page,
    pageSize,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  };
}

function updateVisibleRecordPage(
  current: RecordListPageResult,
  updater: (records: RecordSummary[]) => RecordSummary[],
): RecordListPageResult {
  const nextItems = updater(current.items);

  return {
    ...current,
    items: nextItems,
    records: nextItems,
  };
}

function mergeFollowUpDate(currentValue: string | null | undefined, nextValue: string | null) {
  if (!currentValue) {
    return nextValue;
  }

  if (!nextValue) {
    return currentValue;
  }

  return new Date(nextValue).getTime() < new Date(currentValue).getTime() ? nextValue : currentValue;
}

export function RecordsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, workspace, signOut } = useAuth();
  const workspaceId = workspace?.id ?? null;
  const { config, configError, configLoading, configRefreshing } = useCrmWorkspace();
  const [filters, setFilters] = useState<Omit<RecordListFilters, 'workspace_id'>>(defaultFilters);
  const [page, setPage] = useState(defaultPage);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [recordPage, setRecordPage] = useState<RecordListPageResult>(() =>
    workspaceId
      ? (getCachedWorkspaceRecords({
          workspace_id: workspaceId,
          ...defaultFilters,
          page: defaultPage,
          pageSize: defaultPageSize,
        }) ??
        createEmptyRecordPage())
      : createEmptyRecordPage(),
  );
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RecordSummary | null>(null);
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [actionRecord, setActionRecord] = useState<RecordSummary | null>(null);
  const [activeActionMode, setActiveActionMode] = useState<RecordQuickActionMode>(null);
  const [loading, setLoading] = useState(() => recordPage.items.length === 0 && recordPage.total === 0);
  const [refreshing, setRefreshing] = useState(false);
  const requestIdRef = useRef(0);
  const filtersRef = useRef(filters);
  const paginationRef = useRef({ page: defaultPage, pageSize: defaultPageSize });

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    paginationRef.current = { page, pageSize };
  }, [page, pageSize]);

  useEffect(() => {
    const shouldOpenCreateRecord = Boolean((location.state as { openCreateRecord?: boolean } | null)?.openCreateRecord);

    if (!shouldOpenCreateRecord) {
      return;
    }

    setIsCreateDrawerOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const metrics = useMemo(() => (config ? buildOperationalMetrics(recordPage.items, config) : []), [recordPage.items, config]);
  const activeFilterChips = useMemo(
    () => (config ? buildActiveFilterChips(filters, config) : []),
    [filters, config],
  );
  const hasActiveFilters = activeFilterChips.length > 0;

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  async function loadData(nextFilters = filtersRef.current, nextPagination = paginationRef.current) {
    if (!session || !workspaceId) {
      return;
    }

    const requestId = ++requestIdRef.current;
    const requestFilters: RecordListQuery = {
      workspace_id: workspaceId,
      ...nextFilters,
      ...nextPagination,
    };
    const cachedRecords = getCachedWorkspaceRecords(requestFilters);

    if (cachedRecords) {
      setRecordPage(cachedRecords);
      if (cachedRecords.page !== page) {
        setPage(cachedRecords.page);
      }
      if (cachedRecords.pageSize !== pageSize) {
        setPageSize(cachedRecords.pageSize);
      }
      setLoading(false);
      setRefreshing(true);
    } else if (recordPage.items.length > 0 || recordPage.total > 0) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const nextRecords = await listWorkspaceRecords(session, requestFilters);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setRecordPage(nextRecords);

      if (nextRecords.page !== nextPagination.page) {
        setPage(nextRecords.page);
      }

      if (nextRecords.pageSize !== nextPagination.pageSize) {
        setPageSize(nextRecords.pageSize);
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        const message = error instanceof Error ? error.message : 'Unable to load records.';
        toast.error(message);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    if (!session || !workspaceId) {
      return;
    }

    const debounceMs = filters.search.trim() ? 280 : 0;
    const timer = window.setTimeout(() => {
      void loadData(filters);
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    session,
    workspaceId,
    page,
    pageSize,
    filters.search,
    filters.stage_id,
    filters.source_id,
    filters.assignee_user_id,
    filters.status,
    filters.include_archived,
  ]);

  async function handleMoveStage(record: RecordSummary, stageId: string) {
    if (!session || !workspaceId) {
      throw new Error('Workspace is not ready.');
    }

    try {
      const detail = await moveRecordStage(session, workspaceId, record.id, stageId);
      const touchedAt = new Date().toISOString();

      setRecordPage((current) =>
        updateVisibleRecordPage(current, (records) =>
          records.map((item) =>
            item.id === record.id
              ? {
                  ...item,
                  ...detail.record,
                  last_activity_at: touchedAt,
                  last_activity_type: 'stage_changed',
                }
              : item,
          ),
        ),
      );
      toast.success('Stage updated.');
      void loadData(filtersRef.current);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to move stage.';
      toast.error(message);
      throw error;
    }
  }

  async function handleAddNote(record: RecordSummary, body: string) {
    if (!session || !workspaceId) {
      throw new Error('Workspace is not ready.');
    }

    try {
      await addRecordNote(session, workspaceId, record.id, body);
      const touchedAt = new Date().toISOString();

      setRecordPage((current) =>
        updateVisibleRecordPage(current, (records) =>
          records.map((item) =>
            item.id === record.id
              ? {
                  ...item,
                  updated_at: touchedAt,
                  last_activity_at: touchedAt,
                  last_activity_type: 'note_added',
                }
              : item,
          ),
        ),
      );
      toast.success('Note added.');
      void loadData(filtersRef.current);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to add note.';
      toast.error(message);
      throw error;
    }
  }

  async function handleCreateTask(
    record: RecordSummary,
    payload: { title: string; description: string | null; priority: string; due_at: string | null; assigned_to: string | null },
  ) {
    if (!session || !workspaceId) {
      throw new Error('Workspace is not ready.');
    }

    try {
      await createRecordTask(session, workspaceId, record.id, payload);
      const touchedAt = new Date().toISOString();

      setRecordPage((current) =>
        updateVisibleRecordPage(current, (records) =>
          records.map((item) =>
            item.id === record.id
              ? {
                  ...item,
                  updated_at: touchedAt,
                  last_activity_at: touchedAt,
                  last_activity_type: 'task_created',
                  open_task_count: (item.open_task_count ?? 0) + 1,
                  next_follow_up_at: mergeFollowUpDate(item.next_follow_up_at, payload.due_at),
                  next_task_title:
                    !item.next_task_title || !item.next_task_due_at || Boolean(payload.due_at && payload.due_at <= item.next_task_due_at)
                      ? payload.title
                      : item.next_task_title,
                  next_task_due_at: mergeFollowUpDate(item.next_task_due_at, payload.due_at),
                }
              : item,
          ),
        ),
      );
      toast.success('Task created.');
      void loadData(filtersRef.current);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create task.';
      toast.error(message);
      throw error;
    }
  }

  async function handleAssignOwner(record: RecordSummary, assigneeId: string | null) {
    if (!session || !workspaceId) {
      throw new Error('Workspace is not ready.');
    }

    try {
      const detail = await updateRecord(session, record.id, {
        workspace_id: workspaceId,
        core: {
          assignee_user_id: assigneeId,
        },
        custom: {},
      });
      const touchedAt = new Date().toISOString();

      setRecordPage((current) =>
        updateVisibleRecordPage(current, (records) =>
          records.map((item) =>
            item.id === record.id
              ? {
                  ...item,
                  ...detail.record,
                  last_activity_at: touchedAt,
                  last_activity_type: 'assignment_changed',
                }
              : item,
          ),
        ),
      );
      toast.success('Owner updated.');
      void loadData(filtersRef.current);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update owner.';
      toast.error(message);
      throw error;
    }
  }

  function handleOpenEditDrawer(record: RecordSummary) {
    setEditingRecord(record);
    setIsEditDrawerOpen(true);
  }

  function handleOpenCreateDrawer() {
    setIsCreateDrawerOpen(true);
  }

  function handlePageChange(nextPage: number) {
    setPage(Math.max(1, nextPage));
  }

  function handlePageSizeChange(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPage(defaultPage);
  }

  function updateFilters(nextUpdater: (current: Omit<RecordListFilters, 'workspace_id'>) => Omit<RecordListFilters, 'workspace_id'>) {
    setFilters((current) => nextUpdater(current));
    setPage(defaultPage);
  }

  function handleCloseCreateDrawer() {
    setIsCreateDrawerOpen(false);
  }

  function handleCloseEditDrawer() {
    setIsEditDrawerOpen(false);
  }

  function handleOpenQuickAction(record: RecordSummary, mode: Exclude<RecordQuickActionMode, null>) {
    setActionRecord(record);
    setActiveActionMode(mode);
  }

  function handleCloseQuickAction() {
    setActiveActionMode(null);
  }

  function handleRecordSaved(detail: { record: RecordSummary }) {
    setEditingRecord(detail.record);
    setActionRecord(detail.record);
    setRecordPage((current) =>
      updateVisibleRecordPage(current, (records) =>
        records.map((item) => (item.id === detail.record.id ? { ...item, ...detail.record } : item)),
      ),
    );
    void loadData(filtersRef.current);
  }

  function handleRecordCreated() {
    setPage(defaultPage);
    void loadData(filtersRef.current, { page: defaultPage, pageSize: paginationRef.current.pageSize });
  }

  if (!workspace || !session || !workspaceId) {
    return <FullPageLoader label="Loading records..." />;
  }

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={handleSignOut}>
      <div className="space-y-5">
        <PageHeader
          eyebrow={`${formatCrmLabel(workspace.crmType)} work queue`}
          title="Records"
          description="Review records, triage follow-ups, and manage owner assignments from a single operational queue."
          actions={(
            <>
              <Link to="/imports" className={buttonStyles('secondary', 'sm')}>
                Import records
              </Link>
              <button type="button" onClick={handleOpenCreateDrawer} className={buttonStyles('primary', 'sm')}>
                Create record
              </button>
            </>
          )}
        />

        {configRefreshing ? (
          <Card className="p-4 text-sm text-slate-600">Refreshing workspace config in the background...</Card>
        ) : null}

        {configError && !config ? (
          <Card className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{configError}</Card>
        ) : null}

        {config ? (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
            {metrics.map((metric) => (
              <Card key={metric.label} className="p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">{metric.label}</div>
                <div className="mt-3 font-display text-3xl text-slate-900">{metric.value}</div>
                <p className="mt-2 text-sm text-slate-600">{metric.hint}</p>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionSkeleton title="Operational metrics" rows={2} />
            <SectionSkeleton title="Operational metrics" rows={2} />
          </div>
        )}

        {config ? (
          <div className="p-5 bg-transparent">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="font-display text-2xl text-slate-900">Daily queue filters</h3>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-700">
                    {hasActiveFilters ? `${activeFilterChips.length} active filters` : 'All records'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFilters(defaultFilters);
                      setPage(defaultPage);
                    }}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-700 transition hover:text-slate-900"
                  >
                    Reset filters
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <input
                    value={filters.search}
                    onChange={(event) =>
                      updateFilters((current) => ({
                        ...current,
                        search: event.target.value,
                      }))
                    }
                    placeholder="Search title, contact, company, email"
                    className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-[15px] text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                <select
                  value={filters.stage_id ?? ''}
                  onChange={(event) =>
                    updateFilters((current) => ({
                      ...current,
                      stage_id: event.target.value || null,
                    }))
                  }
                  className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-[15px] text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">All stages</option>
                  {config.pipelines.flatMap((pipeline) =>
                    pipeline.stages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    )),
                  )}
                </select>
                <select
                  value={filters.source_id ?? ''}
                  onChange={(event) =>
                    updateFilters((current) => ({
                      ...current,
                      source_id: event.target.value || null,
                    }))
                  }
                  className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-[15px] text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">All sources</option>
                  {config.sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
                <select
                  value={filters.assignee_user_id ?? ''}
                  onChange={(event) =>
                    updateFilters((current) => ({ ...current, assignee_user_id: event.target.value || null }))
                  }
                  className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-[15px] text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">All owners</option>
                  {config.assignees.map((assignee) => (
                    <option key={assignee.userId} value={assignee.userId}>
                      {assignee.fullName ?? assignee.userId}
                    </option>
                  ))}
                </select>
                <select
                  value={filters.status ?? ''}
                  onChange={(event) =>
                    updateFilters((current) => ({
                      ...current,
                      status: event.target.value || null,
                    }))
                  }
                  className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-[15px] text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">All statuses</option>
                  <option value="open">Open</option>
                  <option value="qualified">Qualified</option>
                  <option value="nurturing">Nurturing</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              {activeFilterChips.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {activeFilterChips.map((chip) => (
                    <button
                      key={`${chip.key}-${chip.value}`}
                      type="button"
                      onClick={() =>
                        updateFilters((current) => ({
                          ...current,
                          [chip.key]: chip.key === 'search' ? '' : null,
                        }))
                      }
                      className="rounded-full border border-accent-blue/25 bg-accent-blue/10 px-3 py-1 text-xs text-accent-blue transition hover:border-cyan-200/40"
                    >
                      {chip.label}: {chip.value} x
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <SectionSkeleton title="Queue filters" rows={3} />
        )}

        {config ? (
          loading && recordPage.items.length === 0 && recordPage.total === 0 ? (
            <RecordListSkeleton rows={6} />
          ) : (
            <RecordList
              records={recordPage.items}
              config={config}
              crmType={workspace.crmType}
              hasActiveFilters={hasActiveFilters}
              isRefreshing={refreshing}
              pagination={recordPage}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              onCreateRecord={handleOpenCreateDrawer}
              onClearFilters={() => {
                setFilters(defaultFilters);
                setPage(defaultPage);
              }}
              onEditLead={handleOpenEditDrawer}
              onOpenAction={handleOpenQuickAction}
            />
          )
        ) : loading || configLoading ? (
          <RecordListSkeleton rows={6} />
        ) : null}
      </div>

      {config ? (
        <RecordCreateDrawer
          isOpen={isCreateDrawerOpen}
          workspaceId={workspaceId}
          session={session}
          config={config}
          onClose={handleCloseCreateDrawer}
          onCreated={handleRecordCreated}
        />
      ) : null}

      {config ? (
        <RecordEditDrawer
          isOpen={isEditDrawerOpen}
          record={editingRecord}
          workspaceId={workspaceId}
          session={session}
          config={config}
          onClose={handleCloseEditDrawer}
          onSaved={handleRecordSaved}
        />
      ) : null}

      {config ? (
        <RecordQuickActionDrawer
          isOpen={activeActionMode !== null}
          mode={activeActionMode}
          record={actionRecord}
          config={config}
          onClose={handleCloseQuickAction}
          onMoveStage={handleMoveStage}
          onAddNote={handleAddNote}
          onCreateTask={handleCreateTask}
          onAssignOwner={handleAssignOwner}
        />
      ) : null}
    </WorkspaceLayout>
  );
}
