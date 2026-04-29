import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getWorkspaceCrmConfig } from '../_shared/records.ts';
import { authenticateRequest, ensureWorkspaceRole, isRecordLike } from '../_shared/server.ts';

type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'select'
  | 'multi_select';

interface ExistingFieldRow {
  id: string;
  field_key: string;
  is_system: boolean;
  is_active: boolean;
}

interface NormalizedField {
  id: string | null;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  is_required: boolean;
  is_active: boolean;
  options: string[] | null;
  placeholder: string | null;
  help_text: string | null;
  validation_rules: Record<string, unknown>;
  default_value: unknown;
  position: number;
}

const allowedFieldTypes = new Set<CustomFieldType>([
  'text',
  'textarea',
  'number',
  'date',
  'datetime',
  'boolean',
  'select',
  'multi_select',
]);

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getNullableString(value: unknown) {
  const nextValue = getString(value);
  return nextValue.length > 0 ? nextValue : null;
}

function normalizeFieldKey(value: unknown) {
  const raw = getString(value).toLowerCase();
  const normalized = raw.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return normalized.slice(0, 48);
}

function normalizeOptions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();

  for (const item of value) {
    const nextValue = getString(item);

    if (nextValue.length > 0) {
      unique.add(nextValue);
    }
  }

  return [...unique];
}

function normalizeValidationRules(value: unknown) {
  return isRecordLike(value) ? value : {};
}

function normalizeDefaultValue(fieldType: CustomFieldType, value: unknown, options: string[]) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (fieldType === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new Error('Default value for boolean fields must be true or false.');
    }

    return value;
  }

  if (fieldType === 'number') {
    const numericValue = typeof value === 'number' ? value : Number(value);

    if (Number.isNaN(numericValue)) {
      throw new Error('Default value for number fields must be numeric.');
    }

    return numericValue;
  }

  if (fieldType === 'multi_select') {
    if (!Array.isArray(value)) {
      throw new Error('Default value for multi-select fields must be an array.');
    }

    const normalized = value.map((item) => getString(item)).filter((item) => item.length > 0);

    if (options.length > 0) {
      for (const item of normalized) {
        if (!options.includes(item)) {
          throw new Error('Default values for multi-select fields must exist in field options.');
        }
      }
    }

    return normalized;
  }

  const textValue = getString(value);

  if (textValue.length === 0) {
    return null;
  }

  if (fieldType === 'select' && options.length > 0 && !options.includes(textValue)) {
    throw new Error('Default value for select fields must exist in field options.');
  }

  return textValue;
}

