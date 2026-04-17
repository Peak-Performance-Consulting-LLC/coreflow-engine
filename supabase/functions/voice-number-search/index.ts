import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceOwner } from '../_shared/server.ts';
import { searchAvailablePhoneNumbers } from '../_shared/telnyx-numbers.ts';

function normalizePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(parsed));
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
    const workspaceId = typeof payload.workspace_id === 'string' ? payload.workspace_id : '';

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);

    const results = await searchAvailablePhoneNumbers({
      countryCode: typeof payload.country_code === 'string' ? payload.country_code : 'US',
      locality: typeof payload.locality === 'string' ? payload.locality : null,
      administrativeArea: typeof payload.administrative_area === 'string' ? payload.administrative_area : null,
      npa: typeof payload.npa === 'string' ? payload.npa : null,
      phoneNumberType: typeof payload.phone_number_type === 'string' ? payload.phone_number_type : null,
      limit: normalizePositiveInteger(payload.limit, 10),
    });

    return jsonResponse({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
