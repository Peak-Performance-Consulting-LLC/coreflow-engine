import type { Session } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DashboardShell, type DashboardShellHealthItem, type DashboardShellOverview } from '../components/dashboard/DashboardShell';
import type { WorkspaceSetupActionItem } from '../components/dashboard/WorkspaceSetupChecklist';
import type { AppPageGuide } from '../context/AppGuideContext';
import { useAuth } from '../hooks/useAuth';
import { usePageGuide } from '../hooks/useAppGuide';
import { getAccountSettings, type AccountSettingsResponse } from '../lib/account-service';
import {
  fetchCrmWorkspaceConfig,
  getCachedCrmWorkspaceConfig,
  getCachedWorkspaceRecords,
  listWorkspaceRecords,
} from '../lib/crm-service';
import type { CrmStage, CrmWorkspaceConfig, RecordListPageResult, RecordListQuery, RecordSummary } from '../lib/crm-types';
import type { WorkspaceSummary } from '../lib/types';
import { isWorkspaceOwner } from '../lib/utils';
import { listVoiceAgents, type VoiceAgentSummary } from '../lib/voice-agent-service';
import { listVoiceNumbers, type VoiceNumberRecord } from '../lib/voice-service';

const dashboardSetupPopupWorkspaceIdKey = 'coreflow.dashboard.setup-popup-workspace-id';
const dashboardRecordPageSize = 30;

function createDashboardRecordQuery(workspaceId: string): RecordListQuery {
  return {
    workspace_id: workspaceId,
    search: '',
    stage_id: null,
    source_id: null,
    assignee_user_id: null,
    status: null,
    include_archived: false,
    page: 1,
    pageSize: dashboardRecordPageSize,
  };
}

function hasConfiguredWorkspaceEmailSender(
  senders: Array<{
    status: 'pending' | 'connected' | 'failed' | 'disabled';
    is_active: boolean;
  }>,
) {
  return senders.some((sender) => sender.is_active && sender.status === 'connected');
}

function hasConfiguredVoiceNumber(numbers: VoiceNumberRecord[]) {
  return numbers.some((number) => number.provisioning_status !== 'released');
}

function formatActionTitle(count: number, singular: string, plural: string, suffix: string) {
  return `${count} ${count === 1 ? singular : plural} ${suffix}`;
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatAsOfLabel(value: Date) {
  return `As of today at ${new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(value)
    .toLowerCase()}`;
}

function toTitleCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeNonEmptyString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getWelcomeName(session: Session | null) {
  const metadata = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    normalizeNonEmptyString(metadata.full_name) ??
    normalizeNonEmptyString(metadata.name) ??
    normalizeNonEmptyString(metadata.display_name) ??
    normalizeNonEmptyString(metadata.first_name);

  if (fullName) {
    return fullName;
  }

  const email = normalizeNonEmptyString(session?.user.email);
  if (!email) {
    return null;
  }

  return email.split('@')[0] ?? null;
}

function getRecordTitle(record: RecordSummary) {
  return record.title || record.full_name || record.company_name || record.email || record.phone || 'Untitled record';
}

function getRecordSubtitle(record: RecordSummary) {
  const detailParts = [record.full_name, record.company_name, record.email].filter(
    (value): value is string => Boolean(value && value.trim()),
  );

  if (detailParts.length > 0) {
    return detailParts.join(' | ');
  }

  return record.phone ?? 'Workspace record';
}

function isOverdueRecord(record: RecordSummary) {
  if (!record.next_task_due_at) {
    return false;
  }

  return new Date(record.next_task_due_at).getTime() < Date.now();
}

function isDueTodayRecord(record: RecordSummary) {
  if (!record.next_task_due_at) {
    return false;
  }

  const dueDate = new Date(record.next_task_due_at);
  const now = new Date();

  return (
    dueDate.getFullYear() === now.getFullYear() &&
    dueDate.getMonth() === now.getMonth() &&
    dueDate.getDate() === now.getDate()
  );
}

function isUnassignedRecord(record: RecordSummary) {
  return !record.assignee_user_id;
}

function isStaleWorkflowRecord(record: RecordSummary) {
  const referenceValue = record.last_activity_at ?? record.updated_at ?? record.created_at;
  const referenceTime = new Date(referenceValue).getTime();

  if (Number.isNaN(referenceTime)) {
    return false;
  }

  const ageMs = Date.now() - referenceTime;
  return ageMs >= 3 * 24 * 60 * 60 * 1000;
}

function isClosedRecord(record: RecordSummary, stageById: Map<string, CrmStage>) {
  const normalizedStatus = (record.status ?? '').toLowerCase();
  if (['closed', 'won', 'booked', 'completed'].includes(normalizedStatus)) {
    return true;
  }

  if (record.stage_id) {
    return Boolean(stageById.get(record.stage_id)?.is_closed);
  }

  return false;
}

function isWithinLastDays(value: string | null | undefined, days: number) {
  if (!value) {
    return false;
  }

  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return false;
  }

  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
}

