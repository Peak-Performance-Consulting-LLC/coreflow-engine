import type { EdgeClient } from './server.ts';

export type MappingStatus = 'auto_mapped' | 'needs_confirmation' | 'new_semantic' | 'ignored' | 'confirmed';
export type MappingSource = 'profile' | 'exact' | 'alias' | 'heuristic' | 'manual' | 'none';

export interface ImportMappingSuggestion {
  source_column: string;
  semantic_id: string | null;
  semantic_key: string | null;
  target_type: 'core' | 'custom' | null;
  target_key: string | null;
  confidence: number;
  status: MappingStatus;
  mapping_source: MappingSource;
  notes: string | null;
  sample_values: string[];
}

export interface FieldContext {
  crmType: string;
  semantics: Array<{ id: string; semantic_key: string; label: string }>;
  customFields: Array<{
    field_key: string;
    label: string;
    field_type: string;
    is_required: boolean;
    options: string[];
  }>;
  aliases: Array<{
    semantic_id: string;
    alias_text: string;
    weight: number;
    workspace_id: string | null;
    crm_type: string | null;
  }>;
  bindings: Array<{
    semantic_id: string;
    target_type: 'core' | 'custom';
    target_key: string;
    is_required: boolean;
    workspace_id: string | null;
    crm_type: string | null;
  }>;
}

export interface ImportProfileMatch {
  id: string;
  profile_name: string;
  source_fingerprint: string;
  mappings: Array<{
    source_column: string;
    semantic_id: string | null;
    target_type: 'core' | 'custom';
    target_key: string;
    confidence: number | null;
  }>;
}

const CORE_KEYS = new Set(['title', 'full_name', 'company_name', 'email', 'phone', 'status', 'priority']);

const DEFAULT_SEMANTIC_ALIASES: Record<string, string[]> = {
  title: ['lead', 'lead_title', 'subject', 'name', 'record_name'],
  full_name: ['full_name', 'name', 'contact_name', 'customer_name', 'client_name'],
  company_name: ['company', 'organization', 'firm', 'business_name'],
  email: ['email', 'email_address', 'mail', 'contact_email'],
  phone: ['phone', 'mobile', 'mobile_number', 'phone_number', 'contact_number', 'whatsapp_number'],
  status: ['status', 'lead_status', 'stage_status'],
  priority: ['priority', 'urgency', 'importance'],
};

function normalizeString(value: unknown) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
}

function tokenize(value: string) {
  return normalizeHeader(value)
    .split('_')
    .map((part) => part.trim())
    .filter(Boolean);
}

function jaccardScore(left: string, right: string) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = leftTokens.size + rightTokens.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function pickSampleValues(rows: Array<Record<string, unknown>>, column: string) {
  const samples: string[] = [];

  for (const row of rows) {
    const value = normalizeString(row[column]);

    if (!value) {
      continue;
    }

    if (!samples.includes(value)) {
      samples.push(value);
    }

    if (samples.length >= 3) {
      break;
    }
  }

  return samples;
}

function resolveBinding(
  semanticId: string,
  semanticKey: string,
  context: FieldContext,
): { target_type: 'core' | 'custom'; target_key: string } | null {
  const scopedBindings = context.bindings
    .filter((binding) => binding.semantic_id === semanticId)
    .sort((left, right) => {
      const leftScore = (left.workspace_id ? 2 : 0) + (left.crm_type ? 1 : 0);
      const rightScore = (right.workspace_id ? 2 : 0) + (right.crm_type ? 1 : 0);
      return rightScore - leftScore;
    });

  if (scopedBindings.length > 0) {
    return {
      target_type: scopedBindings[0].target_type,
      target_key: scopedBindings[0].target_key,
    };
  }

  if (CORE_KEYS.has(semanticKey)) {
    return {
      target_type: 'core',
      target_key: semanticKey,
    };
  }

  return null;
}

function semanticAliasesFor(semanticKey: string, contextAliases: string[]) {
  const defaults = DEFAULT_SEMANTIC_ALIASES[semanticKey] ?? [];
  const merged = new Set<string>();

  for (const value of [...defaults, ...contextAliases]) {
    const normalized = normalizeHeader(value);

    if (normalized) {
      merged.add(normalized);
    }
  }

  return [...merged];
}

