import { DatabaseZap, SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CrmWorkspaceConfig, RecordListPageResult, RecordSummary } from '../../lib/crm-types';
import type { CRMType } from '../../lib/types';
import { getWorkbenchEmptyState } from '../../lib/record-workbench';
import { formatCrmLabel } from '../../lib/utils';
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
  pagination: Pick<RecordListPageResult, 'page' | 'pageSize' | 'total' | 'totalPages' | 'hasNextPage' | 'hasPrevPage'>;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onCreateRecord: () => void;
  onClearFilters: () => void;
  onEditLead: (record: RecordSummary) => void;
  onOpenAction: (record: RecordSummary, mode: Exclude<RecordQuickActionMode, null>) => void;
}

interface RecordListSkeletonProps {
  rows?: number;
}

export function RecordListSkeleton({ rows = 6 }: RecordListSkeletonProps) {
  return (
    <Card className="p-0">
      <div className="flex flex-col gap-3 border-b border-slate-300 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-3 w-32 rounded-full bg-[#F1F5F9]" />
          <div className="mt-3 h-6 w-56 rounded-full bg-[#F1F5F9]" />
        </div>
        <div className="h-8 w-28 rounded-full bg-[#F1F5F9]" />
      </div>

      <div className="overflow-x-auto">
        <div className={recordListGridClassName + ' border-b border-slate-300 bg-slate-50 px-5 py-3'}>
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-3 w-20 rounded-full bg-[#F1F5F9]" />
          ))}
        </div>

        <div>
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className={recordListGridClassName + ' border-b border-slate-300 px-5 py-3'}>
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-[#F1F5F9]" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-40 rounded-full bg-[#F1F5F9]" />
                  <div className="mt-2 h-3 w-56 rounded-full bg-[#F1F5F9]" />
                  <div className="mt-3 flex gap-2">
                    <div className="h-6 w-20 rounded-full bg-[#F1F5F9]" />
                    <div className="h-6 w-24 rounded-full bg-[#F1F5F9]" />
                  </div>
                </div>
              </div>
              <div className="h-4 w-28 rounded-full bg-[#F1F5F9]" />
              <div className="h-8 w-24 rounded-full bg-[#F1F5F9]" />
              <div className="h-8 w-24 rounded-full bg-[#F1F5F9]" />
              <div className="h-8 w-24 rounded-full bg-[#F1F5F9]" />
              <div>
                <div className="h-4 w-28 rounded-full bg-[#F1F5F9]" />
                <div className="mt-2 h-3 w-24 rounded-full bg-[#F1F5F9]" />
              </div>
              <div>
                <div className="h-5 w-32 rounded-full bg-[#F1F5F9]" />
                <div className="mt-2 h-4 w-36 rounded-full bg-[#F1F5F9]" />
                <div className="mt-2 h-3 w-28 rounded-full bg-[#F1F5F9]" />
              </div>
              <div className="ml-auto h-10 w-10 rounded-xl bg-[#F1F5F9]" />
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
  pagination,
  onPageChange,
  onPageSizeChange,
  onCreateRecord,
  onClearFilters,
  onEditLead,
  onOpenAction,
}: RecordListProps) {
  if (records.length === 0) {
    const emptyState = getWorkbenchEmptyState(crmType, hasActiveFilters);
    const EmptyIcon = hasActiveFilters ? SearchX : DatabaseZap;

    return (
      <Card className="p-10">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-accent-blue/25 bg-accent-blue/10 text-accent-blue">
            <EmptyIcon className="h-7 w-7" />
          </div>
          <div className="mt-5 inline-flex rounded-full border border-accent-blue/25 bg-accent-blue/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-accent-blue">
            Shared CRM work queue
          </div>
          <h3 className="mt-5 font-display text-3xl text-slate-900">{emptyState.title}</h3>
          <p className="mt-3 text-sm leading-7 text-slate-600">{emptyState.body}</p>
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
    <Card className="p-0">
      <div className="flex flex-col gap-4 border-b border-slate-300 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-accent-blue">{formatCrmLabel(crmType)} records desk</div>
          <h3 className="mt-2 font-display text-2xl text-slate-900">Compact queue view</h3>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-700">
            {records.length} visible record{records.length === 1 ? '' : 's'}
          </span>
          <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-700">
            {config.sources.length} sources
          </span>
          {isRefreshing ? (
            <span className="rounded-full border border-accent-blue/25 bg-accent-blue/10 px-3 py-1 text-accent-blue">
              Refreshing list...
            </span>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className={recordListGridClassName + ' border-b border-slate-300 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600'}>
          <div>Lead</div>
          <div>Phone</div>
          <div>Type</div>
          <div>Stage</div>
          <div>Source</div>
          <div>Date added</div>
          <div>Follow-up</div>
          <div className="text-right">Actions</div>
        </div>

        <div>
          {records.map((record) => (
            <RecordListItem
              key={record.id}
              record={record}
              config={config}
              crmType={crmType}
              onEditLead={onEditLead}
              onOpenAction={onOpenAction}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-300 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-sm text-slate-500">
          Showing {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1}-
          {Math.min(pagination.total, pagination.page * pagination.pageSize)} of {pagination.total} records
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-500">
            <span>Rows</span>
            <select
              value={pagination.pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              {[10, 20, 25].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <div className="text-sm text-slate-500">
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