function getRecentRecordMeta(record: RecordSummary) {
  if (record.next_task_due_at) {
    const dueLabel = formatDateLabel(record.next_task_due_at);
    if (dueLabel) {
      return record.next_task_title ? `${record.next_task_title} due ${dueLabel}` : `Follow-up due ${dueLabel}`;
    }
  }

  const lastActivityLabel = formatDateLabel(record.last_activity_at ?? record.updated_at ?? record.created_at);
  if (lastActivityLabel) {
    return record.last_activity_type ? `${toTitleCase(record.last_activity_type)} | ${lastActivityLabel}` : `Updated ${lastActivityLabel}`;
  }

  return 'Recently updated';
}

function createSetupActions(params: {
  isOwner: boolean;
  numbers: VoiceNumberRecord[] | null;
  agents: VoiceAgentSummary[] | null;
  accountSettings: AccountSettingsResponse | null;
}): WorkspaceSetupActionItem[] {
  if (!params.isOwner) {
    return [];
  }

  const actions: WorkspaceSetupActionItem[] = [];

  if (params.numbers) {
    const hasNumber = hasConfiguredVoiceNumber(params.numbers);
    actions.push({
      id: 'setup-number',
      title: 'Configure voice number',
      description: 'Get a number to receive inbound calls.',
      to: hasNumber ? '/voice/numbers' : '/voice/numbers/new',
      configured: hasNumber,
      actionLabel: 'Set up number',
    });
  }

  if (params.agents) {
    const hasAssistant = params.agents.length > 0;
    actions.push({
      id: 'setup-assistant',
      title: 'Create assistant',
      description: 'Set up AI to answer calls and capture details.',
      to: hasAssistant ? '/voice/assistants' : '/voice/assistants/new',
      configured: hasAssistant,
      actionLabel: 'Create assistant',
    });
  }

  if (params.accountSettings) {
    const hasEmailConfig = hasConfiguredWorkspaceEmailSender(params.accountSettings.senders);
    actions.push({
      id: 'setup-email',
      title: 'Configure email',
      description: 'Enable invitations and automation emails.',
      to: '/email',
      configured: hasEmailConfig,
      actionLabel: 'Connect email',
    });
  }

  return actions;
}

