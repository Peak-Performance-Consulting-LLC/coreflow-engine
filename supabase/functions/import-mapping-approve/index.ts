import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getWorkspaceCrmType, loadFieldContext } from '../_shared/import-intelligence.ts';
import { authenticateRequest, ensureWorkspaceMembership, ensureWorkspaceRole } from '../_shared/server.ts';

const allowedCoreTargetKeys = new Set([
  'title',
  'full_name',
  'company_name',
  'email',
  'phone',
  'status',
  'priority',
]);

interface ApprovalMapping {
  source_column: string;
  semantic_id: string | null;
  target_type: 'core' | 'custom' | null;
  target_key: string | null;
  confidence: number;
  status: 'auto_mapped' | 'needs_confirmation' | 'new_semantic' | 'ignored' | 'confirmed';
  mapping_source: 'profile' | 'exact' | 'alias' | 'heuristic' | 'manual' | 'none';
  notes: string | null;
}

interface NewFieldRequest {
  source_column: string;
  field_key: string;
  label: string;
  field_type: 'text' | 'textarea' | 'number' | 'date' | 'datetime' | 'boolean' | 'select' | 'multi_select';
  options?: string[];
  is_required?: boolean;
  placeholder?: string | null;
  help_text?: string | null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authContext = await authenticateRequest(request);

    if (authContext instanceof Response) {
      return authContext;
    }

    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const workspaceId = typeof payload.workspace_id === 'string' ? payload.workspace_id.trim() : '';

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    const mappings = (Array.isArray(payload.mappings) ? payload.mappings : [])
      .filter((value) => typeof value === 'object' && value !== null)
      .map((value) => {
        const mapping = value as Record<string, unknown>;

        return {
          source_column: typeof mapping.source_column === 'string' ? mapping.source_column.trim() : '',
          semantic_id: typeof mapping.semantic_id === 'string' ? mapping.semantic_id.trim() : null,
          target_type: mapping.target_type === 'core' || mapping.target_type === 'custom' ? mapping.target_type : null,
          target_key: typeof mapping.target_key === 'string' ? mapping.target_key.trim() : null,
          confidence: typeof mapping.confidence === 'number' ? mapping.confidence : 0,
          status: (typeof mapping.status === 'string' ? mapping.status : 'confirmed') as ApprovalMapping['status'],
          mapping_source: (typeof mapping.mapping_source === 'string' ? mapping.mapping_source : 'manual') as ApprovalMapping['mapping_source'],
          notes: typeof mapping.notes === 'string' ? mapping.notes : null,
        } as ApprovalMapping;
      })
      .filter((mapping) => mapping.source_column);

    const createFields = (Array.isArray(payload.create_fields) ? payload.create_fields : [])
      .filter((value) => typeof value === 'object' && value !== null)
      .map((value) => {
        const field = value as Record<string, unknown>;

        return {
          source_column: typeof field.source_column === 'string' ? field.source_column.trim() : '',
          field_key: typeof field.field_key === 'string' ? field.field_key.trim() : '',
          label: typeof field.label === 'string' ? field.label.trim() : '',
          field_type: typeof field.field_type === 'string' ? field.field_type : 'text',
          options: Array.isArray(field.options)
            ? field.options.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
            : [],
          is_required: Boolean(field.is_required),
          placeholder: typeof field.placeholder === 'string' ? field.placeholder : null,
          help_text: typeof field.help_text === 'string' ? field.help_text : null,
        } as NewFieldRequest;
      })
      .filter((field) => field.source_column && field.field_key && field.label);

    if (mappings.length === 0 && createFields.length === 0) {
      return jsonResponse({ error: 'No mappings to approve.' }, 400);
    }

