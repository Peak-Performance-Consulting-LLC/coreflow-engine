import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getWorkspaceCrmType } from '../_shared/import-intelligence.ts';
import { authenticateRequest, ensureWorkspaceRole } from '../_shared/server.ts';

const allowedTargetTypes = new Set(['core', 'custom']);
const allowedRuleTypes = new Set(['date', 'number', 'boolean', 'enum', 'phone', 'currency']);

function normalizeString(value: unknown) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function asNullableObject(value: unknown) {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
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
    const workspaceId = normalizeString(payload.workspace_id);

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceRole(authContext.serviceClient, workspaceId, authContext.user.id, ['owner']);
    const crmType = await getWorkspaceCrmType(authContext.serviceClient, workspaceId);

    const aliases = (Array.isArray(payload.aliases) ? payload.aliases : [])
      .filter((value) => typeof value === 'object' && value !== null)
      .map((value) => {
        const item = value as Record<string, unknown>;
        return {
          semantic_id: normalizeString(item.semantic_id),
          alias_text: normalizeString(item.alias_text),
          weight: typeof item.weight === 'number' ? item.weight : Number(item.weight ?? 1),
          scope: normalizeString(item.scope) === 'workspace' ? 'workspace' : 'crm',
        };
      })
      .filter((item) => item.semantic_id && item.alias_text);

    const bindings = (Array.isArray(payload.bindings) ? payload.bindings : [])
      .filter((value) => typeof value === 'object' && value !== null)
      .map((value) => {
        const item = value as Record<string, unknown>;
        const targetType = normalizeString(item.target_type);

        return {
          semantic_id: normalizeString(item.semantic_id),
          target_type: allowedTargetTypes.has(targetType) ? targetType : '',
          target_key: normalizeString(item.target_key),
          is_required: Boolean(item.is_required),
          scope: normalizeString(item.scope) === 'workspace' ? 'workspace' : 'crm',
        };
      })
      .filter((item) => item.semantic_id && item.target_type && item.target_key);

    const transformRules = (Array.isArray(payload.transform_rules) ? payload.transform_rules : [])
      .filter((value) => typeof value === 'object' && value !== null)
      .map((value) => {
        const item = value as Record<string, unknown>;
        const targetType = normalizeString(item.target_type);
        const ruleType = normalizeString(item.rule_type);

        return {
          target_type: allowedTargetTypes.has(targetType) ? targetType : '',
          target_key: normalizeString(item.target_key),
          rule_type: allowedRuleTypes.has(ruleType) ? ruleType : '',
          rule_config: asNullableObject(item.rule_config),
          scope: normalizeString(item.scope) === 'workspace' ? 'workspace' : 'crm',
        };
      })
      .filter((item) => item.target_type && item.target_key && item.rule_type);

    const optionAliases = (Array.isArray(payload.option_aliases) ? payload.option_aliases : [])
      .filter((value) => typeof value === 'object' && value !== null)
      .map((value) => {
        const item = value as Record<string, unknown>;
        return {
          field_key: normalizeString(item.field_key),
          alias_value: normalizeString(item.alias_value),
          canonical_value: normalizeString(item.canonical_value),
          scope: normalizeString(item.scope) === 'workspace' ? 'workspace' : 'crm',
        };
      })
      .filter((item) => item.field_key && item.alias_value && item.canonical_value);

    const clearScope = normalizeString(payload.clear_scope);

    if (clearScope === 'all') {
      await authContext.serviceClient
        .from('field_aliases')
        .delete()
        .eq('workspace_id', workspaceId);
      await authContext.serviceClient
        .from('semantic_bindings')
        .delete()
        .eq('workspace_id', workspaceId);
      await authContext.serviceClient
        .from('value_transform_rules')
        .delete()
        .eq('workspace_id', workspaceId);
      await authContext.serviceClient
        .from('option_aliases')
        .delete()
        .eq('workspace_id', workspaceId);
    }

    if (aliases.length > 0) {
      const { error } = await authContext.serviceClient
        .from('field_aliases')
        .upsert(
          aliases.map((item) => ({
            workspace_id: workspaceId,
            crm_type: item.scope === 'workspace' ? null : crmType,
            semantic_id: item.semantic_id,
            alias_text: item.alias_text,
            weight: Number.isFinite(item.weight) ? item.weight : 1,
            created_by: authContext.user.id,
          })),
          { onConflict: 'workspace_id,crm_type,semantic_id,alias_text' },
        );

      if (error) throw new Error(error.message);
    }

    if (bindings.length > 0) {
      const { error } = await authContext.serviceClient
        .from('semantic_bindings')
        .upsert(
          bindings.map((item) => ({
            workspace_id: workspaceId,
            crm_type: item.scope === 'workspace' ? null : crmType,
            semantic_id: item.semantic_id,
            target_type: item.target_type,
            target_key: item.target_key,
            is_required: item.is_required,
            created_by: authContext.user.id,
          })),
          { onConflict: 'workspace_id,crm_type,semantic_id' },
        );

      if (error) throw new Error(error.message);
    }

    if (transformRules.length > 0) {
      const { error } = await authContext.serviceClient
        .from('value_transform_rules')
        .insert(
          transformRules.map((item) => ({
            workspace_id: workspaceId,
            crm_type: item.scope === 'workspace' ? null : crmType,
            target_type: item.target_type,
            target_key: item.target_key,
            rule_type: item.rule_type,
            rule_config: item.rule_config,
            created_by: authContext.user.id,
          })),
        );

      if (error) throw new Error(error.message);
    }

    if (optionAliases.length > 0) {
      const { error } = await authContext.serviceClient
        .from('option_aliases')
        .upsert(
          optionAliases.map((item) => ({
            workspace_id: workspaceId,
            crm_type: item.scope === 'workspace' ? null : crmType,
            field_key: item.field_key,
            alias_value: item.alias_value,
            canonical_value: item.canonical_value,
            created_by: authContext.user.id,
          })),
          { onConflict: 'workspace_id,crm_type,field_key,alias_value' },
        );

      if (error) throw new Error(error.message);
    }

    return jsonResponse({
      message: 'Import intelligence settings saved.',
      counts: {
        aliases: aliases.length,
        bindings: bindings.length,
        transform_rules: transformRules.length,
        option_aliases: optionAliases.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
