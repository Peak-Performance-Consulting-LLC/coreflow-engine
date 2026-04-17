import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { seedWorkspaceCrmConfig } from '../_shared/seed-workspace-crm.ts';
import { authenticateRequest } from '../_shared/server.ts';

type CRMType =
  | 'real-estate'
  | 'gas-station'
  | 'convenience-store'
  | 'restaurant'
  | 'auto-repair';

interface CompleteSignupPayload {
  full_name: string;
  workspace_name: string;
  workspace_slug: string;
  crm_type: CRMType;
}

const allowedCrmTypes: CRMType[] = [
  'real-estate',
  'gas-station',
  'convenience-store',
  'restaurant',
  'auto-repair',
];

function normalizeWorkspace(row: { id: string; name: string; slug: string; crm_type: CRMType; owner_id: string }, role = 'owner') {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    crmType: row.crm_type,
    ownerId: row.owner_id,
    role,
  };
}

function validatePayload(payload: CompleteSignupPayload) {
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  if (!payload.full_name?.trim() || payload.full_name.trim().length < 2) {
    return 'Full name must be at least 2 characters.';
  }

  if (!payload.workspace_name?.trim() || payload.workspace_name.trim().length < 2) {
    return 'Workspace name must be at least 2 characters.';
  }

  if (!payload.workspace_slug?.trim() || !slugPattern.test(payload.workspace_slug.trim())) {
    return 'Workspace slug must contain lowercase letters, numbers, and hyphens only.';
  }

  if (!allowedCrmTypes.includes(payload.crm_type)) {
    return 'Selected CRM type is invalid.';
  }

  return null;
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

    const { serviceClient, user } = authContext;

    const payload = (await request.json()) as CompleteSignupPayload;
    const validationError = validatePayload(payload);

    if (validationError) {
      return jsonResponse({ error: validationError }, 400);
    }

    const normalizedSlug = payload.workspace_slug.trim().toLowerCase();

    const { data: existingWorkspace, error: existingWorkspaceError } = await serviceClient
      .from('workspaces')
      .select('id, name, slug, crm_type, owner_id')
      .eq('owner_id', user.id)
      .limit(1)
      .maybeSingle();

    if (existingWorkspaceError) {
      return jsonResponse({ error: existingWorkspaceError.message }, 500);
    }

    if (existingWorkspace) {
      const { error: membershipError } = await serviceClient.from('workspace_members').upsert(
        {
          workspace_id: existingWorkspace.id,
          user_id: user.id,
          role: 'owner',
        },
        { onConflict: 'workspace_id,user_id' },
      );

      if (membershipError) {
        return jsonResponse({ error: membershipError.message }, 500);
      }

      await seedWorkspaceCrmConfig(serviceClient, {
        workspaceId: existingWorkspace.id,
        crmType: existingWorkspace.crm_type,
      });

      return jsonResponse({ workspace: normalizeWorkspace(existingWorkspace) });
    }

    const { data: slugWorkspace, error: slugWorkspaceError } = await serviceClient
      .from('workspaces')
      .select('id, owner_id')
      .eq('slug', normalizedSlug)
      .maybeSingle();

    if (slugWorkspaceError) {
      return jsonResponse({ error: slugWorkspaceError.message }, 500);
    }

    if (slugWorkspace) {
      return jsonResponse({ error: 'Workspace slug is already in use.' }, 409);
    }

    const { error: profileError } = await serviceClient.from('profiles').upsert({
      id: user.id,
      full_name: payload.full_name.trim(),
    });

    if (profileError) {
      return jsonResponse({ error: profileError.message }, 500);
    }

    const { data: workspace, error: workspaceError } = await serviceClient
      .from('workspaces')
      .insert({
        name: payload.workspace_name.trim(),
        slug: normalizedSlug,
        crm_type: payload.crm_type,
        owner_id: user.id,
      })
      .select('id, name, slug, crm_type, owner_id')
      .single();

    if (workspaceError) {
      const status = workspaceError.code === '23505' ? 409 : 500;
      return jsonResponse(
        { error: workspaceError.code === '23505' ? 'Workspace slug is already in use.' : workspaceError.message },
        status,
      );
    }

    const { error: membershipError } = await serviceClient.from('workspace_members').insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: 'owner',
    });

    if (membershipError) {
      return jsonResponse({ error: membershipError.message }, 500);
    }

    await seedWorkspaceCrmConfig(serviceClient, {
      workspaceId: workspace.id,
      crmType: workspace.crm_type,
    });

    return jsonResponse({ workspace: normalizeWorkspace(workspace) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 500);
  }
});