    if (createFields.length > 0) {
      await ensureWorkspaceRole(authContext.serviceClient, workspaceId, authContext.user.id, ['owner']);

      const { error: createFieldError } = await authContext.serviceClient
        .from('custom_field_definitions')
        .insert(
          createFields.map((field, index) => ({
            workspace_id: workspaceId,
            entity_type: 'record',
            field_key: field.field_key,
            label: field.label,
            field_type: field.field_type,
            is_required: field.is_required,
            is_active: true,
            is_system: false,
            options: field.options.length > 0 ? field.options : null,
            placeholder: field.placeholder,
            help_text: field.help_text,
            validation_rules: {},
            default_value: null,
            visibility_rules: {},
            position: 1000 + index,
          })),
        );

      if (createFieldError) {
        return jsonResponse({ error: createFieldError.message }, 400);
      }

      for (const field of createFields) {
        const existing = mappings.find((mapping) => mapping.source_column === field.source_column);

        if (existing) {
          existing.target_type = 'custom';
          existing.target_key = field.field_key;
          existing.status = 'confirmed';
          existing.mapping_source = 'manual';
          existing.notes = 'Custom field created during import approval.';
          continue;
        }

        mappings.push({
          source_column: field.source_column,
          semantic_id: null,
          target_type: 'custom',
          target_key: field.field_key,
          confidence: 1,
          status: 'confirmed',
          mapping_source: 'manual',
          notes: 'Custom field created during import approval.',
        });
      }
    }

    const normalizedMappings = mappings
      .filter((mapping) => mapping.target_type && mapping.target_key)
      .map((mapping) => ({
        source_column: mapping.source_column,
        semantic_id: mapping.semantic_id,
        target_type: mapping.target_type as 'core' | 'custom',
        target_key: mapping.target_key as string,
        confidence: mapping.confidence,
        status: mapping.status === 'ignored' ? 'ignored' : 'confirmed',
        mapping_source: mapping.mapping_source,
        notes: mapping.notes,
      }));

    const duplicateSource = new Set<string>();
    const duplicateTargets = new Set<string>();
    const seenSources = new Set<string>();
    const seenTargets = new Set<string>();

    for (const mapping of normalizedMappings) {
      if (seenSources.has(mapping.source_column)) {
        duplicateSource.add(mapping.source_column);
      }

      seenSources.add(mapping.source_column);
      const targetKey = `${mapping.target_type}:${mapping.target_key}`;

      if (seenTargets.has(targetKey)) {
        duplicateTargets.add(targetKey);
      }

      seenTargets.add(targetKey);
    }

    if (duplicateSource.size > 0) {
      return jsonResponse({ error: `Duplicate source mappings: ${[...duplicateSource].join(', ')}` }, 400);
    }

    if (duplicateTargets.size > 0) {
      return jsonResponse({ error: `Duplicate target mappings: ${[...duplicateTargets].join(', ')}` }, 400);
    }

    const crmType = await getWorkspaceCrmType(authContext.serviceClient, workspaceId);
    const context = await loadFieldContext(authContext.serviceClient, workspaceId, crmType);
    const customFieldKeys = new Set(context.customFields.map((field) => field.field_key));

    for (const mapping of normalizedMappings) {
      if (mapping.target_type === 'core' && !allowedCoreTargetKeys.has(mapping.target_key)) {
        return jsonResponse({ error: `Unsupported core import target: ${mapping.target_key}` }, 400);
      }

      if (mapping.target_type === 'custom' && !customFieldKeys.has(mapping.target_key)) {
        return jsonResponse({ error: `Unknown custom import target: ${mapping.target_key}` }, 400);
      }
    }

    const requiredTargets = context.bindings
      .filter((binding) => binding.is_required)
      .map((binding) => `${binding.target_type}:${binding.target_key}`);
    const requiredCustomTargets = context.customFields
      .filter((field) => field.is_required)
      .map((field) => `custom:${field.field_key}`);
    const mappedTargets = new Set(normalizedMappings.map((mapping) => `${mapping.target_type}:${mapping.target_key}`));

    const missingRequiredTargets = [...new Set([...requiredTargets, ...requiredCustomTargets])]
      .filter((target) => !mappedTargets.has(target));

    if (missingRequiredTargets.length > 0) {
      return jsonResponse({
        error: 'Required fields are not mapped.',
        missing_required_targets: missingRequiredTargets,
      }, 400);
    }

    return jsonResponse({
      workspace_id: workspaceId,
      mappings: normalizedMappings,
      missing_required_targets: missingRequiredTargets,
      created_custom_fields: createFields.map((field) => field.field_key),
      message: `Approved ${normalizedMappings.length} mapping${normalizedMappings.length === 1 ? '' : 's'}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
