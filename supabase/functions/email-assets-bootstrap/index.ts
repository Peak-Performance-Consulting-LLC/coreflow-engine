import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';

function normalizeString(value: unknown) {
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
    const workspaceId = normalizeString(payload.workspace_id);

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    const { error: createError } = await authContext.serviceClient.storage.createBucket('email-assets', {
      public: true,
      fileSizeLimit: 50 * 1024 * 1024,
    });

    if (createError) {
      const lower = (createError.message || '').toLowerCase();
      const alreadyExists = lower.includes('already') && lower.includes('exists');
      if (!alreadyExists) {
        throw new Error(createError.message);
      }
    }

    return jsonResponse({ ok: true, bucket: 'email-assets' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to prepare upload storage.';
    return jsonResponse({ error: message }, 400);
  }
});
