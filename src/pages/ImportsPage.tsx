import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '../components/dashboard/PageHeader';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { SectionSkeleton } from '../components/ui/SectionSkeleton';
import { useAuth } from '../hooks/useAuth';
import { usePageGuide } from '../hooks/useAppGuide';
import { useCrmWorkspace } from '../hooks/useCrmWorkspace';
import { parseCsv } from '../lib/csv';
import { createImportJob } from '../lib/crm-service';
import type { CrmWorkspaceConfig, ImportJobResult, ImportMappingInput } from '../lib/crm-types';

const coreTargets = [
  { key: 'title', label: 'Title' },
  { key: 'full_name', label: 'Full Name' },
  { key: 'company_name', label: 'Company Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
];

function guessMapping(column: string, config: CrmWorkspaceConfig): ImportMappingInput | null {
  const normalized = column.toLowerCase().trim().replace(/\s+/g, '_');
  const coreTarget = coreTargets.find((target) => target.key === normalized);

  if (coreTarget) {
    return { source_column: column, target_type: 'core', target_key: coreTarget.key };
  }

  const customTarget = config.customFields.find((field) => field.field_key === normalized);

  if (customTarget) {
    return { source_column: column, target_type: 'custom', target_key: customTarget.field_key };
  }

  return null;
}

export function ImportsPage() {
  const navigate = useNavigate();
  const { session, workspace, signOut } = useAuth();
  const { config, configError, configLoading, configRefreshing } = useCrmWorkspace();
  const [fileName, setFileName] = useState('');
  const [allRows, setAllRows] = useState<Array<Record<string, string>>>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Array<Record<string, string>>>([]);
  const [mappings, setMappings] = useState<ImportMappingInput[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<ImportJobResult | null>(null);

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  const mappingOptions = useMemo(() => {
    if (!config) return [];

    return [
      { value: 'ignore', label: 'Ignore column' },
      ...coreTargets.map((target) => ({
        value: `core:${target.key}`,
        label: `Core: ${target.label}`,
      })),
      ...config.customFields.map((field) => ({
        value: `custom:${field.field_key}`,
        label: `Custom: ${field.label}`,
      })),
    ];
  }, [config]);

  usePageGuide({
    key: 'imports-jobs',
    title: 'Prepare a record import',
    summary:
      'Use this page to upload a CSV, map its columns to the shared workspace schema, and review preview rows before importing the records into the workspace.',
    nextStep:
      columns.length === 0
        ? 'Choose a CSV file first so CoreFlow can inspect the columns and prepare the import.'
        : 'Review the suggested column mappings, then run the import when the preview looks correct.',
    highlights: ['CSV upload', 'Field mapping', 'Preview before import'],
    autoStart: 'once',
    steps: [
      {
        id: 'imports-file',
        title: 'Start with the CSV file',
        body: 'Upload the source file here so CoreFlow can detect columns and suggest field mappings for this workspace.',
        targetId: 'imports-file-input',
      },
      {
        id: 'imports-create-job',
        title: 'Run the import',
        body: 'This action creates the import job, stores all parsed rows, and imports records using the selected field mappings.',
        targetId: 'imports-create-job',
        placement: 'left',
      },
      {
        id: 'imports-mapping',
        title: 'Verify the column mapping',
        body: 'Use the mapping section to connect each incoming column to the correct core or custom field in the shared CRM schema.',
        targetId: 'imports-mapping-card',
      },
      {
        id: 'imports-preview',
        title: 'Check the preview rows',
        body: 'The preview is the last quick validation step before users trust the import setup and move forward.',
        targetId: 'imports-preview-card',
        placement: 'top',
      },
    ],
  });

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !config) {
      return;
    }

    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);
    setAllRows(parsed.rows);
    setColumns(parsed.columns);
    setPreviewRows(parsed.rows.slice(0, 25));
    setImportResult(null);
    setMappings(
      parsed.columns
        .map((column) => guessMapping(column, config))
        .filter((mapping): mapping is ImportMappingInput => Boolean(mapping)),
    );
  }

  function currentMappingValue(column: string) {
    const mapping = mappings.find((item) => item.source_column === column);
    return mapping ? `${mapping.target_type}:${mapping.target_key}` : 'ignore';
  }

  function updateMapping(column: string, nextValue: string) {
    setMappings((current) => {
      const remaining = current.filter((item) => item.source_column !== column);

      if (nextValue === 'ignore') {
        return remaining;
      }

      const [targetType, targetKey] = nextValue.split(':');
      return [...remaining, { source_column: column, target_type: targetType as 'core' | 'custom', target_key: targetKey }];
    });
  }

  async function handleCreateJob() {
    if (!session || !workspace || !fileName) {
      return;
    }

    setSubmitting(true);

    try {
      const result = await createImportJob(session, {
        workspace_id: workspace.id,
        file_name: fileName,
        rows: allRows,
        mappings,
      });
      setImportResult(result);

      if (result.failedCount === 0) {
        toast.success(result.message);
      } else if (result.importedCount === 0) {
        toast.error(result.message);
      } else {
        toast.success(result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create import job.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!session || !workspace) {
    return <FullPageLoader label="Loading import tools..." />;
  }

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={handleSignOut}>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Imports"
          title="Import jobs"
          description="Upload a CSV, map columns to workspace fields, preview the data, and import records into the shared CRM."
        />

        {configRefreshing ? (
          <Card className="p-4 text-sm text-slate-600">Refreshing import metadata in the background...</Card>
        ) : null}

        {config ? (
          <Card className="p-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <label className="flex flex-col gap-2 text-sm text-slate-700">
                <span className="font-medium">CSV file</span>
                <input
                  type="file"
                  data-guide-id="imports-file-input"
                  accept=".csv,text/csv"
                  onChange={(event) => void handleFileChange(event)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-indigo-600"
                />
              </label>
              <Button
                type="button"
                size="sm"
                data-guide-id="imports-create-job"
                onClick={() => void handleCreateJob()}
                loading={submitting}
                disabled={!fileName || allRows.length === 0}
              >
                Import records
              </Button>
            </div>
          </Card>
        ) : configError ? (
          <Card className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{configError}</Card>
        ) : configLoading ? (
          <SectionSkeleton title="Import tools" rows={4} />
        ) : null}

        {importResult ? (
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-600">Latest import</div>
                <h3 className="mt-2 font-display text-2xl text-slate-900">{importResult.message}</h3>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Job status: <span className="font-medium text-slate-900">{importResult.job.status}</span>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Total rows</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">{importResult.totalRows}</div>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.22em] text-emerald-700">Imported</div>
                <div className="mt-1 text-2xl font-semibold text-emerald-900">{importResult.importedCount}</div>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.22em] text-rose-700">Failed</div>
                <div className="mt-1 text-2xl font-semibold text-rose-900">{importResult.failedCount}</div>
              </div>
            </div>
            {importResult.failures.length > 0 ? (
              <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                <div className="text-sm font-semibold text-rose-900">Row issues</div>
                <div className="mt-3 space-y-2 text-sm text-rose-800">
                  {importResult.failures.map((failure) => (
                    <p key={`${failure.rowIndex}-${failure.error}`}>
                      Row {failure.rowIndex + 1}: {failure.error}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        ) : null}

        {config && columns.length > 0 ? (
          <Card className="p-6" data-guide-id="imports-mapping-card">
            <h3 className="font-display text-2xl text-slate-900">Column mapping</h3>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {columns.map((column) => (
                <label key={column} className="flex flex-col gap-2 text-sm text-slate-700">
                  <span className="font-medium">{column}</span>
                  <select
                    value={currentMappingValue(column)}
                    onChange={(event) => updateMapping(column, event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    {mappingOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </Card>
        ) : null}

        {config && previewRows.length > 0 ? (
          <Card className="overflow-x-auto p-6" data-guide-id="imports-preview-card">
            <h3 className="font-display text-2xl text-slate-900">Preview rows</h3>
            <table className="mt-6 min-w-full border-separate border-spacing-y-2 text-sm text-slate-700">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column} className="px-3 py-2 text-left text-xs uppercase tracking-[0.24em] text-slate-500">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 8).map((row, index) => (
                  <tr key={index}>
                    {columns.map((column) => (
                      <td key={column} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        {row[column]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}
      </div>
    </WorkspaceLayout>
  );
}
