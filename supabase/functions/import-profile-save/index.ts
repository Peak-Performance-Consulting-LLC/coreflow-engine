import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { buildSourceFingerprint, getWorkspaceCrmType } from '../_shared/import-intelligence.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';

interface MappingPayload {
  source_column: string;
  semantic_id?: string | null;
  target_type: 'core' | 'custom';
  target_key: string;
  confidence?: number | null;
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

    const columns = (Array.isArray(payload.columns) ? payload.columns : [])
      .map((column) => (typeof column === 'string' ? column.trim() : ''))
      .filter(Boolean);
    const sourceFingerprint = typeof payload.source_fingerprint === 'string' && payload.source_fingerprint.trim()
      ? payload.source_fingerprint.trim()
      : buildSourceFingerprint(columns);

    const mappings = (Array.isArray(payload.mappings) ? payload.mappings : [])
      .filter((value) => typeof value === 'object' && value !== null)
      .map((value) => {
        const mapping = value as Record<string, unknown>;
        return {
          source_column: typeof mapping.source_column === 'string' ? mapping.source_column.trim() : '',
          semantic_id: typeof mapping.semantic_id === 'string' ? mapping.semantic_id.trim() : null,
          target_type: mapping.target_type === 'custom' ? 'custom' : 'core',
          target_key: typeof mapping.target_key === 'string' ? mapping.target_key.trim() : '',
          confidence: typeof mapping.confidence === 'number' ? mapping.confidence : null,
        } as MappingPayload;
      })
      .filter((mapping) => mapping.source_column && mapping.target_key);

    if (mappings.length === 0) {
      return jsonResponse({ error: 'At least one mapping is required to save a profile.' }, 400);
    }

    const crmType = await getWorkspaceCrmType(authContext.serviceClient, workspaceId);
    const profileName = typeof payload.profile_name === 'string' && payload.profile_name.trim()
      ? payload.profile_name.trim()
      : `Default profile ${new Date().toISOString().slice(0, 10)}`;
    const isDefault = payload.is_default !== false;

    if (isDefault) {
      await authContext.serviceClient
        .from('import_profiles')
        .update({ is_default: false })
        .eq('workspace_id', workspaceId)
        .eq('crm_type', crmType)
        .eq('source_fingerprint', sourceFingerprint);
    }

    const { data: profile, error: profileError } = await authContext.serviceClient
      .from('import_profiles')
      .insert({
        workspace_id: workspaceId,
        crm_type: crmType,
        source_fingerprint: sourceFingerprint,
        profile_name: profileName,
        is_default: isDefault,
        created_by: authContext.user.id,
      })
      .select('id, workspace_id, crm_type, source_fingerprint, profile_name, is_default, created_at, updated_at')
      .single();

    if (profileError || !profile) {
      return jsonResponse({ error: profileError?.message || 'Unable to save import profile.' }, 500);
    }

    const { error: mappingsError } = await authContext.serviceClient
      .from('import_profile_mappings')
      .insert(
        mappings.map((mapping) => ({
          profile_id: profile.id,
          source_column: mapping.source_column,
          semantic_id: mapping.semantic_id,
          target_type: mapping.target_type,
          target_key: mapping.target_key,
          confidence: mapping.confidence,
        })),
      );

    if (mappingsError) {
      return jsonResponse({ error: mappingsError.message }, 500);
    }

    return jsonResponse({
      profile,
      mappings_count: mappings.length,
      message: `Import profile \"${profileName}\" saved.`,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
