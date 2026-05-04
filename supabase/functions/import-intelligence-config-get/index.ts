import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getWorkspaceCrmType } from '../_shared/import-intelligence.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';

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
    const crmType = await getWorkspaceCrmType(authContext.serviceClient, workspaceId);

    const [
      semanticsResult,
      aliasesResult,
      bindingsResult,
      rulesResult,
      optionAliasesResult,
      customFieldsResult,
    ] = await Promise.all([
      authContext.serviceClient
        .from('field_semantics')
        .select('id, semantic_key, label, description')
        .order('semantic_key', { ascending: true }),
      authContext.serviceClient
        .from('field_aliases')
        .select('id, semantic_id, alias_text, weight, workspace_id, crm_type')
        .eq('workspace_id', workspaceId)
        .or(`crm_type.is.null,crm_type.eq.${crmType}`)
        .order('alias_text', { ascending: true }),
      authContext.serviceClient
        .from('semantic_bindings')
        .select('id, semantic_id, target_type, target_key, is_required, workspace_id, crm_type')
        .eq('workspace_id', workspaceId)
        .or(`crm_type.is.null,crm_type.eq.${crmType}`)
        .order('target_key', { ascending: true }),
      authContext.serviceClient
        .from('value_transform_rules')
        .select('id, target_type, target_key, rule_type, rule_config, workspace_id, crm_type')
        .eq('workspace_id', workspaceId)
        .or(`crm_type.is.null,crm_type.eq.${crmType}`)
        .order('target_key', { ascending: true }),
      authContext.serviceClient
        .from('option_aliases')
        .select('id, field_key, alias_value, canonical_value, workspace_id, crm_type')
        .eq('workspace_id', workspaceId)
        .or(`crm_type.is.null,crm_type.eq.${crmType}`)
        .order('field_key', { ascending: true }),
      authContext.serviceClient
        .from('custom_field_definitions')
        .select('field_key, label, field_type, is_required')
        .eq('workspace_id', workspaceId)
        .eq('entity_type', 'record')
        .eq('is_active', true)
        .order('position', { ascending: true }),
    ]);

    if (semanticsResult.error) throw new Error(semanticsResult.error.message);
    if (aliasesResult.error) throw new Error(aliasesResult.error.message);
    if (bindingsResult.error) throw new Error(bindingsResult.error.message);
    if (rulesResult.error) throw new Error(rulesResult.error.message);
    if (optionAliasesResult.error) throw new Error(optionAliasesResult.error.message);
    if (customFieldsResult.error) throw new Error(customFieldsResult.error.message);

    return jsonResponse({
      workspace_id: workspaceId,
      crm_type: crmType,
      semantics: semanticsResult.data ?? [],
      aliases: (aliasesResult.data ?? []).map((item) => ({ ...item, scope: item.crm_type ? 'crm' : 'workspace' })),
      bindings: (bindingsResult.data ?? []).map((item) => ({ ...item, scope: item.crm_type ? 'crm' : 'workspace' })),
      transform_rules: (rulesResult.data ?? []).map((item) => ({ ...item, scope: item.crm_type ? 'crm' : 'workspace' })),
      option_aliases: (optionAliasesResult.data ?? []).map((item) => ({ ...item, scope: item.crm_type ? 'crm' : 'workspace' })),
      custom_fields: customFieldsResult.data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
