import type { CrmWorkspaceConfig, RecordListFilters, RecordSummary } from './crm-types';
import type { CRMType } from './types';
import { getInitials } from './utils';

interface SummaryBlueprint {
  fieldKeys: string[];
  typeFieldKeys: string[];
  emptyHint: string;
  zeroStateTitle: string;
  zeroStateBody: string;
  filteredEmptyTitle: string;
  filteredEmptyBody: string;
}

export interface WorkbenchMetric {
  label: string;
  value: number;
  hint: string;
}

export interface FilterChip {
  key: keyof Omit<RecordListFilters, 'workspace_id'>;
  label: string;
  value: string;
}

export interface RecordIdentityDisplay {
  initials: string;
  title: string;
  subtitle: string;
  supportingTag: string | null;
}

export interface RecordFollowUpSummary {
  label: string;
  taskTitle: string;
  detail: string;
  tone: 'none' | 'pending' | 'today' | 'overdue';
}

function normalizeTaskTitle(value: string | null | undefined) {
  const nextValue = value?.trim();
  return nextValue && nextValue.length > 0 ? nextValue : null;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const summaryBlueprints: Record<CRMType, SummaryBlueprint> = {
  'real-estate': {
    fieldKeys: ['property_type', 'budget', 'preferred_location'],
    typeFieldKeys: ['property_type'],
    emptyHint: 'Property preferences will appear here once the lead profile is filled in.',
    zeroStateTitle: 'No active property opportunities yet',
    zeroStateBody: 'Add a buyer or seller lead to start tracking property preferences, stages, and follow-ups in one place.',
    filteredEmptyTitle: 'No property matches for these filters',
    filteredEmptyBody: 'Try broadening your queue filters to surface more buyer and seller conversations.',
  },
  'gas-station': {
    fieldKeys: ['station_type', 'fuel_brand', 'service_needs'],
    typeFieldKeys: ['station_type'],
    emptyHint: 'Station profile details will show here after the first operational intake.',
    zeroStateTitle: 'No station accounts in the queue yet',
    zeroStateBody: 'Create a station record to track service needs, supplier touchpoints, and operational approvals.',
    filteredEmptyTitle: 'No station accounts match these filters',
    filteredEmptyBody: 'Clear or widen your queue filters to surface more station operations work.',
  },
  'convenience-store': {
    fieldKeys: ['store_format', 'primary_category', 'operating_hours'],
    typeFieldKeys: ['store_format', 'primary_category'],
    emptyHint: 'Store profile details will show here after the first intake.',
    zeroStateTitle: 'No store accounts ready for action yet',
    zeroStateBody: 'Create a store record to keep restock, support, and activation work moving from one queue.',
    filteredEmptyTitle: 'No store accounts match these filters',
    filteredEmptyBody: 'Adjust the queue filters to bring back store conversations that need attention.',
  },
  restaurant: {
    fieldKeys: ['cuisine_type', 'investment_budget', 'target_area'],
    typeFieldKeys: ['cuisine_type'],
    emptyHint: 'Restaurant profile details will show here after the first discovery update.',
    zeroStateTitle: 'No restaurant opportunities yet',
    zeroStateBody: 'Create a restaurant record to track expansion, launch planning, and guest-facing follow-ups.',
    filteredEmptyTitle: 'No restaurant opportunities match these filters',
    filteredEmptyBody: 'Try a broader search or clear filters to reopen the restaurant work queue.',
  },
  'auto-repair': {
    fieldKeys: ['vehicle_make', 'vehicle_model', 'service_type'],
    typeFieldKeys: ['service_type', 'vehicle_make'],
    emptyHint: 'Vehicle and service details will show here after intake.',
    zeroStateTitle: 'No repair jobs in the queue yet',
    zeroStateBody: 'Create a repair record to manage vehicle intake, approvals, and pickup commitments in one workflow.',
    filteredEmptyTitle: 'No repair jobs match these filters',
    filteredEmptyBody: 'Widen the queue filters to surface more service work waiting on the team.',
  },
};

function getSummaryBlueprint(crmType: CRMType) {
  return summaryBlueprints[crmType];
}

function fieldLabel(config: CrmWorkspaceConfig, fieldKey: string) {
  return config.customFields.find((field) => field.field_key === fieldKey)?.label ?? fieldKey;
}

function normalizeText(value: string | null | undefined) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : null;
}

