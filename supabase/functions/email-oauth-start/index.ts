import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceOwner } from '../_shared/server.ts';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

function randomBase64Url(length = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return toBase64Url(bytes);
}

function resolveCallbackUrl() {
  const explicitCallback = normalizeString(Deno.env.get('EMAIL_OAUTH_CALLBACK_URL'));
  if (explicitCallback) {
    return explicitCallback;
  }

  const supabaseUrl = normalizeString(Deno.env.get('SUPABASE_URL'));
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required to resolve OAuth callback URL.');
  }

  return `${supabaseUrl}/functions/v1/email-oauth-callback`;
}

function normalizeReturnPath(value: unknown) {
  const candidate = normalizeString(value);

  if (!candidate) {
    return '/account';
  }

  if (!candidate.startsWith('/')) {
    return '/account';
  }

  return candidate;
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

    const payload = (await request.json()) as Record<string, unknown>;
    const workspaceId = normalizeString(payload.workspace_id);
    const provider = normalizeString(payload.provider) as 'google' | 'microsoft' | '';
    const returnPath = normalizeReturnPath(payload.return_path);

    if (!workspaceId || !provider) {
      return jsonResponse({ error: 'workspace_id and provider are required.' }, 400);
    }

    if (provider !== 'google' && provider !== 'microsoft') {
      return jsonResponse({ error: 'provider must be google or microsoft.' }, 400);
    }

    await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);

    const callbackUrl = resolveCallbackUrl();
    const codeVerifier = randomBase64Url(64);
    const codeChallenge = toBase64Url(await sha256(codeVerifier));
    const state = randomBase64Url(32);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error: insertError } = await authContext.serviceClient.from('email_oauth_sessions').insert({
      workspace_id: workspaceId,
      user_id: authContext.user.id,
      provider,
      state,
      code_verifier: codeVerifier,
      code_challenge: codeChallenge,
      return_path: returnPath,
      redirect_uri: callbackUrl,
      status: 'pending',
      expires_at: expiresAt,
    });

    if (insertError) {
      return jsonResponse({ error: insertError.message }, 400);
    }

    let authorizeUrl = '';

    if (provider === 'google') {
      const clientId = normalizeString(Deno.env.get('GOOGLE_OAUTH_CLIENT_ID'));

      if (!clientId) {
        return jsonResponse({ error: 'GOOGLE_OAUTH_CLIENT_ID is required.' }, 500);
      }

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callbackUrl,
        response_type: 'code',
        scope: 'openid email profile https://www.googleapis.com/auth/gmail.send',
        access_type: 'offline',
        prompt: 'consent',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    } else {
      const clientId = normalizeString(Deno.env.get('MICROSOFT_OAUTH_CLIENT_ID'));

      if (!clientId) {
        return jsonResponse({ error: 'MICROSOFT_OAUTH_CLIENT_ID is required.' }, 500);
      }

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callbackUrl,
        response_type: 'code',
        response_mode: 'query',
        scope: 'openid email profile offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      authorizeUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
    }

    return jsonResponse({
      authorize_url: authorizeUrl,
      state,
      expires_at: expiresAt,
      provider,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