export function buildSourceFingerprint(columns: string[]) {
  const normalized = columns.map((column) => normalizeHeader(column)).filter(Boolean).sort();
  return `v1:${hashString(normalized.join('|'))}:${normalized.length}`;
}

export async function getWorkspaceCrmType(serviceClient: EdgeClient, workspaceId: string) {
  const { data, error } = await serviceClient
    .from('workspaces')
    .select('crm_type')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.crm_type) {
    throw new Error('Workspace CRM type could not be resolved.');
  }

  return data.crm_type as string;
}

export async function loadFieldContext(serviceClient: EdgeClient, workspaceId: string, crmType: string): Promise<FieldContext> {
  const [
    customFieldsResult,
    semanticsResult,
    aliasesResult,
    bindingsResult,
  ] = await Promise.all([
    serviceClient
      .from('custom_field_definitions')
      .select('field_key, label, field_type, is_required, options')
      .eq('workspace_id', workspaceId)
      .eq('entity_type', 'record')
      .eq('is_active', true),
    serviceClient
      .from('field_semantics')
      .select('id, semantic_key, label'),
    serviceClient
      .from('field_aliases')
      .select('semantic_id, alias_text, weight, workspace_id, crm_type'),
    serviceClient
      .from('semantic_bindings')
      .select('semantic_id, target_type, target_key, is_required, workspace_id, crm_type'),
  ]);

  if (customFieldsResult.error) throw new Error(customFieldsResult.error.message);
  if (semanticsResult.error) throw new Error(semanticsResult.error.message);
  if (aliasesResult.error) throw new Error(aliasesResult.error.message);
  if (bindingsResult.error) throw new Error(bindingsResult.error.message);

  const customFields = (customFieldsResult.data ?? []).map((row) => {
    const options = Array.isArray(row.options)
      ? row.options.map((option) => normalizeString(option)).filter(Boolean)
      : [];

    return {
      field_key: row.field_key,
      label: row.label,
      field_type: row.field_type,
      is_required: Boolean(row.is_required),
      options,
    };
  });

  const aliases = (aliasesResult.data ?? [])
    .filter((row) => !row.workspace_id || row.workspace_id === workspaceId)
    .filter((row) => !row.crm_type || row.crm_type === crmType)
    .map((row) => ({
      semantic_id: row.semantic_id,
      alias_text: row.alias_text,
      weight: typeof row.weight === 'number' ? row.weight : Number(row.weight ?? 1),
      workspace_id: row.workspace_id,
      crm_type: row.crm_type,
    }));

  const bindings = (bindingsResult.data ?? [])
    .filter((row) => !row.workspace_id || row.workspace_id === workspaceId)
    .filter((row) => !row.crm_type || row.crm_type === crmType)
    .map((row) => ({
      semantic_id: row.semantic_id,
      target_type: row.target_type as 'core' | 'custom',
      target_key: row.target_key,
      is_required: Boolean(row.is_required),
      workspace_id: row.workspace_id,
      crm_type: row.crm_type,
    }));

  return {
    crmType,
    semantics: (semanticsResult.data ?? []).map((row) => ({
      id: row.id,
      semantic_key: row.semantic_key,
      label: row.label,
    })),
    customFields,
    aliases,
    bindings,
  };
}

export async function resolveImportProfile(
  serviceClient: EdgeClient,
  workspaceId: string,
  crmType: string,
  columns: string[],
): Promise<ImportProfileMatch | null> {
  const sourceFingerprint = buildSourceFingerprint(columns);
  const { data: profile, error: profileError } = await serviceClient
    .from('import_profiles')
    .select('id, profile_name, source_fingerprint')
    .eq('workspace_id', workspaceId)
    .eq('crm_type', crmType)
    .eq('source_fingerprint', sourceFingerprint)
    .eq('is_default', true)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile) {
    return null;
  }

  const { data: mappings, error: mappingsError } = await serviceClient
    .from('import_profile_mappings')
    .select('source_column, semantic_id, target_type, target_key, confidence')
    .eq('profile_id', profile.id);

  if (mappingsError) {
    throw new Error(mappingsError.message);
  }

  return {
    id: profile.id,
    profile_name: profile.profile_name,
    source_fingerprint: profile.source_fingerprint,
    mappings: (mappings ?? []).map((row) => ({
      source_column: row.source_column,
      semantic_id: row.semantic_id,
      target_type: row.target_type as 'core' | 'custom',
      target_key: row.target_key,
      confidence: typeof row.confidence === 'number' ? row.confidence : Number(row.confidence ?? NaN),
    })),
  };
}

