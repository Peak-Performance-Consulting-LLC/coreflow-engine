import { useEffect, useState } from 'react';
import type { CrmWorkspaceConfig, RecordSaveInput, RecordSummary } from '../../lib/crm-types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { FieldRenderer } from './FieldRenderer';

interface RecordFormProps {
  workspaceId: string;
  config: CrmWorkspaceConfig;
  initialRecord?: RecordSummary | null;
  initialCustom?: Record<string, unknown>;
  submitLabel: string;
  onSubmit: (payload: RecordSaveInput) => Promise<void>;
}

function firstStageForPipeline(config: CrmWorkspaceConfig, pipelineId: string | null) {
  return config.pipelines.find((pipeline) => pipeline.id === pipelineId)?.stages[0]?.id ?? null;
}

function isClosedStage(config: CrmWorkspaceConfig, stageId: string | null) {
  if (!stageId) {
    return false;
  }

  return config.pipelines.flatMap((pipeline) => pipeline.stages).some((stage) => stage.id === stageId && stage.is_closed);
}

function filledCustomFieldCount(custom: Record<string, unknown>) {
  return Object.values(custom).filter((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }).length;
}

type RecordFormCoreState = {
  title: string;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  source_id: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  assignee_user_id: string | null;
  status: string | null;
  priority: string | null;
};

