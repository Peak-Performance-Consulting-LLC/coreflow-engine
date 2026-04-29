import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceRole } from '../_shared/server.ts';

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
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

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceRole(authContext.serviceClient, workspaceId, authContext.user.id, ['owner']);

    const { data, error } = await authContext.serviceClient
      .from('custom_field_definitions')
      .select(
        'id, field_key, label, field_type, is_required, is_active, is_system, options, placeholder, help_text, validation_rules, default_value, position',
      )
      .eq('workspace_id', workspaceId)
      .eq('entity_type', 'record')
      .order('position', { ascending: true });

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({
      fields: data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