export async function analyzeImportColumns(params: {
  serviceClient: EdgeClient;
  workspaceId: string;
  columns: string[];
  sampleRows: Array<Record<string, unknown>>;
  profile?: ImportProfileMatch | null;
}): Promise<{
  crmType: string;
  sourceFingerprint: string;
  profile: ImportProfileMatch | null;
  suggestions: ImportMappingSuggestion[];
  requiredMissingTargets: string[];
}> {
  const crmType = await getWorkspaceCrmType(params.serviceClient, params.workspaceId);
  const context = await loadFieldContext(params.serviceClient, params.workspaceId, crmType);
  const semanticById = new Map(context.semantics.map((semantic) => [semantic.id, semantic]));
  const customFieldByKey = new Map(context.customFields.map((field) => [field.field_key, field]));

  const aliasBySemanticId = new Map<string, string[]>();

  for (const alias of context.aliases) {
    const current = aliasBySemanticId.get(alias.semantic_id) ?? [];
    current.push(alias.alias_text);
    aliasBySemanticId.set(alias.semantic_id, current);
  }

  const normalizedProfileByColumn = new Map<string, ImportProfileMatch['mappings'][number]>();

  for (const profileMapping of params.profile?.mappings ?? []) {
    normalizedProfileByColumn.set(normalizeHeader(profileMapping.source_column), profileMapping);
  }

  const suggestions: ImportMappingSuggestion[] = params.columns.map((column) => {
    const normalizedColumn = normalizeHeader(column);
    const sampleValues = pickSampleValues(params.sampleRows, column);

    const profileMatch = normalizedProfileByColumn.get(normalizedColumn);

    if (profileMatch) {
      const semantic = profileMatch.semantic_id ? semanticById.get(profileMatch.semantic_id) : null;

      return {
        source_column: column,
        semantic_id: semantic?.id ?? null,
        semantic_key: semantic?.semantic_key ?? null,
        target_type: profileMatch.target_type,
        target_key: profileMatch.target_key,
        confidence: Math.max(0.8, Number.isFinite(profileMatch.confidence ?? NaN) ? Number(profileMatch.confidence) : 0.9),
        status: 'auto_mapped',
        mapping_source: 'profile',
        notes: `Mapped from saved profile: ${params.profile?.profile_name ?? 'default profile'}`,
        sample_values: sampleValues,
      };
    }

    if (CORE_KEYS.has(normalizedColumn)) {
      const semantic = context.semantics.find((item) => item.semantic_key === normalizedColumn) ?? null;

      return {
        source_column: column,
        semantic_id: semantic?.id ?? null,
        semantic_key: semantic?.semantic_key ?? normalizedColumn,
        target_type: 'core',
        target_key: normalizedColumn,
        confidence: 0.98,
        status: 'auto_mapped',
        mapping_source: 'exact',
        notes: 'Exact core field match.',
        sample_values: sampleValues,
      };
    }

    if (customFieldByKey.has(normalizedColumn)) {
      const semantic = context.semantics.find((item) => item.semantic_key === normalizedColumn) ?? null;

      return {
        source_column: column,
        semantic_id: semantic?.id ?? null,
        semantic_key: semantic?.semantic_key ?? null,
        target_type: 'custom',
        target_key: normalizedColumn,
        confidence: 0.94,
        status: 'auto_mapped',
        mapping_source: 'exact',
        notes: 'Exact custom field key match.',
        sample_values: sampleValues,
      };
    }

    let best: {
      semanticId: string;
      semanticKey: string;
      score: number;
      source: MappingSource;
      note: string;
    } | null = null;

    for (const semantic of context.semantics) {
      const semanticAliases = semanticAliasesFor(semantic.semantic_key, aliasBySemanticId.get(semantic.id) ?? []);

      for (const alias of semanticAliases) {
        if (!alias) {
          continue;
        }

        if (normalizedColumn === alias) {
          const score = alias === semantic.semantic_key ? 0.95 : 0.9;

          if (!best || score > best.score) {
            best = {
              semanticId: semantic.id,
              semanticKey: semantic.semantic_key,
              score,
              source: 'alias',
              note: `Matched semantic alias \"${alias}\".`,
            };
          }
          continue;
        }

        const similarity = jaccardScore(normalizedColumn, alias);

        if (similarity >= 0.66) {
          const score = Math.min(0.88, 0.62 + similarity * 0.3);

          if (!best || score > best.score) {
            best = {
              semanticId: semantic.id,
              semanticKey: semantic.semantic_key,
              score,
              source: 'heuristic',
              note: `Token similarity matched \"${alias}\".`,
            };
          }
        }
      }
    }

    if (!best) {
      return {
        source_column: column,
        semantic_id: null,
        semantic_key: null,
        target_type: null,
        target_key: null,
        confidence: 0,
        status: 'new_semantic',
        mapping_source: 'none',
        notes: 'No reliable semantic match. Needs user decision.',
        sample_values: sampleValues,
      };
    }

    const resolvedBinding = resolveBinding(best.semanticId, best.semanticKey, context);

    if (!resolvedBinding) {
      return {
        source_column: column,
        semantic_id: best.semanticId,
        semantic_key: best.semanticKey,
        target_type: null,
        target_key: null,
        confidence: best.score,
        status: 'new_semantic',
        mapping_source: best.source,
        notes: 'Semantic match found but no field binding exists yet.',
        sample_values: sampleValues,
      };
    }

    const status: MappingStatus = best.score >= 0.9 ? 'auto_mapped' : best.score >= 0.7 ? 'needs_confirmation' : 'new_semantic';

    return {
      source_column: column,
      semantic_id: best.semanticId,
      semantic_key: best.semanticKey,
      target_type: resolvedBinding.target_type,
      target_key: resolvedBinding.target_key,
      confidence: best.score,
      status,
      mapping_source: best.source,
      notes: best.note,
      sample_values: sampleValues,
    };
  });

  const mappedTargets = new Set(
    suggestions
      .filter((item) => item.target_type && item.target_key)
      .map((item) => `${item.target_type}:${item.target_key}`),
  );

  const requiredMissingTargets = context.bindings
    .filter((binding) => binding.is_required)
    .map((binding) => `${binding.target_type}:${binding.target_key}`)
    .filter((target) => !mappedTargets.has(target));

  const requiredCustomMissingTargets = context.customFields
    .filter((field) => field.is_required)
    .map((field) => `custom:${field.field_key}`)
    .filter((target) => !mappedTargets.has(target));

  const combinedRequiredMissingTargets = [...new Set([...requiredMissingTargets, ...requiredCustomMissingTargets])];

  return {
    crmType,
    sourceFingerprint: buildSourceFingerprint(params.columns),
    profile: params.profile ?? null,
    suggestions,
    requiredMissingTargets: combinedRequiredMissingTargets,
  };
}