export function RecordForm({
  workspaceId,
  config,
  initialRecord,
  initialCustom,
  submitLabel,
  onSubmit,
}: RecordFormProps) {
  const defaultPipelineId = initialRecord?.pipeline_id ?? config.pipelines.find((pipeline) => pipeline.is_default)?.id ?? null;
  const [core, setCore] = useState<RecordFormCoreState>({
    title: initialRecord?.title ?? '',
    full_name: initialRecord?.full_name ?? null,
    company_name: initialRecord?.company_name ?? null,
    email: initialRecord?.email ?? null,
    phone: initialRecord?.phone ?? null,
    source_id: initialRecord?.source_id ?? null,
    pipeline_id: defaultPipelineId,
    stage_id: initialRecord?.stage_id ?? firstStageForPipeline(config, defaultPipelineId),
    assignee_user_id: initialRecord?.assignee_user_id ?? null,
    status: initialRecord?.status ?? 'open',
    priority: initialRecord?.priority ?? 'medium',
  });
  const [custom, setCustom] = useState<Record<string, unknown>>(initialCustom ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!core.pipeline_id) {
      return;
    }

    const stages = config.pipelines.find((pipeline) => pipeline.id === core.pipeline_id)?.stages ?? [];

    if (!stages.some((stage) => stage.id === core.stage_id)) {
      setCore((current) => ({
        ...current,
        stage_id: stages[0]?.id ?? null,
      }));
    }
  }, [config.pipelines, core.pipeline_id, core.stage_id]);

  useEffect(() => {
    const stageIsClosed = isClosedStage(config, core.stage_id);

    if (stageIsClosed && core.status !== 'closed') {
      setCore((current) => ({
        ...current,
        status: 'closed',
      }));
      return;
    }

    if (!stageIsClosed && core.status === 'closed') {
      setCore((current) => ({
        ...current,
        status: 'open',
      }));
    }
  }, [config.pipelines, core.stage_id, core.status]);

  const stageOptions = config.pipelines.find((pipeline) => pipeline.id === core.pipeline_id)?.stages ?? [];
  const customCount = filledCustomFieldCount(custom);
  const stageDrivesClosedState = isClosedStage(config, core.stage_id);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: Record<string, string> = {};

    if (!core.title.trim()) {
      nextErrors.title = 'Title is required.';
    }

    if (core.email && !/\S+@\S+\.\S+/.test(core.email)) {
      nextErrors.email = 'Enter a valid email address.';
    }

    if (core.pipeline_id && !core.stage_id) {
      nextErrors.stage_id = 'Choose a stage for the selected pipeline.';
    }

    for (const field of config.customFields) {
      const value = custom[field.field_key];
      const isEmpty =
        value === null ||
        value === undefined ||
        (typeof value === 'string' && value.trim().length === 0) ||
        (Array.isArray(value) && value.length === 0);

      if (field.is_required && isEmpty) {
        nextErrors[field.field_key] = `${field.label} is required.`;
      }
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      await onSubmit({
        workspace_id: workspaceId,
        core,
        custom,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-6">
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="rounded-[24px] border border-indigo-200 bg-[#EEF2FF] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-accent-blue">Shared record form</div>
              <h3 className="mt-2 font-display text-3xl text-slate-900">
                {initialRecord ? 'Update record' : 'Create record'}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-700">
                Common lead fields stay fixed while the industry-specific fields below are pulled from workspace metadata.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-700">
              <span className="rounded-full border border-indigo-200 bg-white px-3 py-1">
                {config.customFields.length} dynamic fields
              </span>
              <span className="rounded-full border border-indigo-200 bg-white px-3 py-1">
                {customCount} filled
              </span>
              <span className="rounded-full border border-indigo-200 bg-white px-3 py-1">
                {config.sources.length} sources
              </span>
            </div>
          </div>
        </div>

        {Object.keys(errors).length > 0 ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Fix the highlighted fields before saving this record.
          </div>
        ) : null}

        <section className="space-y-4 rounded-[24px] border border-slate-300 bg-white p-5">
          <div>
            <h4 className="font-display text-2xl text-slate-900">Lead snapshot</h4>
            <p className="mt-1 text-sm text-slate-600">Basic title and contact information used across every CRM mode.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Title"
              value={core.title}
              onChange={(event) => setCore((current) => ({ ...current, title: event.target.value }))}
              error={errors.title}
              placeholder="Lead title or summary"
            />
            <Input
              label="Full name"
              value={core.full_name ?? ''}
              onChange={(event) => setCore((current) => ({ ...current, full_name: event.target.value || null }))}
              placeholder="Primary contact"
            />
            <Input
              label="Company"
              value={core.company_name ?? ''}
              onChange={(event) => setCore((current) => ({ ...current, company_name: event.target.value || null }))}
              placeholder="Company or brand"
            />
            <Input
              label="Email"
              type="email"
              value={core.email ?? ''}
              onChange={(event) => setCore((current) => ({ ...current, email: event.target.value || null }))}
              error={errors.email}
              placeholder="lead@example.com"
            />
            <Input
              label="Phone"
              value={core.phone ?? ''}
              onChange={(event) => setCore((current) => ({ ...current, phone: event.target.value || null }))}
              placeholder="+1 555 010 1234"
            />
            <label className="flex w-full flex-col gap-2 text-sm text-slate-700">
              <span className="font-medium">Source</span>
              <select
                value={core.source_id ?? ''}
                onChange={(event) => setCore((current) => ({ ...current, source_id: event.target.value || null }))}
                className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900"
              >
                <option value="">Select source</option>
                {config.sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-[24px] border border-slate-300 bg-white p-5">
          <div>
            <h4 className="font-display text-2xl text-slate-900">Workflow and ownership</h4>
            <p className="mt-1 text-sm text-slate-600">Control how the record moves through the shared pipeline.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="flex w-full flex-col gap-2 text-sm text-slate-700">
              <span className="font-medium">Pipeline</span>
              <select
                value={core.pipeline_id ?? ''}
                onChange={(event) => {
                  const nextPipelineId = event.target.value || null;
                  setCore((current) => ({
                    ...current,
                    pipeline_id: nextPipelineId,
                    stage_id: firstStageForPipeline(config, nextPipelineId),
                  }));
                }}
                className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900"
              >
                <option value="">Select pipeline</option>
                {config.pipelines.map((pipeline) => (
                  <option key={pipeline.id} value={pipeline.id}>
                    {pipeline.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-full flex-col gap-2 text-sm text-slate-700">
              <span className="font-medium">Stage</span>
              <select
                value={core.stage_id ?? ''}
                onChange={(event) => setCore((current) => ({ ...current, stage_id: event.target.value || null }))}
                className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900"
              >
                <option value="">Select stage</option>
                {stageOptions.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
              {errors.stage_id ? <span className="text-xs text-rose-300">{errors.stage_id}</span> : null}
            </label>
            <label className="flex w-full flex-col gap-2 text-sm text-slate-700">
              <span className="font-medium">Assignee</span>
              <select
                value={core.assignee_user_id ?? ''}
                onChange={(event) => setCore((current) => ({ ...current, assignee_user_id: event.target.value || null }))}
                className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900"
              >
                <option value="">Unassigned</option>
                {config.assignees.map((assignee) => (
                  <option key={assignee.userId} value={assignee.userId}>
                    {assignee.fullName ?? assignee.userId}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-full flex-col gap-2 text-sm text-slate-700">
              <span className="font-medium">Status</span>
              <select
                value={core.status ?? ''}
                onChange={(event) => setCore((current) => ({ ...current, status: event.target.value || null }))}
                disabled={stageDrivesClosedState}
                className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900"
              >
                <option value="open">Open</option>
                <option value="qualified">Qualified</option>
                <option value="nurturing">Nurturing</option>
                {stageDrivesClosedState ? <option value="closed">Closed</option> : null}
              </select>
              {stageDrivesClosedState ? (
                <span className="text-xs text-slate-500">Closed stages keep the record status closed automatically.</span>
              ) : null}
            </label>
            <label className="flex w-full flex-col gap-2 text-sm text-slate-700">
              <span className="font-medium">Priority</span>
              <select
                value={core.priority ?? ''}
                onChange={(event) => setCore((current) => ({ ...current, priority: event.target.value || null }))}
                className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
        </section>

        {config.customFields.length > 0 ? (
          <section className="space-y-4 rounded-[24px] border border-slate-300 bg-white p-5">
            <div>
              <h3 className="font-display text-2xl text-slate-900">Industry fields</h3>
              <p className="mt-1 text-sm text-slate-600">
                These fields come directly from the workspace template for the selected CRM mode. No industry-specific form is hardcoded here.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {config.customFields.map((field) => (
                <FieldRenderer
                  key={field.id}
                  definition={field}
                  value={custom[field.field_key]}
                  error={errors[field.field_key]}
                  onChange={(value) =>
                    setCustom((current) => ({
                      ...current,
                      [field.field_key]: value,
                    }))
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" loading={submitting}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
}
