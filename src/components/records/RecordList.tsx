import { DatabaseZap, MoreVertical, SearchX } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { CrmWorkspaceConfig, RecordListPageResult, RecordSummary } from '../../lib/crm-types';
import type { CRMType } from '../../lib/types';
import { getWorkbenchEmptyState } from '../../lib/record-workbench';
import { buttonStyles } from '../ui/Button';
import { Card } from '../ui/Card';
import type { RecordQuickActionMode } from './RecordQuickActionDrawer';
import { RecordListItem, recordListGridClassName } from './RecordListItem';

interface RecordListProps {
  records: RecordSummary[];
  config: CrmWorkspaceConfig;
  crmType: CRMType;
  hasActiveFilters: boolean;
  isRefreshing?: boolean;
  selectedRecordIds: Set<string>;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  isDeletingSelected?: boolean;
  pagination: Pick<RecordListPageResult, 'page' | 'pageSize' | 'total' | 'totalPages' | 'hasNextPage' | 'hasPrevPage'>;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onCreateRecord: () => void;
  onClearFilters: () => void;
  onToggleSelectAllVisible: (checked: boolean) => void;
  onToggleRecordSelection: (recordId: string, checked: boolean) => void;
  onRequestDeleteSelected: () => void;
  onEditLead: (record: RecordSummary) => void;
  onOpenAction: (record: RecordSummary, mode: Exclude<RecordQuickActionMode, null>) => void;
}

interface RecordListSkeletonProps {
  rows?: number;
}