function parseDateValue(value: string, format: 'iso' | 'mdy' | 'dmy' | 'auto') {
  if (format === 'iso') {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  }

  const parts = value.split(/[-/]/).map((item) => item.trim());

  if (parts.length === 3 && format !== 'auto') {
    const [first, second, third] = parts;
    const year = format === 'mdy' || format === 'dmy' ? third : first;
    const month = format === 'mdy' ? first : second;
    const day = format === 'dmy' ? first : second;

    if (/^\d{1,4}$/.test(year) && /^\d{1,2}$/.test(month) && /^\d{1,2}$/.test(day)) {
      const normalized = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export async function loadTransformContext(serviceClient: EdgeClient, workspaceId: string, crmType: string) {
  const [rulesResult, optionAliasesResult, customFieldsResult] = await Promise.all([
    serviceClient
      .from('value_transform_rules')
      .select('target_type, target_key, rule_type, rule_config, workspace_id, crm_type')
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`),
    serviceClient
      .from('option_aliases')
      .select('field_key, alias_value, canonical_value, workspace_id, crm_type')
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`),
    serviceClient
      .from('custom_field_definitions')
      .select('field_key, field_type, options')
      .eq('workspace_id', workspaceId)
      .eq('entity_type', 'record')
      .eq('is_active', true),
  ]);

  if (rulesResult.error) throw new Error(rulesResult.error.message);
  if (optionAliasesResult.error) throw new Error(optionAliasesResult.error.message);
  if (customFieldsResult.error) throw new Error(customFieldsResult.error.message);

  const rules = (rulesResult.data ?? [])
    .filter((row) => !row.crm_type || row.crm_type === crmType)
    .sort((left, right) => {
      const leftScope = (left.workspace_id ? 2 : 0) + (left.crm_type ? 1 : 0);
      const rightScope = (right.workspace_id ? 2 : 0) + (right.crm_type ? 1 : 0);
      return rightScope - leftScope;
    });

  const optionAliases = (optionAliasesResult.data ?? [])
    .filter((row) => !row.crm_type || row.crm_type === crmType)
    .sort((left, right) => {
      const leftScope = (left.workspace_id ? 2 : 0) + (left.crm_type ? 1 : 0);
      const rightScope = (right.workspace_id ? 2 : 0) + (right.crm_type ? 1 : 0);
      return rightScope - leftScope;
    });

  const customFieldByKey = new Map(
    (customFieldsResult.data ?? []).map((row) => [
      row.field_key,
      {
        field_type: row.field_type,
        options: Array.isArray(row.options) ? row.options.map((item) => normalizeString(item)).filter(Boolean) : [],
      },
    ]),
  );

  return {
    rules,
    optionAliases,
    customFieldByKey,
  };
}

export function transformMappedValue(params: {
  value: unknown;
  targetType: 'core' | 'custom';
  targetKey: string;
  customFieldType?: string;
  customOptions?: string[];
  rules: Array<{ target_type: string; target_key: string; rule_type: string; rule_config: Record<string, unknown> | null }>;
  optionAliases: Array<{ field_key: string; alias_value: string; canonical_value: string }>;
}) {
  const raw = normalizeString(params.value);

  if (!raw) {
    return null;
  }

  const scopedRules = params.rules.filter(
    (rule) => rule.target_type === params.targetType && rule.target_key === params.targetKey,
  );

  for (const rule of scopedRules) {
    const config = typeof rule.rule_config === 'object' && rule.rule_config !== null
      ? rule.rule_config as Record<string, unknown>
      : {};

    if (rule.rule_type === 'boolean') {
      const trueValues = Array.isArray(config.true_values)
        ? config.true_values.map((value) => normalizeString(value).toLowerCase()).filter(Boolean)
        : ['true', '1', 'yes', 'y'];
      const falseValues = Array.isArray(config.false_values)
        ? config.false_values.map((value) => normalizeString(value).toLowerCase()).filter(Boolean)
        : ['false', '0', 'no', 'n'];

      const lowered = raw.toLowerCase();

      if (trueValues.includes(lowered)) return true;
      if (falseValues.includes(lowered)) return false;
    }

    if (rule.rule_type === 'number') {
      const numeric = Number(raw.replace(/,/g, ''));

      if (!Number.isNaN(numeric)) {
        return numeric;
      }
    }

    if (rule.rule_type === 'date') {
      const format = normalizeString(config.input_format) as 'iso' | 'mdy' | 'dmy' | 'auto';
      const parsed = parseDateValue(raw, format || 'auto');

      if (parsed) {
        return parsed;
      }
    }
  }

  if (params.customFieldType === 'boolean') {
    const lowered = raw.toLowerCase();

    if (['true', '1', 'yes', 'y'].includes(lowered)) return true;
    if (['false', '0', 'no', 'n'].includes(lowered)) return false;
  }

  if (params.customFieldType === 'number') {
    const numeric = Number(raw.replace(/,/g, ''));

    if (!Number.isNaN(numeric)) {
      return numeric;
    }
  }

  if (params.customFieldType === 'date') {
    const parsed = parseDateValue(raw, 'auto');
    if (parsed) {
      return parsed;
    }
  }

  if (params.customFieldType === 'multi_select') {
    const segments = raw
      .split(/[|;,]/)
      .map((item) => normalizeString(item))
      .filter(Boolean);

    return segments;
  }

  if (params.customFieldType === 'select' || params.customFieldType === 'multi_select') {
    const optionAlias = params.optionAliases.find(
      (alias) => alias.field_key === params.targetKey && normalizeHeader(alias.alias_value) === normalizeHeader(raw),
    );

    if (optionAlias) {
      return optionAlias.canonical_value;
    }

    if (params.customOptions && params.customOptions.length > 0) {
      const directMatch = params.customOptions.find((option) => normalizeHeader(option) === normalizeHeader(raw));

      if (directMatch) {
        return directMatch;
      }
    }
  }

  return raw;
}