function normalizeField(
  value: unknown,
  position: number,
  existingById: Map<string, ExistingFieldRow>,
  existingByKey: Map<string, ExistingFieldRow>,
) {
  if (!isRecordLike(value)) {
    throw new Error(`Field at position ${position + 1} is invalid.`);
  }

  const id = getNullableString(value.id);
  const label = getString(value.label);
  const fieldKey = normalizeFieldKey(value.field_key);
  const fieldType = getString(value.field_type) as CustomFieldType;
  const isRequired = value.is_required === true;
  const isActive = value.is_active !== false;
  const placeholder = getNullableString(value.placeholder);
  const helpText = getNullableString(value.help_text);
  const validationRules = normalizeValidationRules(value.validation_rules);
  const options = normalizeOptions(value.options);
  const targetById = id ? existingById.get(id) ?? null : null;
  const targetByKey = existingByKey.get(fieldKey) ?? null;

  if (label.length < 2) {
    throw new Error(`Field ${position + 1}: label must be at least 2 characters.`);
  }

  if (!fieldKey || !/^[a-z][a-z0-9_]{1,47}$/.test(fieldKey)) {
    throw new Error(
      `Field ${position + 1}: key must start with a letter and use only lowercase letters, numbers, and underscores.`,
    );
  }

  if (!allowedFieldTypes.has(fieldType)) {
    throw new Error(`Field ${position + 1}: unsupported field type.`);
  }

  if ((fieldType === 'select' || fieldType === 'multi_select') && options.length === 0) {
    throw new Error(`Field ${position + 1}: select fields require at least one option.`);
  }

  if ((fieldType === 'select' || fieldType === 'multi_select') && options.length > 200) {
    throw new Error(`Field ${position + 1}: too many options.`);
  }

  if (targetById?.is_system || (targetByKey?.is_system && targetByKey.id !== id)) {
    throw new Error(`Field ${position + 1}: system fields cannot be modified from form builder.`);
  }

  if (id && !targetById) {
    throw new Error(`Field ${position + 1}: unknown field id.`);
  }

  if (targetById && targetByKey && targetById.id !== targetByKey.id) {
    throw new Error(`Field ${position + 1}: key is already used by another field.`);
  }

  const normalizedOptions = fieldType === 'select' || fieldType === 'multi_select' ? options : [];
  const defaultValue = normalizeDefaultValue(fieldType, value.default_value, normalizedOptions);

  return {
    id: id ?? targetByKey?.id ?? null,
    field_key: fieldKey,
    label,
    field_type: fieldType,
    is_required: isRequired,
    is_active: isActive,
    options: normalizedOptions.length > 0 ? normalizedOptions : null,
    placeholder,
    help_text: helpText,
    validation_rules: validationRules,
    default_value: defaultValue,
    position,
  } satisfies NormalizedField;
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
    const workspaceId = getString(payload.workspace_id);
    const customFields = Array.isArray(payload.custom_fields) ? payload.custom_fields : null;

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    if (!customFields) {
      return jsonResponse({ error: 'custom_fields must be an array.' }, 400);
    }

    await ensureWorkspaceRole(authContext.serviceClient, workspaceId, authContext.user.id, ['owner']);

    const { data: existingRows, error: existingError } = await authContext.serviceClient
      .from('custom_field_definitions')
      .select('id, field_key, is_system, is_active')
      .eq('workspace_id', workspaceId)
      .eq('entity_type', 'record');

    if (existingError) {
      return jsonResponse({ error: existingError.message }, 400);
    }

    const existing = (existingRows ?? []) as ExistingFieldRow[];
    const existingById = new Map(existing.map((field) => [field.id, field]));
    const existingByKey = new Map(existing.map((field) => [field.field_key, field]));
    const normalizedFields = customFields.map((field, index) =>
      normalizeField(field, index, existingById, existingByKey)
    );
    const uniqueKeys = new Set<string>();
    const uniqueIds = new Set<string>();

    for (const field of normalizedFields) {
      if (uniqueKeys.has(field.field_key)) {
        throw new Error(`Duplicate field key: ${field.field_key}`);
      }

      uniqueKeys.add(field.field_key);

      if (field.id) {
        if (uniqueIds.has(field.id)) {
          throw new Error('Duplicate field id provided in form builder payload.');
        }

        uniqueIds.add(field.id);
      }
    }

    let keepIds: string[] = [];
    if (normalizedFields.length > 0) {
      const upsertRows = normalizedFields.map((field) => ({
        id: field.id ?? undefined,
        workspace_id: workspaceId,
        entity_type: 'record',
        field_key: field.field_key,
        label: field.label,
        field_type: field.field_type,
        is_required: field.is_required,
        is_system: false,
        is_active: field.is_active,
        position: field.position,
        placeholder: field.placeholder,
        help_text: field.help_text,
        default_value: field.default_value,
        options: field.options,
        validation_rules: field.validation_rules,
        visibility_rules: {},
      }));

      const { error: upsertError } = await authContext.serviceClient
        .from('custom_field_definitions')
        .upsert(upsertRows, { onConflict: 'id' });

      if (upsertError) {
        return jsonResponse({ error: upsertError.message }, 400);
      }

      const { data: activeFields, error: activeFieldsError } = await authContext.serviceClient
        .from('custom_field_definitions')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('entity_type', 'record')
        .in(
          'field_key',
          normalizedFields.map((field) => field.field_key),
        );

      if (activeFieldsError) {
        return jsonResponse({ error: activeFieldsError.message }, 400);
      }

      keepIds = (activeFields ?? [])
        .map((field) => getString((field as Record<string, unknown>).id))
        .filter((id) => id.length > 0);
    }

    const deactivateQuery = authContext.serviceClient
      .from('custom_field_definitions')
      .update({ is_active: false })
      .eq('workspace_id', workspaceId)
      .eq('entity_type', 'record')
      .eq('is_system', false)
      .eq('is_active', true);
    const { error: deactivateError } =
      keepIds.length > 0
        ? await deactivateQuery.not('id', 'in', `(${keepIds.join(',')})`)
        : await deactivateQuery;

    if (deactivateError) {
      return jsonResponse({ error: deactivateError.message }, 400);
    }

    const config = await getWorkspaceCrmConfig(authContext.serviceClient, workspaceId);
    return jsonResponse(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
