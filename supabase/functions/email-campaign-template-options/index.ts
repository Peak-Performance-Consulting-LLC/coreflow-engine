import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';

interface RequestBody {
  workspace_id?: string;
  category_id?: string;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const authContext = await authenticateRequest(request);

    if (authContext instanceof Response) {
      return authContext;
    }

    const payload = (await request.json()) as RequestBody;
    const workspaceId = normalizeString(payload.workspace_id);
    const categoryId = normalizeString(payload.category_id);

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    let query = authContext.serviceClient
      .from('email_templates')
      .select(`
        id,
        name,
        description,
        category_id,
        use_case,
        template_type,
        thumbnail_url,
        subject_template,
        preview_meta,
        email_template_categories(name, slug, icon, color)
      `)
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .is('archived_at', null)
      .order('updated_at', { ascending: false });

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return jsonResponse({
      templates: data ?? [],
      count: (data ?? []).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