function formatLabel(value: string) {
  return value
    .replaceAll('_', ' ')
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatCustomValue(fieldKey: string, value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : null;
  }

  if (typeof value === 'number') {
    if (fieldKey.includes('budget') || fieldKey.includes('investment')) {
      return currencyFormatter.format(value);
    }

    return currencyFormatter.format(value);
  }

  if (Array.isArray(value)) {
    const normalized = value.map((item) => String(item)).filter(Boolean);
    return normalized.length > 0 ? normalized.join(', ') : null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function isClosedRecord(record: RecordSummary, config: CrmWorkspaceConfig) {
  const stage = config.pipelines.flatMap((pipeline) => pipeline.stages).find((item) => item.id === record.stage_id);
  return record.status === 'closed' || Boolean(stage?.is_closed);
}

export function getStageDetails(config: CrmWorkspaceConfig, stageId: string | null) {
  return config.pipelines.flatMap((pipeline) => pipeline.stages).find((item) => item.id === stageId) ?? null;
}

export function getStageName(config: CrmWorkspaceConfig, stageId: string | null) {
  return getStageDetails(config, stageId)?.name ?? 'Unstaged';
}

export function getSourceName(config: CrmWorkspaceConfig, sourceId: string | null, importedFrom?: string | null) {
  return config.sources.find((source) => source.id === sourceId)?.name ?? normalizeText(importedFrom) ?? 'Direct';
}

export function getRecordIdentity(record: RecordSummary): RecordIdentityDisplay {
  const title =
    normalizeText(record.title) ??
    normalizeText(record.full_name) ??
    normalizeText(record.company_name) ??
    normalizeText(record.email) ??
    'Untitled record';
  const fullName = normalizeText(record.full_name);
  const companyName = normalizeText(record.company_name);
  const email = normalizeText(record.email);
  const phone = normalizeText(record.phone);
  const subtitleParts = [fullName, email ?? companyName ?? phone].filter(
    (item, index, array): item is string => Boolean(item) && array.indexOf(item) === index && item !== title,
  );

  return {
    initials: getInitials(fullName ?? companyName ?? title),
    title,
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(' | ') : 'No primary contact details yet.',
    supportingTag: companyName && companyName !== title ? companyName : null,
  };
}

export function getRecordTypeLabel(record: RecordSummary, config: CrmWorkspaceConfig, crmType: CRMType) {
  const blueprint = getSummaryBlueprint(crmType);
  const custom = record.custom ?? {};

  for (const fieldKey of blueprint.typeFieldKeys) {
    const formattedValue = formatCustomValue(fieldKey, custom[fieldKey]);

    if (formattedValue) {
      return formattedValue;
    }
  }

  const normalizedRecordType = normalizeText(record.record_type);

  if (normalizedRecordType && normalizedRecordType.toLowerCase() !== 'lead') {
    return formatLabel(normalizedRecordType);
  }

  const fallbackField = config.customFields.find((field) => {
    const key = field.field_key.toLowerCase();
    return (
      ['text', 'select', 'multi_select'].includes(field.field_type) &&
      (key.includes('type') || key.includes('category') || key.includes('format') || key.includes('service'))
    );
  });

  if (fallbackField) {
    const formattedValue = formatCustomValue(fallbackField.field_key, custom[fallbackField.field_key]);

    if (formattedValue) {
      return formattedValue;
    }
  }

  return 'Lead';
}

export function formatRecordCreatedDate(value: string | null | undefined) {
  if (!value) {
    return 'Recently added';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Recently added';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const day = date.getDay();
  const distance = day === 0 ? 6 : day - 1;
  const result = new Date(date);
  result.setDate(date.getDate() - distance);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function buildOperationalMetrics(records: RecordSummary[], config: CrmWorkspaceConfig): WorkbenchMetric[] {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);
  const weekStart = startOfWeek(now);
  const staleCutoff = new Date(now);
  staleCutoff.setDate(now.getDate() - 7);

  const openRecords = records.filter((record) => !isClosedRecord(record, config)).length;
  const followUpsDueToday = records.filter((record) => {
    if (!record.next_follow_up_at) {
      return false;
    }

    const dueAt = new Date(record.next_follow_up_at);
    return dueAt >= todayStart && dueAt < tomorrowStart;
  }).length;
  const staleRecords = records.filter((record) => {
    if (isClosedRecord(record, config)) {
      return false;
    }

    const lastTouchedAt = new Date(record.last_activity_at ?? record.updated_at);
    return lastTouchedAt < staleCutoff;
  }).length;
  const updatedToday = records.filter((record) => new Date(record.updated_at) >= todayStart).length;
  const closedThisWeek = records.filter((record) => {
    if (!isClosedRecord(record, config)) {
      return false;
    }

    return new Date(record.updated_at) >= weekStart;
  }).length;

  return [
    {
      label: 'Open records',
      value: openRecords,
      hint: 'Records still in an active stage or status.',
    },
    {
      label: 'Follow-ups due today',
      value: followUpsDueToday,
      hint: 'Based on the next linked task due date.',
    },
    {
      label: 'Stale records',
      value: staleRecords,
      hint: 'No activity or update in the last 7 days.',
    },
    {
      label: 'Updated today',
      value: updatedToday,
      hint: 'Records touched by the team today.',
    },
    {
      label: 'Closed this week',
      value: closedThisWeek,
      hint: 'Moved into a closed stage or closed status this week.',
    },
  ];
}

export function buildActiveFilterChips(
  filters: Omit<RecordListFilters, 'workspace_id'>,
  config: CrmWorkspaceConfig,
): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.search.trim()) {
    chips.push({
      key: 'search',
      label: 'Search',
      value: filters.search.trim(),
    });
  }

  if (filters.stage_id) {
    const stageName =
      config.pipelines.flatMap((pipeline) => pipeline.stages).find((stage) => stage.id === filters.stage_id)?.name ??
      'Stage';

    chips.push({
      key: 'stage_id',
      label: 'Stage',
      value: stageName,
    });
  }

  if (filters.source_id) {
    chips.push({
      key: 'source_id',
      label: 'Source',
      value: config.sources.find((source) => source.id === filters.source_id)?.name ?? 'Source',
    });
  }

  if (filters.assignee_user_id) {
    chips.push({
      key: 'assignee_user_id',
      label: 'Owner',
      value:
        config.assignees.find((assignee) => assignee.userId === filters.assignee_user_id)?.fullName ?? 'Assigned',
    });
  }

  if (filters.status) {
    chips.push({
      key: 'status',
      label: 'Status',
      value: filters.status,
    });
  }

  return chips;
}

export function getIndustrySummary(record: RecordSummary, config: CrmWorkspaceConfig, crmType: CRMType) {
  const blueprint = getSummaryBlueprint(crmType);
  const custom = record.custom ?? {};
  const items = blueprint.fieldKeys
    .map((fieldKey) => {
      const formattedValue = formatCustomValue(fieldKey, custom[fieldKey]);

      if (!formattedValue) {
        return null;
      }

      return `${fieldLabel(config, fieldKey)}: ${formattedValue}`;
    })
    .filter((item): item is string => Boolean(item));

  if (items.length > 0) {
    return items;
  }

  const fallback = config.customFields
    .map((field) => {
      const formattedValue = formatCustomValue(field.field_key, custom[field.field_key]);

      if (!formattedValue) {
        return null;
      }

      return `${field.label}: ${formattedValue}`;
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);

  return fallback.length > 0 ? fallback : [blueprint.emptyHint];
}

export function getWorkbenchEmptyState(crmType: CRMType, hasActiveFilters: boolean) {
  const blueprint = getSummaryBlueprint(crmType);

  return hasActiveFilters
    ? {
        title: blueprint.filteredEmptyTitle,
        body: blueprint.filteredEmptyBody,
      }
    : {
        title: blueprint.zeroStateTitle,
        body: blueprint.zeroStateBody,
      };
}

export function formatRelativeDateTime(value: string | null | undefined) {
  if (!value) {
    return 'No recent activity';
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return 'No recent activity';
  }

  const now = Date.now();
  const diffMs = timestamp - now;
  const diffMinutes = Math.round(diffMs / 60000);
  const absoluteMinutes = Math.abs(diffMinutes);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (absoluteMinutes < 60) {
    return rtf.format(diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour');
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) {
    return rtf.format(diffDays, 'day');
  }

  return new Date(value).toLocaleDateString();
}

export function formatFollowUpDate(value: string | null | undefined) {
  if (!value) {
    return 'No follow-up set';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'No follow-up set';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function formatFollowUpDateTime(value: string | null | undefined) {
  if (!value) {
    return 'No follow-up set';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'No follow-up set';
  }

  const includesExplicitTime = /T\d{2}:\d{2}/.test(value);
  const hasMeaningfulTime = includesExplicitTime && !/T00:00(?::00(?:\.000)?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value);

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(hasMeaningfulTime
      ? {
          hour: 'numeric',
          minute: '2-digit',
        }
      : {}),
  });
}

export function getRecordFollowUpSummary(record: RecordSummary): RecordFollowUpSummary {
  const openTaskCount = record.open_task_count ?? 0;
  const openTaskLabel = `${openTaskCount} open task${openTaskCount === 1 ? '' : 's'}`;
  const nextTaskTitle = normalizeTaskTitle(record.next_task_title);

  if (openTaskCount < 1) {
    return {
      label: 'No follow-up',
      taskTitle: 'No open tasks linked',
      detail: 'No open tasks linked',
      tone: 'none',
    };
  }

  if (!record.next_follow_up_at) {
    return {
      label: 'Follow-up unscheduled',
      taskTitle: nextTaskTitle ?? 'Open task without a due date',
      detail: `${openTaskLabel} without a due date`,
      tone: 'pending',
    };
  }

  const dueAt = new Date(record.next_follow_up_at);

  if (Number.isNaN(dueAt.getTime())) {
    return {
      label: 'Follow-up scheduled',
      taskTitle: nextTaskTitle ?? 'Open follow-up task',
      detail: `${openTaskLabel} linked`,
      tone: 'pending',
    };
  }

  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);

  if (dueAt < todayStart) {
    return {
      label: 'Overdue follow-up',
      taskTitle: nextTaskTitle ?? 'Open follow-up task',
      detail: `Due ${formatFollowUpDateTime(record.next_follow_up_at)} - ${openTaskLabel}`,
      tone: 'overdue',
    };
  }

  if (dueAt < tomorrowStart) {
    return {
      label: 'Due today',
      taskTitle: nextTaskTitle ?? 'Open follow-up task',
      detail: `${formatFollowUpDateTime(record.next_follow_up_at)} - ${openTaskLabel}`,
      tone: 'today',
    };
  }

  return {
    label: 'Next follow-up',
    taskTitle: nextTaskTitle ?? 'Open follow-up task',
    detail: `${formatFollowUpDateTime(record.next_follow_up_at)} - ${openTaskLabel}`,
    tone: 'pending',
  };
}

export function formatActivityLabel(activityType: string | null | undefined) {
  if (!activityType) {
    return 'Updated';
  }

  return activityType
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

