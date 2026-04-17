import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

type CRMType =
  | 'real-estate'
  | 'gas-station'
  | 'convenience-store'
  | 'restaurant'
  | 'auto-repair';

function normalizeWorkspace(
  row: { id: string; name: string; slug: string; crm_type: CRMType; owner_id: string },
  role: string,
) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    crmType: row.crm_type,
    ownerId: row.owner_id,
    role,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authHeader = request.headers.get('Authorization') ?? '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing Supabase function environment variables.' }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
      },
    });

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized.' }, 401);
    }

    const { data, error } = await serviceClient
      .from('workspace_members')
      .select('role, workspaces!inner(id, name, slug, crm_type, owner_id)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    if (!data) {
      return jsonResponse({ workspace: null });
    }

    const workspaceRow = Array.isArray(data.workspaces) ? data.workspaces[0] : data.workspaces;

    if (!workspaceRow) {
      return jsonResponse({ workspace: null });
    }

    return jsonResponse({
      workspace: normalizeWorkspace(workspaceRow, data.role),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 500);
  }
});
