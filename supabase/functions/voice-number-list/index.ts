import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { ensureWorkspaceOwner, authenticateRequest } from '../_shared/server.ts';
import { listWorkspacePhoneNumbers, toWorkspacePhoneNumberView } from '../_shared/voice-repository.ts';

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
    const includeInactive = Boolean(payload.include_inactive);

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);
    const numbers = await listWorkspacePhoneNumbers(authContext.serviceClient, {
      workspaceId,
      includeInactive,
    });

    return jsonResponse({ numbers: numbers.map(toWorkspacePhoneNumberView) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
