import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  FileSearch2,
  Link2,
  LoaderCircle,
  Rocket,
  Upload,
} from 'lucide-react';
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
import {
  analyzeImportMappings,
  approveImportMappings,
  createImportJob,
  getImportIntelligenceConfig,
  saveImportIntelligenceConfig,
  saveImportProfile,
} from '../lib/crm-service';
import type {
  CrmWorkspaceConfig,
  ImportAnalyzeResult,
  ImportIntelligenceAlias,
  ImportIntelligenceBinding,
  ImportIntelligenceConfigResult,
  ImportIntelligenceOptionAlias,
  ImportIntelligenceTransformRule,
  ImportJobResult,
  ImportMappingInput,
  ImportMappingSuggestion,
} from '../lib/crm-types';
import { isWorkspaceOwner } from '../lib/utils';

const coreTargets = [
  { key: 'title', label: 'Title' },
  { key: 'full_name', label: 'Full Name' },
  { key: 'company_name', label: 'Company Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
];

const coreTargetHelpText: Record<string, string> = {
  title: 'Primary identifier for records',
  full_name: 'Primary contact full name',
  company_name: 'Organization or company name',
  email: 'Primary contact email address',
  phone: 'Primary phone number',
  status: 'Current lifecycle status',
  priority: 'Priority or urgency level',
};

const workflowSteps = [
  { id: 'upload', label: 'Upload CSV', icon: Upload },
  { id: 'preview', label: 'Preview', icon: FileSearch2 },
  { id: 'mapping', label: 'Map Fields', icon: Link2 },
  { id: 'review', label: 'Review', icon: AlertTriangle },
  { id: 'create', label: 'Create Job', icon: Rocket },
  { id: 'status', label: 'Status', icon: CheckCircle2 },
] as const;

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

function suggestionToMapping(suggestion: ImportMappingSuggestion): ImportMappingInput | null {
  if (!suggestion.target_type || !suggestion.target_key) {
    return null;
  }

  return {
    source_column: suggestion.source_column,
    semantic_id: suggestion.semantic_id,
    target_type: suggestion.target_type,
    target_key: suggestion.target_key,
    confidence: suggestion.confidence,
    status: suggestion.status,
    mapping_source: suggestion.mapping_source,
    notes: suggestion.notes,
  };
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
  const [analysis, setAnalysis] = useState<ImportAnalyzeResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [saveProfileOnImport, setSaveProfileOnImport] = useState(true);
  const [autoCreateNewFields, setAutoCreateNewFields] = useState(false);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligenceSaving, setIntelligenceSaving] = useState(false);
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null);
  const [intelligenceConfig, setIntelligenceConfig] = useState<ImportIntelligenceConfigResult | null>(null);
  const [showIntelligenceSettings, setShowIntelligenceSettings] = useState(false);
  const [aliasDraft, setAliasDraft] = useState<ImportIntelligenceAlias>({ semantic_id: '', alias_text: '', weight: 1, scope: 'crm' });
  const [bindingDraft, setBindingDraft] = useState<ImportIntelligenceBinding>({
    semantic_id: '',
    target_type: 'core',
    target_key: 'title',
    is_required: false,
    scope: 'crm',
  });
  const [ruleDraft, setRuleDraft] = useState<ImportIntelligenceTransformRule>({
    target_type: 'core',
    target_key: 'phone',
    rule_type: 'phone',
    rule_config: {},
    scope: 'crm',
  });
  const [ruleConfigText, setRuleConfigText] = useState('{}');
  const [optionAliasDraft, setOptionAliasDraft] = useState<ImportIntelligenceOptionAlias>({
    field_key: '',
    alias_value: '',
    canonical_value: '',
    scope: 'crm',
  });
  const [mappingValidationRequested, setMappingValidationRequested] = useState(false);
  const [mappingTouchedTargets, setMappingTouchedTargets] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<ImportJobResult | null>(null);
  const isOwner = isWorkspaceOwner(workspace);

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  const targetFields = useMemo(() => {
    if (!config) return [];

    const core = coreTargets.map((target) => ({
      target_type: 'core' as const,
      target_key: target.key,
      label: `Core: ${target.label}`,
      required: target.key === 'title',
    }));
    const custom = config.customFields.map((field) => ({
      target_type: 'custom' as const,
      target_key: field.field_key,
      label: `Custom: ${field.label}`,
      required: field.is_required,
    }));

    return [...core, ...custom];
  }, [config]);

  const mappedTargetKeySet = useMemo(
    () => new Set(mappings.map((mapping) => `${mapping.target_type}:${mapping.target_key}`)),
    [mappings],
  );

  const mappedTargetCount = useMemo(
    () => targetFields.filter((target) => mappedTargetKeySet.has(`${target.target_type}:${target.target_key}`)).length,
    [mappedTargetKeySet, targetFields],
  );

  const unmappedTargetCount = Math.max(targetFields.length - mappedTargetCount, 0);

  const mappedSourceSet = useMemo(
    () => new Set(mappings.map((mapping) => mapping.source_column)),
    [mappings],
  );

  const unmappedSourceColumns = useMemo(
    () => columns.filter((column) => !mappedSourceSet.has(column)),
    [columns, mappedSourceSet],
  );

  const customFieldByKey = useMemo(
    () => new Map((config?.customFields ?? []).map((field) => [field.field_key, field])),
    [config],
  );

  const validationIssuesCount = (analysis?.required_missing_targets.length ?? 0) + (analysis?.needs_confirmation_count ?? 0);

  const mappingCompletion = targetFields.length > 0
    ? Math.round((mappedTargetCount / targetFields.length) * 100)
    : 0;

  const requiredFieldsRemaining = useMemo(
    () => targetFields.filter((target) => target.required && !mappedTargetKeySet.has(`${target.target_type}:${target.target_key}`)).length,
    [mappedTargetKeySet, targetFields],
  );

  const suggestionBySource = useMemo(
    () => new Map((analysis?.suggestions ?? []).map((item) => [item.source_column, item])),
    [analysis],
  );

  const activeStepIndex = useMemo(() => {
    if (importResult) return 5;
    if (submitting) return 4;
    if (!fileName) return 0;
    if (analysisLoading) return 1;
    if (columns.length > 0 && mappedTargetCount === 0) return 2;
    if (validationIssuesCount > 0) return 2;
    if (columns.length > 0) return 3;
    return 0;
  }, [analysisLoading, columns.length, fileName, importResult, mappedTargetCount, submitting, validationIssuesCount]);

  useEffect(() => {
    if (!session || !workspace || !isOwner) {
      return;
    }
    const ownerSession = session;
    const ownerWorkspace = workspace;

    let cancelled = false;

    async function loadIntelligenceConfig() {
      setIntelligenceLoading(true);
      setIntelligenceError(null);

      try {
        const next = await getImportIntelligenceConfig(ownerSession, { workspace_id: ownerWorkspace.id });

        if (!cancelled) {
          setIntelligenceConfig(next);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unable to load import intelligence settings.';
          setIntelligenceError(message);
        }
      } finally {
        if (!cancelled) {
          setIntelligenceLoading(false);
        }
      }
    }

    void loadIntelligenceConfig();

    return () => {
      cancelled = true;
    };
  }, [session, workspace, isOwner]);

  function handleAddAlias() {
    if (!intelligenceConfig || !aliasDraft.semantic_id || !aliasDraft.alias_text.trim()) {
      return;
    }

    const nextAlias: ImportIntelligenceAlias = {
      semantic_id: aliasDraft.semantic_id,
      alias_text: aliasDraft.alias_text.trim(),
      weight: Number.isFinite(aliasDraft.weight) ? aliasDraft.weight : 1,
      scope: aliasDraft.scope,
    };

    setIntelligenceConfig((current) => current
      ? { ...current, aliases: [...current.aliases, nextAlias] }
      : current);
    setAliasDraft((current) => ({ ...current, alias_text: '', weight: 1 }));
  }

  function handleAddBinding() {
    if (!intelligenceConfig || !bindingDraft.semantic_id || !bindingDraft.target_key.trim()) {
      return;
    }

    const nextBinding: ImportIntelligenceBinding = {
      semantic_id: bindingDraft.semantic_id,
      target_type: bindingDraft.target_type,
      target_key: bindingDraft.target_key.trim(),
      is_required: bindingDraft.is_required,
      scope: bindingDraft.scope,
    };

    setIntelligenceConfig((current) => current
      ? { ...current, bindings: [...current.bindings, nextBinding] }
      : current);
    setBindingDraft((current) => ({ ...current, is_required: false }));
  }

  function handleAddRule() {
    if (!intelligenceConfig || !ruleDraft.target_key.trim()) {
      return;
    }

    let parsedRuleConfig: Record<string, unknown> = {};

    try {
      const parsed = JSON.parse(ruleConfigText || '{}') as unknown;

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Rule config must be a JSON object.');
      }

      parsedRuleConfig = parsed as Record<string, unknown>;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid rule config JSON.';
      toast.error(message);
      return;
    }

    const nextRule: ImportIntelligenceTransformRule = {
      target_type: ruleDraft.target_type,
      target_key: ruleDraft.target_key.trim(),
      rule_type: ruleDraft.rule_type,
      rule_config: parsedRuleConfig,
      scope: ruleDraft.scope,
    };

    setIntelligenceConfig((current) => current
      ? { ...current, transform_rules: [...current.transform_rules, nextRule] }
      : current);
    setRuleConfigText('{}');
  }

  function handleAddOptionAlias() {
    if (!intelligenceConfig || !optionAliasDraft.field_key.trim() || !optionAliasDraft.alias_value.trim() || !optionAliasDraft.canonical_value.trim()) {
      return;
    }

    const nextOptionAlias: ImportIntelligenceOptionAlias = {
      field_key: optionAliasDraft.field_key.trim(),
      alias_value: optionAliasDraft.alias_value.trim(),
      canonical_value: optionAliasDraft.canonical_value.trim(),
      scope: optionAliasDraft.scope,
    };

    setIntelligenceConfig((current) => current
      ? { ...current, option_aliases: [...current.option_aliases, nextOptionAlias] }
      : current);
    setOptionAliasDraft((current) => ({ ...current, alias_value: '', canonical_value: '' }));
  }

  async function handleSaveIntelligenceConfig() {
    if (!session || !workspace || !intelligenceConfig || !isOwner) {
      return;
    }

    setIntelligenceSaving(true);
    setIntelligenceError(null);

    try {
      await saveImportIntelligenceConfig(session, {
        workspace_id: workspace.id,
        clear_scope: 'all',
        aliases: intelligenceConfig.aliases.map((item) => ({
          semantic_id: item.semantic_id,
          alias_text: item.alias_text,
          weight: item.weight,
          scope: item.scope,
        })),
        bindings: intelligenceConfig.bindings.map((item) => ({
          semantic_id: item.semantic_id,
          target_type: item.target_type,
          target_key: item.target_key,
          is_required: item.is_required,
          scope: item.scope,
        })),
        transform_rules: intelligenceConfig.transform_rules.map((item) => ({
          target_type: item.target_type,
          target_key: item.target_key,
          rule_type: item.rule_type,
          rule_config: item.rule_config,
          scope: item.scope,
        })),
        option_aliases: intelligenceConfig.option_aliases.map((item) => ({
          field_key: item.field_key,
          alias_value: item.alias_value,
          canonical_value: item.canonical_value,
          scope: item.scope,
        })),
      });
      toast.success('Import intelligence settings saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save import intelligence settings.';
      setIntelligenceError(message);
      toast.error(message);
    } finally {
      setIntelligenceSaving(false);
    }
  }

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

    if (!file || !config || !session || !workspace) {
      return;
    }

    setAnalysisLoading(true);
    setAnalysisError(null);
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);
    setAllRows(parsed.rows);
    setColumns(parsed.columns);
    setPreviewRows(parsed.rows.slice(0, 25));
    setImportResult(null);
    setMappingValidationRequested(false);
    setMappingTouchedTargets(new Set());

    try {
      const analysisResult = await analyzeImportMappings(session, {
        workspace_id: workspace.id,
        columns: parsed.columns,
        rows: parsed.rows.slice(0, 50),
      });

      setAnalysis(analysisResult);

      const suggestedMappings = analysisResult.suggestions
        .map((suggestion) => suggestionToMapping(suggestion))
        .filter((mapping): mapping is ImportMappingInput => Boolean(mapping));

      setMappings(suggestedMappings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to analyze import mappings.';
      setAnalysisError(message);
      setAnalysis(null);
      setMappings(
        parsed.columns
          .map((column) => guessMapping(column, config))
          .filter((mapping): mapping is ImportMappingInput => Boolean(mapping)),
      );
    } finally {
      setAnalysisLoading(false);
    }
  }

  function currentSourceForTarget(targetType: 'core' | 'custom', targetKey: string) {
    const mapping = mappings.find((item) => item.target_type === targetType && item.target_key === targetKey);
    return mapping ? mapping.source_column : 'ignore';
  }

  function updateMappingForTarget(targetType: 'core' | 'custom', targetKey: string, sourceColumn: string) {
    const suggestion = analysis?.suggestions.find((item) => item.source_column === sourceColumn) ?? null;

    setMappings((current) => {
      const withoutTarget = current.filter((item) => !(item.target_type === targetType && item.target_key === targetKey));

      if (sourceColumn === 'ignore') {
        return withoutTarget;
      }

      const withoutSource = withoutTarget.filter((item) => item.source_column !== sourceColumn);

      if (!sourceColumn.trim()) {
        return withoutSource;
      }

      return [
        ...withoutSource,
        {
          source_column: sourceColumn,
          semantic_id: suggestion?.semantic_id ?? null,
          target_type: targetType,
          target_key: targetKey,
          confidence: suggestion ? Math.max(suggestion.confidence, 0.7) : 0.9,
          status: 'confirmed',
          mapping_source: 'manual',
          notes: suggestion?.notes ?? 'Confirmed manually during import.',
        },
      ] as ImportMappingInput[];
    });
  }

  function handleMappingSelectChange(targetType: 'core' | 'custom', targetKey: string, sourceColumn: string) {
    const targetId = `${targetType}:${targetKey}`;
    setMappingTouchedTargets((current) => new Set(current).add(targetId));
    updateMappingForTarget(targetType, targetKey, sourceColumn);
  }

  function handleAutoMapFields() {
    if (!config || columns.length === 0) {
      return;
    }

    if (analysis) {
      const suggestedMappings = analysis.suggestions
        .map((suggestion) => suggestionToMapping(suggestion))
        .filter((mapping): mapping is ImportMappingInput => Boolean(mapping));
      setMappings(suggestedMappings);
      toast.success('Auto-mapped fields using import analysis.');
      return;
    }

    const guessedMappings = columns
      .map((column) => guessMapping(column, config))
      .filter((mapping): mapping is ImportMappingInput => Boolean(mapping));
    setMappings(guessedMappings);
    toast.success('Auto-mapped fields using column name matching.');
  }

  function handleResetMapping() {
    setMappings([]);
    setMappingTouchedTargets(new Set());
    setMappingValidationRequested(false);
    toast.success('Mapping selection reset.');
  }

  function handleSaveMappingProfileIntent() {
    setMappingValidationRequested(true);

    if (requiredFieldsRemaining > 0) {
      toast.error(`Required fields remaining: ${requiredFieldsRemaining}.`);
      return;
    }

    setSaveProfileOnImport(true);
    toast.success('Mapping looks good. It will be saved when import job is created.');
  }

  async function handleCreateJob() {
    if (!session || !workspace || !fileName || columns.length === 0) {
      return;
    }

    setMappingValidationRequested(true);
    setSubmitting(true);

    try {
      const approved = await approveImportMappings(session, {
        workspace_id: workspace.id,
        mappings,
        create_fields: autoCreateNewFields && analysis
          ? analysis.suggestions
            .filter((item) => item.status === 'new_semantic')
            .filter((item) => !mappings.some((mapping) => mapping.source_column === item.source_column))
            .map((item, index) => {
              const fieldKey = item.source_column
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '')
                .slice(0, 64);

              return {
                source_column: item.source_column,
                field_key: fieldKey || `import_field_${index + 1}`,
                label: item.source_column,
                field_type: 'text',
                is_required: false,
                options: [],
              };
            })
          : [],
      });

      const finalMappings = approved.mappings;
      let profileId: string | null = analysis?.profile?.id ?? null;

      if (saveProfileOnImport) {
        const profile = await saveImportProfile(session, {
          workspace_id: workspace.id,
          source_fingerprint: analysis?.source_fingerprint,
          columns,
          profile_name: `${fileName} mapping`,
          is_default: true,
          mappings: finalMappings,
        });
        profileId = profile.profile.id;
      }

      const result = await createImportJob(session, {
        workspace_id: workspace.id,
        file_name: fileName,
        source_fingerprint: analysis?.source_fingerprint,
        profile_id: profileId,
        rows: allRows,
        mappings: finalMappings,
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
      <div className="space-y-6">
        <PageHeader
          eyebrow="Imports"
          title="Import jobs"
          description="Upload a CSV, map columns to workspace fields, preview the data, and import records into the shared CRM."
        />

        <Card className="overflow-hidden border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-50 p-6 shadow-lg shadow-slate-200/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-700">Import workflow</div>
              <h2 className="mt-1 font-display text-xl text-slate-900">CSV to CRM records</h2>
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              Mapping completion {mappingCompletion}%
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            {workflowSteps.map((step, index) => {
              const Icon = step.icon;
              const isDone = index < activeStepIndex;
              const isActive = index === activeStepIndex;
              return (
                <div
                  key={step.id}
                  className={`rounded-2xl border px-3 py-3 transition ${
                    isActive
                      ? 'border-indigo-300 bg-indigo-50 shadow-sm shadow-indigo-100'
                      : isDone
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`rounded-lg p-1.5 ${isActive ? 'bg-indigo-100 text-indigo-700' : isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className={`text-xs font-semibold uppercase tracking-[0.14em] ${isActive ? 'text-indigo-700' : isDone ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {step.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {configRefreshing ? (
          <Card className="p-4 text-sm text-slate-600">Refreshing import metadata in the background...</Card>
        ) : null}

        {config ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <Card className="border-slate-200 p-6 shadow-lg shadow-slate-200/70">
              <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr] lg:items-center">
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">Upload source</div>
                    <h3 className="mt-1 font-display text-2xl text-slate-900">Select your CSV file</h3>
                  </div>
                  <label className="flex flex-col gap-2 text-sm text-slate-700">
                    <span className="font-medium">CSV file</span>
                    <input
                      type="file"
                      data-guide-id="imports-file-input"
                      accept=".csv,text/csv"
                      onChange={(event) => void handleFileChange(event)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-indigo-700"
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">File</div>
                    <div className="mt-1 truncate text-sm font-medium text-slate-900">{fileName || 'No file selected yet'}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Rows ready</div>
                    <div className="mt-1 text-sm font-medium text-slate-900">{allRows.length}</div>
                  </div>
                </div>
              </div>
              <div className="mt-5 grid gap-2 text-sm text-slate-600">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={saveProfileOnImport}
                    onChange={(event) => setSaveProfileOnImport(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Save this mapping as default profile for future imports from similar files.
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoCreateNewFields}
                    onChange={(event) => setAutoCreateNewFields(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Auto-create text custom fields for unmapped new-semantic columns.
                </label>
              </div>
            </Card>
          </motion.div>
        ) : configError ? (
          <Card className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{configError}</Card>
        ) : configLoading ? (
          <SectionSkeleton title="Import tools" rows={4} />
        ) : null}

        <AnimatePresence initial={false}>
          {analysisLoading ? (
            <motion.div
              key="analysis-loading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <Card className="border-slate-200 p-5">
                <div className="flex items-center gap-3 text-sm text-slate-700">
                  <LoaderCircle className="h-4 w-4 animate-spin text-indigo-600" />
                  Analyzing columns and matching semantics...
                </div>
              </Card>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {analysisError ? (
          <Card className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {analysisError}
          </Card>
        ) : null}

        {config && columns.length === 0 ? (
          <Card className="border-dashed border-slate-300 bg-slate-50/70 p-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
              <CircleDashed className="h-5 w-5" />
            </div>
            <h3 className="mt-3 font-display text-xl text-slate-900">No file uploaded yet</h3>
            <p className="mt-1 text-sm text-slate-600">Upload a CSV to start previewing and mapping fields.</p>
          </Card>
        ) : null}

        {config && columns.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">Import summary</div>
                  <h3 className="mt-1 font-display text-2xl text-slate-900">At-a-glance status</h3>
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                  Source columns: {columns.length}
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Total rows</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900">{allRows.length}</div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-emerald-700">Mapped fields</div>
                  <div className="mt-1 text-2xl font-semibold text-emerald-900">{mappedTargetCount}</div>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-amber-700">Unmapped fields</div>
                  <div className="mt-1 text-2xl font-semibold text-amber-900">{unmappedTargetCount}</div>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-rose-700">Validation issues</div>
                  <div className="mt-1 text-2xl font-semibold text-rose-900">{validationIssuesCount}</div>
                </div>
              </div>
              {unmappedSourceColumns.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
                  Unused source columns: {unmappedSourceColumns.join(', ')}
                </div>
              ) : null}
            </Card>
          </motion.div>
        ) : null}

        {analysis ? (
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">Import analysis</div>
                <div className="mt-1 text-sm text-slate-700">
                  {analysis.profile ? `Matched profile: ${analysis.profile.profile_name}` : 'No saved profile matched.'}
                </div>
              </div>
              <div className="text-xs text-slate-500">Fingerprint: {analysis.source_fingerprint}</div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Needs confirmation: <span className="font-semibold">{analysis.needs_confirmation_count}</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                New semantics: <span className="font-semibold">{analysis.new_semantic_count}</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Required missing: <span className="font-semibold">{analysis.required_missing_targets.length}</span>
              </div>
            </div>
            {analysis.required_missing_targets.length > 0 ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                Missing required targets: {analysis.required_missing_targets.join(', ')}
              </div>
            ) : null}
          </Card>
        ) : null}

        {config && columns.length > 0 ? (
          <div className="p-6 bg-transparent" data-guide-id="imports-mapping-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div>
                  <h3 className="font-display text-2xl text-slate-900">Map Fields</h3>
                  <p className="mt-1 text-sm text-slate-600">Target fields to source columns from your CSV data.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={handleAutoMapFields}>
                    Auto-map fields
                  </Button>
                  <button
                    type="button"
                    onClick={handleResetMapping}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    Reset mapping
                  </button>
                </div>
              </div>

              <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-50 p-3 shadow-sm lg:sticky lg:top-24">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                  <span>Progress</span>
                  <span className="text-indigo-700">{mappedTargetCount} / {targetFields.length} mapped</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{mappingCompletion}% complete</span>
                  <span className="text-slate-500">{requiredFieldsRemaining} required remaining</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                  <motion.div
                    className="h-full rounded-full bg-indigo-600"
                    animate={{ width: `${Math.max(0, Math.min(100, mappingCompletion))}%` }}
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3 h-9 w-full"
                  onClick={handleSaveMappingProfileIntent}
                >
                  Save Mapping
                </Button>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
              <div className="max-h-[560px] min-w-[920px] overflow-auto">
                <table className="w-full border-collapse text-sm bg-slate-100">
                  <thead className="sticky top-0 z-10 bg-white backdrop-blur">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Target System Field</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Source CSV Column</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Data Sample</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targetFields.map((target) => {
                      const targetId = `${target.target_type}:${target.target_key}`;
                      const selectedSource = currentSourceForTarget(target.target_type, target.target_key);
                      const selectedSuggestion = selectedSource !== 'ignore' ? suggestionBySource.get(selectedSource) : undefined;
                      const confidence = selectedSuggestion ? Math.round(selectedSuggestion.confidence * 100) : null;
                      const isMapped = selectedSource !== 'ignore';
                      const isRequiredUnmapped = target.required && !isMapped;
                      const showRequiredError = isRequiredUnmapped && (mappingValidationRequested || mappingTouchedTargets.has(targetId));
                      const targetHelp = target.target_type === 'core'
                        ? coreTargetHelpText[target.target_key] ?? 'Core CRM field'
                        : customFieldByKey.get(target.target_key)?.help_text?.trim() || 'Custom workspace field';
                      const sampleValues = selectedSuggestion?.sample_values?.slice(0, 3) ?? [];

                      return (
                        <tr
                          key={targetId}
                          className={`border-b  transition last:border-b-0 hover:bg-slate-50/70 ${
                            showRequiredError ? 'bg-gray-500' : ''
                          }`}
                        >
                          <td className={`px-4 py-4 align-top ${target.required ? 'border-l-2 border-l-indigo-200' : ''} ${showRequiredError ? 'border-l-rose-300' : ''}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[15px] font-semibold text-slate-900">{target.label}</span>
                                  {target.required ? (
                                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-700">
                                      Required
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-xs text-slate-500">{targetHelp}</p>
                              </div>
                              {isMapped ? (
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                              ) : target.required ? (
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <select
                              value={selectedSource}
                              onChange={(event) => handleMappingSelectChange(target.target_type, target.target_key, event.target.value)}
                              className={`h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-offset-0 ${
                                showRequiredError
                                  ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
                                  : 'border-slate-300 focus:border-indigo-400 focus:ring-indigo-100 focus:shadow-sm'
                              }`}
                            >
                              <option value="ignore">Select column...</option>
                              {columns.map((column) => {
                                const optionSuggestion = suggestionBySource.get(column);
                                const optionConfidence = optionSuggestion ? Math.round(optionSuggestion.confidence * 100) : null;
                                return (
                                  <option key={column} value={column}>
                                    {optionConfidence !== null ? `${column} · ${optionConfidence}% match` : column}
                                  </option>
                                );
                              })}
                            </select>
                            <AnimatePresence initial={false}>
                              {showRequiredError ? (
                                <motion.p
                                  initial={{ opacity: 0, y: -3 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -3 }}
                                  transition={{ duration: 0.16 }}
                                  className="mt-1.5 text-[11px] font-medium text-rose-700"
                                >
                                  Required field — please map a column
                                </motion.p>
                              ) : null}
                            </AnimatePresence>
                          </td>
                          <td className="px-4 py-4 align-top">
                            {isMapped ? (
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-slate-700">
                                  {selectedSource}
                                  {confidence !== null ? <span className="ml-1 text-slate-500">({confidence}% match)</span> : null}
                                </div>
                                {sampleValues.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {sampleValues.map((value, index) => (
                                      <span
                                        key={`${targetId}-${index}-${value}`}
                                        className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                                      >
                                        {value}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-400">No sample available for this column</p>
                                )}
                              </div>
                            ) : (
                              <p className="pt-1 text-xs text-slate-400">Select a column to preview sample data</p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {config && previewRows.length > 0 ? (
          <Card className="p-6" data-guide-id="imports-preview-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">Review</div>
                <h3 className="mt-1 font-display text-2xl text-slate-900">Preview before creating job</h3>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                Showing {Math.min(previewRows.length, 8)} preview rows
              </div>
            </div>
            {(validationIssuesCount > 0 || unmappedTargetCount > 0) ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
                Review warning: {validationIssuesCount} validation issue(s), {unmappedTargetCount} unmapped target field(s).
              </div>
            ) : null}
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm text-slate-700">
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
            </div>
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Ready to create import job?</div>
                  <div className="text-sm text-slate-600">Confirm the mapping and preview, then start the import.</div>
                </div>
                <Button
                  type="button"
                  size="md"
                  data-guide-id="imports-create-job"
                  onClick={() => void handleCreateJob()}
                  loading={submitting}
                  disabled={!fileName || allRows.length === 0 || analysisLoading}
                >
                  Create import job
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {isOwner ? (
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">Advanced mapping</div>
                <div className="mt-1 text-sm text-slate-700">Open Import Intelligence Settings only when you need to tune aliases, bindings, and rules.</div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setShowIntelligenceSettings((current) => !current)}
              >
                {showIntelligenceSettings ? 'Hide settings' : 'Open settings'}
              </Button>
            </div>
          </Card>
        ) : null}

        {isOwner && showIntelligenceSettings ? (
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">Import intelligence settings</div>
                <div className="mt-1 text-sm text-slate-700">
                  Manage workspace aliases, semantic bindings, transform rules, and option aliases.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => setShowIntelligenceSettings(false)}>
                  Close
                </Button>
                <Button type="button" size="sm" onClick={() => void handleSaveIntelligenceConfig()} loading={intelligenceSaving} disabled={intelligenceLoading || !intelligenceConfig}>
                  Save settings
                </Button>
              </div>
            </div>

            {intelligenceLoading ? (
              <div className="mt-4 text-sm text-slate-600">Loading intelligence settings...</div>
            ) : null}

            {intelligenceError ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{intelligenceError}</div>
            ) : null}

            {intelligenceConfig ? (
              <div className="mt-6 space-y-6">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-900">Field aliases</div>
                  <div className="mt-3 grid gap-2 md:grid-cols-5">
                    <select
                      value={aliasDraft.semantic_id}
                      onChange={(event) => setAliasDraft((current) => ({ ...current, semantic_id: event.target.value }))}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="">Select semantic</option>
                      {intelligenceConfig.semantics.map((semantic) => (
                        <option key={semantic.id} value={semantic.id}>{semantic.label}</option>
                      ))}
                    </select>
                    <input
                      value={aliasDraft.alias_text}
                      onChange={(event) => setAliasDraft((current) => ({ ...current, alias_text: event.target.value }))}
                      placeholder="Alias text"
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    />
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={aliasDraft.weight}
                      onChange={(event) => setAliasDraft((current) => ({ ...current, weight: Number(event.target.value) }))}
                      placeholder="Weight"
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    />
                    <select
                      value={aliasDraft.scope}
                      onChange={(event) => setAliasDraft((current) => ({ ...current, scope: event.target.value as 'crm' | 'workspace' }))}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="crm">CRM scope</option>
                      <option value="workspace">Workspace scope</option>
                    </select>
                    <Button type="button" size="sm" onClick={handleAddAlias}>Add alias</Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {intelligenceConfig.aliases.map((item, index) => (
                      <div key={`${item.semantic_id}-${item.alias_text}-${index}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <span>{item.alias_text} to {intelligenceConfig.semantics.find((semantic) => semantic.id === item.semantic_id)?.label ?? item.semantic_id} ({item.scope})</span>
                        <button
                          type="button"
                          onClick={() => setIntelligenceConfig((current) => current ? { ...current, aliases: current.aliases.filter((_, i) => i !== index) } : current)}
                          className="text-rose-600"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-900">Semantic bindings</div>
                  <div className="mt-3 grid gap-2 md:grid-cols-6">
                    <select
                      value={bindingDraft.semantic_id}
                      onChange={(event) => setBindingDraft((current) => ({ ...current, semantic_id: event.target.value }))}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="">Select semantic</option>
                      {intelligenceConfig.semantics.map((semantic) => (
                        <option key={semantic.id} value={semantic.id}>{semantic.label}</option>
                      ))}
                    </select>
                    <select
                      value={bindingDraft.target_type}
                      onChange={(event) => setBindingDraft((current) => ({ ...current, target_type: event.target.value as 'core' | 'custom' }))}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="core">Core</option>
                      <option value="custom">Custom</option>
                    </select>
                    <input
                      value={bindingDraft.target_key}
                      onChange={(event) => setBindingDraft((current) => ({ ...current, target_key: event.target.value }))}
                      placeholder="target key"
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    />
                    <select
                      value={bindingDraft.scope}
                      onChange={(event) => setBindingDraft((current) => ({ ...current, scope: event.target.value as 'crm' | 'workspace' }))}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="crm">CRM scope</option>
                      <option value="workspace">Workspace scope</option>
                    </select>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={bindingDraft.is_required}
                        onChange={(event) => setBindingDraft((current) => ({ ...current, is_required: event.target.checked }))}
                      />
                      Required
                    </label>
                    <Button type="button" size="sm" onClick={handleAddBinding}>Add binding</Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {intelligenceConfig.bindings.map((item, index) => (
                      <div key={`${item.semantic_id}-${item.target_type}-${item.target_key}-${index}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <span>{intelligenceConfig.semantics.find((semantic) => semantic.id === item.semantic_id)?.label ?? item.semantic_id} to {item.target_type}:{item.target_key} ({item.scope}){item.is_required ? ' [required]' : ''}</span>
                        <button
                          type="button"
                          onClick={() => setIntelligenceConfig((current) => current ? { ...current, bindings: current.bindings.filter((_, i) => i !== index) } : current)}
                          className="text-rose-600"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-900">Transform rules</div>
                  <div className="mt-3 grid gap-2 md:grid-cols-5">
                    <select
                      value={ruleDraft.target_type}
                      onChange={(event) => setRuleDraft((current) => ({ ...current, target_type: event.target.value as 'core' | 'custom' }))}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="core">Core</option>
                      <option value="custom">Custom</option>
                    </select>
                    <input
                      value={ruleDraft.target_key}
                      onChange={(event) => setRuleDraft((current) => ({ ...current, target_key: event.target.value }))}
                      placeholder="target key"
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    />
                    <select
                      value={ruleDraft.rule_type}
                      onChange={(event) => setRuleDraft((current) => ({ ...current, rule_type: event.target.value as ImportIntelligenceTransformRule['rule_type'] }))}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="phone">phone</option>
                      <option value="boolean">boolean</option>
                      <option value="number">number</option>
                      <option value="date">date</option>
                      <option value="enum">enum</option>
                      <option value="currency">currency</option>
                    </select>
                    <select
                      value={ruleDraft.scope}
                      onChange={(event) => setRuleDraft((current) => ({ ...current, scope: event.target.value as 'crm' | 'workspace' }))}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="crm">CRM scope</option>
                      <option value="workspace">Workspace scope</option>
                    </select>
                    <Button type="button" size="sm" onClick={handleAddRule}>Add rule</Button>
                  </div>
                  <textarea
                    rows={2}
                    value={ruleConfigText}
                    onChange={(event) => setRuleConfigText(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    placeholder='{"input_format":"mdy","true_values":["yes","y"],"false_values":["no","n"]}'
                  />
                  <div className="mt-3 space-y-2">
                    {intelligenceConfig.transform_rules.map((item, index) => (
                      <div key={`${item.target_type}-${item.target_key}-${item.rule_type}-${index}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <span>{item.target_type}:{item.target_key} to {item.rule_type} ({item.scope})</span>
                        <button
                          type="button"
                          onClick={() => setIntelligenceConfig((current) => current ? { ...current, transform_rules: current.transform_rules.filter((_, i) => i !== index) } : current)}
                          className="text-rose-600"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-900">Option aliases</div>
                  <div className="mt-3 grid gap-2 md:grid-cols-5">
                    <input
                      value={optionAliasDraft.field_key}
                      onChange={(event) => setOptionAliasDraft((current) => ({ ...current, field_key: event.target.value }))}
                      placeholder="field key"
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    />
                    <input
                      value={optionAliasDraft.alias_value}
                      onChange={(event) => setOptionAliasDraft((current) => ({ ...current, alias_value: event.target.value }))}
                      placeholder="alias value"
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    />
                    <input
                      value={optionAliasDraft.canonical_value}
                      onChange={(event) => setOptionAliasDraft((current) => ({ ...current, canonical_value: event.target.value }))}
                      placeholder="canonical value"
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    />
                    <select
                      value={optionAliasDraft.scope}
                      onChange={(event) => setOptionAliasDraft((current) => ({ ...current, scope: event.target.value as 'crm' | 'workspace' }))}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="crm">CRM scope</option>
                      <option value="workspace">Workspace scope</option>
                    </select>
                    <Button type="button" size="sm" onClick={handleAddOptionAlias}>Add alias</Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {intelligenceConfig.option_aliases.map((item, index) => (
                      <div key={`${item.field_key}-${item.alias_value}-${index}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <span>{item.field_key}: {item.alias_value} to {item.canonical_value} ({item.scope})</span>
                        <button
                          type="button"
                          onClick={() => setIntelligenceConfig((current) => current ? { ...current, option_aliases: current.option_aliases.filter((_, i) => i !== index) } : current)}
                          className="text-rose-600"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </Card>
        ) : null}

        <AnimatePresence>
          {importResult ? (
            <motion.div
              key="import-result"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
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
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </WorkspaceLayout>
  );
}