export function RecordListSkeleton({ rows = 6 }: RecordListSkeletonProps) {
  return (
    <Card className="overflow-hidden border border-[#d9deea] bg-white p-0 shadow-[0_8px_20px_-16px_rgba(34,45,74,0.2)]">
      <div className="flex flex-col gap-3 border-b border-[#e4e8f1] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-3 w-32 rounded-full bg-[#edf0f6]" />
          <div className="mt-3 h-6 w-56 rounded-full bg-[#edf0f6]" />
        </div>
        <div className="h-8 w-28 rounded-full bg-[#edf0f6]" />
      </div>

      <div className="overflow-x-auto">
        <div className={recordListGridClassName + ' border-b border-[#e4e8f1] bg-[#f7f8fc] px-5 py-3'}>
          <div className="h-4 w-4 rounded-full bg-[#edf0f6]" />
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-3 w-20 rounded-full bg-[#edf0f6]" />
          ))}
        </div>

        <div>
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className={recordListGridClassName + ' border-b border-[#eceff6] px-5 py-3'}>
              <div className="h-4 w-4 rounded-full bg-[#edf0f6]" />
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-[#edf0f6]" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-40 rounded-full bg-[#edf0f6]" />
                  <div className="mt-2 h-3 w-56 rounded-full bg-[#edf0f6]" />
                  <div className="mt-3 flex gap-2">
                    <div className="h-6 w-20 rounded-full bg-[#edf0f6]" />
                    <div className="h-6 w-24 rounded-full bg-[#edf0f6]" />
                  </div>
                </div>
              </div>
              <div className="h-4 w-20 rounded-full bg-[#edf0f6]" />
              <div className="h-8 w-24 rounded-full bg-[#edf0f6]" />
              <div className="h-4 w-32 rounded-full bg-[#edf0f6]" />
              <div className="h-6 w-20 rounded-full bg-[#edf0f6]" />
              <div className="h-8 w-28 rounded-full bg-[#edf0f6]" />
              <div>
                <div className="h-5 w-28 rounded-full bg-[#edf0f6]" />
                <div className="mt-2 h-3 w-24 rounded-full bg-[#edf0f6]" />
              </div>
              <div className="h-4 w-24 rounded-full bg-[#edf0f6]" />
              <div className="ml-auto h-10 w-10 rounded-full bg-[#edf0f6]" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function RecordList({
  records,
  config,
  crmType,
  hasActiveFilters,
  isRefreshing = false,
  selectedRecordIds,
  allVisibleSelected,
  someVisibleSelected,
  isDeletingSelected = false,
  pagination,
  onPageChange,
  onPageSizeChange,
  onCreateRecord,
  onClearFilters,
  onToggleSelectAllVisible,
  onToggleRecordSelection,
  onRequestDeleteSelected,
  onEditLead,
  onOpenAction,
}: RecordListProps) {
  const selectedCount = selectedRecordIds.size;
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selectAllRef.current) {
      return;
    }

    selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  if (records.length === 0) {
    const emptyState = getWorkbenchEmptyState(crmType, hasActiveFilters);
    const EmptyIcon = hasActiveFilters ? SearchX : DatabaseZap;

    return (
      <Card className="border border-[#d9deea] bg-white p-10 shadow-[0_8px_20px_-16px_rgba(34,45,74,0.2)]">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#d8deeb] bg-[#f1f3f8] text-[#58617a]">
            <EmptyIcon className="h-7 w-7" />
          </div>
          <div className="mt-5 inline-flex rounded-full border border-[#d8deeb] bg-[#f1f3f8] px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-[#5f687f]">
            Shared CRM work queue
          </div>
          <h3 className="mt-5 font-display text-3xl tracking-tight text-[#1f2b3f]">{emptyState.title}</h3>
          <p className="mt-3 text-sm font-medium leading-7 text-[#667086]">{emptyState.body}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={onCreateRecord} className={buttonStyles('primary', 'sm')}>
              Create record
            </button>
            <Link to="/imports" className={buttonStyles('secondary', 'sm')}>
              Import records
            </Link>
            {hasActiveFilters ? (
              <button type="button" onClick={onClearFilters} className={buttonStyles('ghost', 'sm')}>
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border border-[#d9deea] bg-white p-0 shadow-[0_8px_20px_-16px_rgba(34,45,74,0.2)]">
      <div className="flex items-start justify-between border-b border-[#e4e8f1] px-5 py-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5f687f]">Records table</div>
          <h3 className="mt-2 text-[38px] font-semibold tracking-tight text-[#202a3d]">Clean queue view</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-[#f1f3f8] px-2.5 py-1 font-medium text-[#6f778d]">
              {records.length} visible record{records.length === 1 ? '' : 's'}
            </span>
            <span className="rounded-md bg-[#f1f3f8] px-2.5 py-1 font-medium text-[#6f778d]">{config.sources.length} sources</span>
            {isRefreshing ? <span className="rounded-md bg-[#eef1f7] px-2.5 py-1 font-medium text-[#68718a]">Refreshing</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[#8b93a8]">
          {selectedCount > 0 ? (
            <button type="button" onClick={onRequestDeleteSelected} disabled={isDeletingSelected} className={buttonStyles('danger', 'sm')}>
              Delete selected
            </button>
          ) : null}
          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className={recordListGridClassName + ' border-b border-[#e4e8f1] bg-[#f7f8fc] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6a7288]'}>
          <div className="flex items-center justify-center">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(event) => onToggleSelectAllVisible(event.target.checked)}
              aria-label="Select all visible records"
              className="h-4 w-4 rounded-full border-[#cfd5e4] text-[#4c39df] focus:ring-[#cfd5e4]"
            />
          </div>
          <div>Record Name</div>
          <div>Type</div>
          <div>Source / Contact</div>
          <div>Status</div>
          <div>Follow-up</div>
          <div>Assigned Agent</div>
          <div>Updated</div>
          <div className="text-right">Actions</div>
        </div>

        <div>
          {records.map((record) => (
            <RecordListItem
              key={record.id}
              record={record}
              config={config}
              crmType={crmType}
              isSelected={selectedRecordIds.has(record.id)}
              onToggleSelect={onToggleRecordSelection}
              onEditLead={onEditLead}
              onOpenAction={onOpenAction}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-[#e4e8f1] px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-sm font-medium text-[#667086]">
          Showing {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1}-
          {Math.min(pagination.total, pagination.page * pagination.pageSize)} of {pagination.total} records
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-[#667086]">
            <span>Rows</span>
            <select
              value={pagination.pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-9 rounded-lg border border-[#d9deea] bg-[#f8f9fc] px-3 text-sm text-[#4e566b] focus:border-[#bdc4d8] focus:outline-none"
            >
              {[10, 20, 25].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <div className="text-sm font-medium text-[#667086]">
            Page {pagination.page} of {pagination.totalPages}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!pagination.hasPrevPage}
              onClick={() => onPageChange(pagination.page - 1)}
              className={buttonStyles('secondary', 'sm')}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!pagination.hasNextPage}
              onClick={() => onPageChange(pagination.page + 1)}
              className={buttonStyles('secondary', 'sm')}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