function buildOverview(params: {
  workspace: WorkspaceSummary;
  currentUserId: string | null;
  welcomeName: string | null;
  isOwner: boolean;
  config: CrmWorkspaceConfig | null;
  records: RecordListPageResult | null;
  setupActions: WorkspaceSetupActionItem[];
  voiceNumbers: VoiceNumberRecord[] | null;
  voiceAgents: VoiceAgentSummary[] | null;
  accountSettings: AccountSettingsResponse | null;
}): DashboardShellOverview {
  const {
    currentUserId,
    welcomeName,
    isOwner,
    config,
    records,
    voiceNumbers,
    voiceAgents,
    accountSettings,
  } = params;

  const pipelines = config?.pipelines ?? [];
  const recentRecords = records?.items ?? [];
  const recordTotal = records?.total ?? 0;
  const activeCustomFieldCount = (config?.customFields ?? []).filter((field) => field.is_active).length;
  const teamCount = config?.assignees.length ?? 0;
  const hasConnectedNumber = voiceNumbers ? hasConfiguredVoiceNumber(voiceNumbers) : false;
  const assistantCount = voiceAgents?.length ?? 0;
  const hasConnectedEmail = accountSettings ? hasConfiguredWorkspaceEmailSender(accountSettings.senders) : false;
  const updatedAtLabel = formatAsOfLabel(new Date());

  const stageById = new Map<string, CrmStage>();
  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages) {
      stageById.set(stage.id, stage);
    }
  }

  const overdueRecordCount = recentRecords.filter(isOverdueRecord).length;
  const unassignedRecordCount = recentRecords.filter(isUnassignedRecord).length;
  const staleWorkflowCount = recentRecords.filter(isStaleWorkflowRecord).length;
  const recentlyCreatedCount = recentRecords.filter((record) => isWithinLastDays(record.created_at, 2)).length;
  const assignedRecordCount = recentRecords.filter((record) => Boolean(record.assignee_user_id)).length;

  const myRecords = currentUserId ? recentRecords.filter((record) => record.assignee_user_id === currentUserId) : [];
  const myDueTodayCount = myRecords.filter(isDueTodayRecord).length;
  const myOverdueCount = myRecords.filter(isOverdueRecord).length;
  const myClosedThisWeekCount = myRecords.filter((record) =>
    isClosedRecord(record, stageById) && isWithinLastDays(record.updated_at ?? record.last_activity_at, 7),
  ).length;
  const workflowSetupRoute = isOwner ? '/records/form-builder' : '/records';
  const teamRoute = isOwner ? '/team' : '/account';

  const primaryPipeline = pipelines.find((pipeline) => pipeline.is_default) ?? pipelines[0] ?? null;
  const pipelineStageCards = primaryPipeline
    ? primaryPipeline.stages.map((stage) => {
        const stageRecords = recentRecords.filter((record) => record.stage_id === stage.id);
        const staleCount = stageRecords.filter(isStaleWorkflowRecord).length;
        const count = stageRecords.length;

        let health: 'stuck' | 'slow' | 'healthy' | 'idle' = 'healthy';
        if (staleCount > 0) {
          health = 'stuck';
        } else if (count === 0) {
          health = 'idle';
        } else if (count <= 2) {
          health = 'slow';
        }

        return {
          id: stage.id,
          name: stage.name,
          count,
          health,
          staleCount,
        };
      })
    : [];

  const stuckStage = pipelineStageCards.reduce<(typeof pipelineStageCards)[number] | null>(
    (selected, stage) => {
      if (stage.staleCount === 0) {
        return selected;
      }

      if (!selected || stage.staleCount > selected.staleCount) {
        return stage;
      }

      return selected;
    },
    null,
  );

  const quickActions = [
    {
      label: 'Open records',
      to: '/records',
      variant: 'primary' as const,
      guideId: 'dashboard-open-records',
    },
    {
      label: 'Create record',
      to: '/records',
      state: { openCreateRecord: true },
      variant: 'secondary' as const,
      guideId: 'dashboard-create-record',
    },
    {
      label: 'Form Builder',
      to: workflowSetupRoute,
      variant: 'secondary' as const,
    },
  ];

  const healthItems: DashboardShellHealthItem[] = [
    {
      id: 'records-queue',
      label: 'Records queue status',
      value: overdueRecordCount > 0 || unassignedRecordCount > 0 ? 'Needs review' : recordTotal > 0 ? 'Active' : 'Empty',
      hint:
        overdueRecordCount > 0 || unassignedRecordCount > 0
          ? `${overdueRecordCount + unassignedRecordCount} items need attention in the current queue snapshot.`
          : recordTotal > 0
            ? 'Recent records are present and ready to be worked.'
            : 'No records have been added to the queue yet.',
      status: overdueRecordCount > 0 || unassignedRecordCount > 0 ? 'warning' : recordTotal > 0 ? 'healthy' : 'pending',
      to: '/records',
      icon: 'records' as const,
    },
    {
      id: 'workflow-health',
      label: 'Workflow health',
      value: stuckStage ? 'Stalled' : primaryPipeline ? 'Healthy' : 'Not configured',
      hint: stuckStage
        ? `${stuckStage.staleCount} records are not moving in ${stuckStage.name}.`
        : primaryPipeline
          ? `${primaryPipeline.stages.length} stages are configured in the active pipeline.`
          : 'No pipeline has been configured for this workspace yet.',
      status: stuckStage ? 'warning' : primaryPipeline ? 'healthy' : 'pending',
      to: primaryPipeline ? '/records' : workflowSetupRoute,
      icon: 'workflow' as const,
    },
    {
      id: 'integrations-status',
      label: 'Integrations status',
      value: `${Number(hasConnectedEmail) + Number(hasConnectedNumber) + Number(assistantCount > 0)}/3 ready`,
      hint: 'Tracks email sending, voice line setup, and assistant availability for this workspace.',
      status: hasConnectedEmail || hasConnectedNumber || assistantCount > 0 ? 'healthy' : 'pending',
      to: '/account',
      icon: 'integrations' as const,
    },
    {
      id: 'channel-setup',
      label: 'Email / voice setup',
      value: hasConnectedEmail && hasConnectedNumber ? 'Ready' : 'Needs setup',
      hint: hasConnectedEmail && hasConnectedNumber
        ? 'Core communication channels are connected and available.'
        : 'Finish channel setup so follow-up and inbound workflows stay available.',
      status: hasConnectedEmail && hasConnectedNumber ? 'healthy' : 'warning',
      to: hasConnectedEmail ? '/voice/numbers' : '/email',
      icon: hasConnectedEmail ? ('voice-number' as const) : ('email' as const),
    },
  ];

  const recommendationCards = [
    {
      id: 'recommendation-records',
      title:
        recentlyCreatedCount > 0
          ? `${formatActionTitle(recentlyCreatedCount, 'new record needs', 'new records need', 'review')}`
          : 'Review new leads',
      description:
        recentlyCreatedCount > 0
          ? 'Check recently created records and follow up quickly before they cool off.'
          : 'Check recently created records and follow up quickly when new work lands.',
      ctaLabel: 'Open records',
      to: '/records',
      tone: recentlyCreatedCount > 0 ? ('warning' as const) : ('neutral' as const),
      icon: 'records' as const,
    },
    {
      id: 'recommendation-workflow',
      title: primaryPipeline ? 'Workflow setup is in place' : 'Complete workflow setup',
      description: primaryPipeline
        ? 'Review your pipeline stages, fields, and automation readiness from one shared structure.'
        : 'Review your pipeline stages, fields, and automation readiness before the queue grows.',
      ctaLabel: primaryPipeline ? 'Review setup' : 'Open setup',
      to: workflowSetupRoute,
      tone: primaryPipeline ? ('success' as const) : ('warning' as const),
      icon: 'workflow' as const,
    },
    {
      id: 'recommendation-queue',
      title:
        overdueRecordCount + unassignedRecordCount + staleWorkflowCount > 0
          ? `${overdueRecordCount + unassignedRecordCount + staleWorkflowCount} records need attention`
          : 'Open active queue',
      description:
        overdueRecordCount + unassignedRecordCount + staleWorkflowCount > 0
          ? 'See records that need updates, owners, or the next clear step in the workspace queue.'
          : 'The queue is moving cleanly right now. Open it to review ownership and next steps.',
      ctaLabel: 'Review queue',
      to: '/records',
      tone:
        overdueRecordCount > 0
          ? ('warning' as const)
          : overdueRecordCount + unassignedRecordCount + staleWorkflowCount > 0
            ? ('neutral' as const)
            : ('success' as const),
      icon: 'queue' as const,
    },
  ];

  const summaryCards = [
    {
      id: 'my-records',
      title: 'My Records',
      icon: 'records' as const,
      filterLabel: currentUserId ? 'Records assigned to me' : 'Records assigned to current user',
      action: { label: 'New', to: '/records', state: { openCreateRecord: true } },
      headline: 'Assigned right now',
      value: String(myRecords.length),
      helperText: myRecords.length > 0
        ? 'Track records assigned to you and keep the next step moving.'
        : 'No recent records are assigned to you yet.',
      highlights: [
        `${myDueTodayCount} follow-ups due today`,
        `${myOverdueCount} overdue items in your queue`,
        myClosedThisWeekCount > 0 ? `${myClosedThisWeekCount} closed this week` : 'No recent closed records yet',
      ],
      footerLabel: 'View report',
      footerTo: '/records',
      updatedAt: updatedAtLabel,
    },
    {
      id: 'my-pipeline',
      title: 'My Pipeline',
      icon: 'pipeline' as const,
      filterLabel: primaryPipeline ? primaryPipeline.name : 'Active pipeline',
      action: { label: 'Open', to: '/records' },
      headline: primaryPipeline ? 'Configured stages' : 'Pipeline status',
      value: primaryPipeline ? String(primaryPipeline.stages.length) : '0',
      helperText: primaryPipeline
        ? 'Monitor the main workspace flow and keep stalled stages visible.'
        : 'Set up a pipeline so the workspace has a shared workflow map.',
      highlights: primaryPipeline
        ? [
            `${recordTotal} live records in the current queue`,
            stuckStage ? `${stuckStage.staleCount} records stuck in ${stuckStage.name}` : 'No major stage bottlenecks detected',
            `${pipelineStageCards.filter((stage) => stage.count > 0).length} active stages with records`,
          ]
        : ['No default pipeline configured yet', 'Open the form builder to define workflow stages', 'Keep records organized with a shared stage model'],
      footerLabel: 'View report',
      footerTo: primaryPipeline ? '/records' : '/records/form-builder',
      updatedAt: updatedAtLabel,
    },
    {
      id: 'team-activity',
      title: 'Team Activity',
      icon: 'team' as const,
      filterLabel: teamCount > 0 ? `${teamCount} workspace members` : 'Workspace team',
      action: { label: isOwner ? 'Open' : 'View', to: teamRoute },
      headline: 'Team members',
      value: String(teamCount),
      helperText: teamCount > 1
        ? 'See how ownership, assistants, and shared queue work are spreading across the workspace.'
        : 'Invite more teammates when you want shared ownership and coverage.',
      highlights: [
        `${assignedRecordCount} records currently have an owner`,
        `${unassignedRecordCount} records still need assignment`,
        `${assistantCount} assistants ready for workspace support`,
      ],
      footerLabel: 'View report',
      footerTo: teamRoute,
      updatedAt: updatedAtLabel,
    },
  ];

  const sortedRecentRecords = [...recentRecords].sort((left, right) => {
    const leftTime = new Date(left.updated_at ?? left.created_at).getTime();
    const rightTime = new Date(right.updated_at ?? right.created_at).getTime();
    return rightTime - leftTime;
  });

  const queueItems = [...recentRecords]
    .map((record) => {
      if (isOverdueRecord(record)) {
        return {
          id: `${record.id}-overdue`,
          title: getRecordTitle(record),
          description: 'A follow-up is overdue and should be handled before new work stacks up.',
          meta: getRecentRecordMeta(record),
          priorityLabel: 'Urgent',
          priorityTone: 'urgent' as const,
          ctaLabel: 'Start follow-up',
          to: `/records/${record.id}`,
        };
      }

      if (isUnassignedRecord(record)) {
        return {
          id: `${record.id}-unassigned`,
          title: getRecordTitle(record),
          description: 'This record still needs an owner so the next step is clearly assigned.',
          meta: getRecentRecordMeta(record),
          priorityLabel: 'Assign owner',
          priorityTone: 'warning' as const,
          ctaLabel: 'Assign',
          to: `/records/${record.id}`,
        };
      }

      if (isStaleWorkflowRecord(record) && !isClosedRecord(record, stageById)) {
        const stageLabel = record.stage_id ? stageById.get(record.stage_id)?.name ?? 'current stage' : 'current stage';
        return {
          id: `${record.id}-stale`,
          title: getRecordTitle(record),
          description: `No recent movement in ${stageLabel}. Review the next step and keep the workflow progressing.`,
          meta: getRecentRecordMeta(record),
          priorityLabel: 'Review',
          priorityTone: 'neutral' as const,
          ctaLabel: 'Review',
          to: `/records/${record.id}`,
        };
      }

      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 4);

  const setupItems = [
    {
      id: 'setup-records-queue',
      label: 'Records queue',
      detail:
        recordTotal > 0
          ? 'Records are already flowing through the shared workspace queue.'
          : 'Add records so the shared queue becomes active for the team.',
      statusLabel: recordTotal > 0 ? 'Active' : 'Pending',
      status: recordTotal > 0 ? ('healthy' as const) : ('pending' as const),
      to: '/records',
    },
    {
      id: 'setup-workflow',
      label: 'Workflow configuration',
      detail: primaryPipeline
        ? `${primaryPipeline.stages.length} stages are configured in the primary workflow.`
        : 'Build a shared stage model so all records follow the same process.',
      statusLabel: primaryPipeline ? 'Healthy' : 'Needs setup',
      status: primaryPipeline ? ('healthy' as const) : ('warning' as const),
      to: workflowSetupRoute,
    },
    {
      id: 'setup-fields',
      label: 'Custom fields',
      detail:
        activeCustomFieldCount > 0
          ? `${activeCustomFieldCount} active custom fields extend the workspace schema.`
          : 'Only default fields are active right now.',
      statusLabel: activeCustomFieldCount > 0 ? 'Ready' : 'Pending',
      status: activeCustomFieldCount > 0 ? ('healthy' as const) : ('pending' as const),
      to: workflowSetupRoute,
    },
    {
      id: 'setup-team',
      label: 'Team access',
      detail:
        teamCount > 1
          ? `${teamCount} team members can work inside this workspace.`
          : 'Invite teammates when you need shared ownership and coverage.',
      statusLabel: teamCount > 1 ? 'Ready' : 'Pending',
      status: teamCount > 1 ? ('healthy' as const) : ('pending' as const),
      to: teamRoute,
    },
    {
      id: 'setup-email',
      label: 'Email sender',
      detail: hasConnectedEmail
        ? 'A connected sender is ready for notifications and future automation.'
        : 'Connect an email sender to support invites and outreach.',
      statusLabel: hasConnectedEmail ? 'Ready' : 'Needs setup',
      status: hasConnectedEmail ? ('healthy' as const) : ('warning' as const),
      to: '/email',
    },
    {
      id: 'setup-voice',
      label: 'Voice numbers',
      detail: hasConnectedNumber
        ? 'Voice routing is configured for inbound call workflows.'
        : 'Provision a workspace number to enable inbound voice coverage.',
      statusLabel: hasConnectedNumber ? 'Ready' : 'Needs setup',
      status: hasConnectedNumber ? ('healthy' as const) : ('warning' as const),
      to: hasConnectedNumber ? '/voice/numbers' : '/voice/numbers/new',
    },
  ];

  return {
    panelEyebrow: 'Workspace overview',
    panelTitle: welcomeName ? `Welcome back, ${welcomeName}` : 'Welcome back',
    panelSubtitle: "Here's what needs your attention today.",
    panelLink: {
      label: 'View all actions',
      to: '/records',
      variant: 'link',
    },
    quickActions,
    recommendations: recommendationCards,
    quickStats: [
      {
        id: 'stat-records',
        label: 'Total records',
        value: String(recordTotal),
        detail: recordTotal > 0 ? 'Live workspace queue' : 'Ready for first record',
      },
      {
        id: 'stat-pipelines',
        label: 'Pipelines',
        value: String(pipelines.length),
        detail: pipelines.length > 0 ? 'Shared workflow map' : 'No active pipeline yet',
      },
      {
        id: 'stat-custom-fields',
        label: 'Custom fields',
        value: String(activeCustomFieldCount),
        detail: activeCustomFieldCount > 0 ? 'Schema extensions active' : 'Defaults only',
      },
      {
        id: 'stat-team',
        label: 'Team members',
        value: String(teamCount),
        detail: teamCount > 0 ? 'Workspace access provisioned' : 'No assignees configured',
      },
    ],
    summaryCards,
    recentRecordsFilterLabel: 'Recent workspace records',
    recentRecords: sortedRecentRecords.slice(0, 4).map((record) => {
      const stageLabel = record.stage_id ? stageById.get(record.stage_id)?.name ?? null : null;
      const closed = isClosedRecord(record, stageById);
      const overdue = isOverdueRecord(record);

      let statusLabel = 'Active';
      let statusTone: 'warning' | 'success' | 'neutral' = 'neutral';

      if (overdue) {
        statusLabel = 'Follow-up overdue';
        statusTone = 'warning';
      } else if (isUnassignedRecord(record)) {
        statusLabel = 'Unassigned';
        statusTone = 'warning';
      } else if (closed) {
        statusLabel = 'Closed';
        statusTone = 'success';
      } else if (record.status) {
        statusLabel = toTitleCase(record.status);
      }

      return {
        id: record.id,
        title: getRecordTitle(record),
        subtitle: getRecordSubtitle(record),
        meta: getRecentRecordMeta(record),
        to: `/records/${record.id}`,
        stageLabel,
        statusLabel,
        statusTone,
      };
    }),
    queueFilterLabel: 'Needs attention',
    queueItems,
    setupFilterLabel: 'Workspace readiness',
    setupItems,
    healthItems,
    updatedAtLabel,
  };
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { session, workspace, signOut } = useAuth();
  const currentUserId = session?.user.id ?? null;
  const welcomeName = useMemo(() => getWelcomeName(session), [session]);
  const [setupActions, setSetupActions] = useState<WorkspaceSetupActionItem[]>([]);
  const [setupActionsLoading, setSetupActionsLoading] = useState(false);
  const [setupActionsReady, setSetupActionsReady] = useState(false);
  const [showSetupPopup, setShowSetupPopup] = useState(false);
  const [overview, setOverview] = useState<DashboardShellOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const isOwner = isWorkspaceOwner(workspace);
  const guide = useMemo<AppPageGuide>(
    () => ({
      key: 'dashboard-overview',
      title: 'Workspace dashboard overview',
      summary:
        'This page acts like a shared CRM home dashboard so users can see recommendations, queue signals, and workspace readiness in one place.',
      nextStep: 'Use the overview cards to review records, check pipeline pressure, and open the next action quickly.',
      highlights: ['Shared CRM overview', 'Command center actions', 'Cross-workspace handoff'],
      autoStart: 'once' as const,
      steps: [
        {
          id: 'dashboard-hero',
          title: 'Start from the workspace home',
          body: 'This panel highlights the recommended next actions so users can jump into the queue, setup, or review flow quickly.',
          targetId: 'dashboard-hero',
        },
        {
          id: 'dashboard-open-records',
          title: 'Open the record queue',
          body: 'Use this when the next job is reviewing or managing existing records in the shared workspace.',
          targetId: 'dashboard-open-records',
        },
        {
          id: 'dashboard-create-record',
          title: 'Create a record immediately',
          body: 'This shortcut opens the create flow directly from the dashboard when a user needs to log a new record quickly.',
          targetId: 'dashboard-create-record',
          placement: 'top',
        },
      ],
    }),
    [],
  );

  usePageGuide(guide);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      if (!session || !workspace) {
        setSetupActions([]);
        setSetupActionsLoading(false);
        setSetupActionsReady(true);
        setOverview(null);
        setOverviewLoading(false);
        return;
      }

      const recordQuery = createDashboardRecordQuery(workspace.id);
      const cachedConfig = getCachedCrmWorkspaceConfig(workspace.id);
      const cachedRecords = getCachedWorkspaceRecords(recordQuery) ?? null;

      if (cachedConfig || cachedRecords) {
        setOverview(
          buildOverview({
            workspace,
            currentUserId,
            welcomeName,
            isOwner,
            config: cachedConfig,
            records: cachedRecords,
            setupActions: [],
            voiceNumbers: null,
            voiceAgents: null,
            accountSettings: null,
          }),
        );
        setOverviewLoading(false);
      } else {
        setOverviewLoading(true);
      }

      setSetupActionsReady(false);
      setSetupActionsLoading(isOwner);

      const requests: [
        PromiseSettledResult<CrmWorkspaceConfig>,
        PromiseSettledResult<RecordListPageResult>,
        PromiseSettledResult<{ numbers: VoiceNumberRecord[] }> | null,
        PromiseSettledResult<{ agents: VoiceAgentSummary[] }> | null,
        PromiseSettledResult<AccountSettingsResponse> | null,
      ] = await Promise.all([
        fetchCrmWorkspaceConfig(session, workspace.id).then(
          (value) => ({ status: 'fulfilled', value }) as PromiseFulfilledResult<CrmWorkspaceConfig>,
          (reason) => ({ status: 'rejected', reason }) as PromiseRejectedResult,
        ),
        listWorkspaceRecords(session, recordQuery).then(
          (value) => ({ status: 'fulfilled', value }) as PromiseFulfilledResult<RecordListPageResult>,
          (reason) => ({ status: 'rejected', reason }) as PromiseRejectedResult,
        ),
        isOwner
          ? listVoiceNumbers(session, workspace.id, true).then(
              (value) => ({ status: 'fulfilled', value }) as PromiseFulfilledResult<{ numbers: VoiceNumberRecord[] }>,
              (reason) => ({ status: 'rejected', reason }) as PromiseRejectedResult,
            )
          : Promise.resolve(null),
        isOwner
          ? listVoiceAgents(session, workspace.id).then(
              (value) => ({ status: 'fulfilled', value }) as PromiseFulfilledResult<{ agents: VoiceAgentSummary[] }>,
              (reason) => ({ status: 'rejected', reason }) as PromiseRejectedResult,
            )
          : Promise.resolve(null),
        isOwner
          ? getAccountSettings(session, workspace.id).then(
              (value) => ({ status: 'fulfilled', value }) as PromiseFulfilledResult<AccountSettingsResponse>,
              (reason) => ({ status: 'rejected', reason }) as PromiseRejectedResult,
            )
          : Promise.resolve(null),
      ]) as [
        PromiseSettledResult<CrmWorkspaceConfig>,
        PromiseSettledResult<RecordListPageResult>,
        PromiseSettledResult<{ numbers: VoiceNumberRecord[] }> | null,
        PromiseSettledResult<{ agents: VoiceAgentSummary[] }> | null,
        PromiseSettledResult<AccountSettingsResponse> | null,
      ];

      if (cancelled) {
        return;
      }

      const config = requests[0]?.status === 'fulfilled' ? requests[0].value : cachedConfig;
      const records = requests[1]?.status === 'fulfilled' ? requests[1].value : cachedRecords;
      const voiceNumberResponse = requests[2]?.status === 'fulfilled' ? requests[2].value : null;
      const voiceAgentResponse = requests[3]?.status === 'fulfilled' ? requests[3].value : null;
      const accountSettings = requests[4]?.status === 'fulfilled' ? requests[4].value : null;

      const nextSetupActions = createSetupActions({
        isOwner,
        numbers: voiceNumberResponse?.numbers ?? null,
        agents: voiceAgentResponse?.agents ?? null,
        accountSettings,
      });

      setSetupActions(nextSetupActions);
      setSetupActionsLoading(false);
      setSetupActionsReady(true);
      setOverview(
        buildOverview({
          workspace,
          currentUserId,
          welcomeName,
          isOwner,
          config,
          records,
          setupActions: nextSetupActions,
          voiceNumbers: voiceNumberResponse?.numbers ?? null,
          voiceAgents: voiceAgentResponse?.agents ?? null,
          accountSettings,
        }),
      );
      setOverviewLoading(false);
    }

    void loadDashboardData();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, isOwner, session, welcomeName, workspace]);

  useEffect(() => {
    if (typeof window === 'undefined' || !workspace || setupActionsLoading || !setupActionsReady) {
      return;
    }

    const flaggedWorkspaceId = window.sessionStorage.getItem(dashboardSetupPopupWorkspaceIdKey);

    if (flaggedWorkspaceId !== workspace.id) {
      return;
    }

    const missingSetup = setupActions.filter((action) => !action.configured);
    if (missingSetup.length > 0) {
      setShowSetupPopup(true);
    }

    window.sessionStorage.removeItem(dashboardSetupPopupWorkspaceIdKey);
  }, [workspace, setupActionsLoading, setupActionsReady, setupActions]);

  if (!workspace) {
    return null;
  }

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  return (
    <DashboardShell
      workspace={workspace}
      onSignOut={handleSignOut}
      overview={
        overview ??
        buildOverview({
          workspace,
          currentUserId,
          welcomeName,
          isOwner,
          config: null,
          records: null,
          setupActions,
          voiceNumbers: null,
          voiceAgents: null,
          accountSettings: null,
        })
      }
      overviewLoading={overviewLoading}
      setupActions={setupActions}
      showSetupPopup={showSetupPopup}
      onCloseSetupPopup={() => setShowSetupPopup(false)}
    />
  );
}

