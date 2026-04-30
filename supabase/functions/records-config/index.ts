import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getWorkspaceCrmConfig } from '../_shared/records.ts';
import { seedWorkspaceCrmConfig } from '../_shared/seed-workspace-crm.ts';
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
    const workspaceId = typeof payload.workspace_id === 'string' ? payload.workspace_id : '';

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);
    const { data: workspace, error: workspaceError } = await authContext.serviceClient
      .from('workspaces')
      .select('crm_type')
      .eq('id', workspaceId)
      .maybeSingle();

    if (workspaceError || !workspace) {
      return jsonResponse({ error: workspaceError?.message || 'Workspace not found.' }, 404);
    }

    const [pipelinesCountResult, sourcesCountResult, fieldsCountResult] = await Promise.all([
      authContext.serviceClient
        .from('pipelines')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('entity_type', 'record'),
      authContext.serviceClient
        .from('record_sources')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId),
      authContext.serviceClient
        .from('custom_field_definitions')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('entity_type', 'record'),
    ]);

    if (pipelinesCountResult.error) {
      return jsonResponse({ error: pipelinesCountResult.error.message }, 400);
    }

    if (sourcesCountResult.error) {
      return jsonResponse({ error: sourcesCountResult.error.message }, 400);
    }

    if (fieldsCountResult.error) {
      return jsonResponse({ error: fieldsCountResult.error.message }, 400);
    }

    const isCrmConfigEmpty =
      (pipelinesCountResult.count ?? 0) === 0 &&
      (sourcesCountResult.count ?? 0) === 0 &&
      (fieldsCountResult.count ?? 0) === 0;

    if (isCrmConfigEmpty) {
      await seedWorkspaceCrmConfig(authContext.serviceClient, {
        workspaceId,
        crmType: workspace.crm_type,
      });
    }

    const config = await getWorkspaceCrmConfig(authContext.serviceClient, workspaceId);
    return jsonResponse(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 500);
  }
});
