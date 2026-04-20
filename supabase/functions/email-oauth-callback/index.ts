import { createEdgeClients } from '../_shared/server.ts';
import { encryptSecret } from '../_shared/email-crypto.ts';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toSafeRedirectUrl(baseUrl: string, returnPath: string, params: Record<string, string>) {
  const resolvedBase = normalizeString(baseUrl);
  const safeBase = resolvedBase || 'http://localhost:5173';
  const normalizedPath = returnPath.startsWith('/') ? returnPath : '/account';
  const url = new URL(normalizedPath, safeBase);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function redirect(url: string) {
  return Response.redirect(url, 302);
}

async function exchangeGoogleCode(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const clientId = normalizeString(Deno.env.get('GOOGLE_OAUTH_CLIENT_ID'));
  const clientSecret = normalizeString(Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET'));

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required.');
  }

  const body = new URLSearchParams({
    code: params.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: params.codeVerifier,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${JSON.stringify(payload)}`);
  }

  return payload as Record<string, unknown>;
}

async function exchangeMicrosoftCode(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const clientId = normalizeString(Deno.env.get('MICROSOFT_OAUTH_CLIENT_ID'));
  const clientSecret = normalizeString(Deno.env.get('MICROSOFT_OAUTH_CLIENT_SECRET'));

  if (!clientId || !clientSecret) {
    throw new Error('MICROSOFT_OAUTH_CLIENT_ID and MICROSOFT_OAUTH_CLIENT_SECRET are required.');
  }

  const body = new URLSearchParams({
    code: params.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: params.codeVerifier,
    scope: 'openid email profile offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send',
  });

  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Microsoft token exchange failed: ${JSON.stringify(payload)}`);
  }

  return payload as Record<string, unknown>;
}

async function fetchGoogleSenderIdentity(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Google user info request failed: ${JSON.stringify(payload)}`);
  }

  const email = normalizeString((payload as { email?: string }).email).toLowerCase();
  const name = normalizeString((payload as { name?: string }).name) || null;

  if (!email) {
    throw new Error('Google account did not return a sender email address.');
  }

  return {
    email,
    name,
  };
}

async function fetchMicrosoftSenderIdentity(accessToken: string) {
  const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Microsoft profile request failed: ${JSON.stringify(payload)}`);
  }

  const mail = normalizeString((payload as { mail?: string }).mail).toLowerCase();
  const upn = normalizeString((payload as { userPrincipalName?: string }).userPrincipalName).toLowerCase();
  const email = mail || upn;

  if (!email) {
    throw new Error('Microsoft account did not return a sender email address.');
  }

  return {
    email,
    name: normalizeString((payload as { displayName?: string }).displayName) || null,
  };
}

Deno.serve(async (request) => {
  const appUrl = normalizeString(Deno.env.get('APP_URL')) || normalizeString(Deno.env.get('FRONTEND_URL')) || 'http://localhost:5173';

  try {
    const url = new URL(request.url);
    const code = normalizeString(url.searchParams.get('code'));
    const state = normalizeString(url.searchParams.get('state'));
    const providerError = normalizeString(url.searchParams.get('error'));
    const providerErrorDescription = normalizeString(url.searchParams.get('error_description'));

    if (!state) {
      return redirect(
        toSafeRedirectUrl(appUrl, '/account', {
          oauth_status: 'error',
          oauth_message: 'missing_state',
        }),
      );
    }

    const clients = createEdgeClients(request);

    if ('errorResponse' in clients) {
      return clients.errorResponse;
    }

    const { serviceClient } = clients;

    const { data: oauthSession, error: sessionError } = await serviceClient
      .from('email_oauth_sessions')
      .select('id, workspace_id, user_id, provider, state, code_verifier, return_path, redirect_uri, status, expires_at')
      .eq('state', state)
      .maybeSingle();

    if (sessionError || !oauthSession) {
      return redirect(
        toSafeRedirectUrl(appUrl, '/account', {
          oauth_status: 'error',
          oauth_message: 'invalid_or_expired_session',
        }),
      );
    }

    const returnPath = normalizeString(oauthSession.return_path) || '/account';

    async function failSession(reason: string) {
      await serviceClient
        .from('email_oauth_sessions')
        .update({
          status: 'failed',
          consumed_at: new Date().toISOString(),
          error_text: reason,
        })
        .eq('id', oauthSession.id);
    }

    if (oauthSession.status !== 'pending') {
      return redirect(
        toSafeRedirectUrl(appUrl, returnPath, {
          oauth_status: 'error',
          oauth_provider: oauthSession.provider,
          oauth_message: 'session_already_used',
        }),
      );
    }

    if (Date.parse(oauthSession.expires_at) <= Date.now()) {
      await failSession('OAuth session expired.');
      return redirect(
        toSafeRedirectUrl(appUrl, returnPath, {
          oauth_status: 'error',
          oauth_provider: oauthSession.provider,
          oauth_message: 'session_expired',
        }),
      );
    }

    if (providerError) {
      const reason = providerErrorDescription || providerError;
      await failSession(reason);
      return redirect(
        toSafeRedirectUrl(appUrl, returnPath, {
          oauth_status: 'error',
          oauth_provider: oauthSession.provider,
          oauth_message: reason,
        }),
      );
    }

    if (!code) {
      await failSession('Missing authorization code.');
      return redirect(
        toSafeRedirectUrl(appUrl, returnPath, {
          oauth_status: 'error',
          oauth_provider: oauthSession.provider,
          oauth_message: 'missing_authorization_code',
        }),
      );
    }

    const tokenPayload = oauthSession.provider === 'google'
      ? await exchangeGoogleCode({
          code,
          redirectUri: oauthSession.redirect_uri,
          codeVerifier: oauthSession.code_verifier,
        })
      : await exchangeMicrosoftCode({
          code,
          redirectUri: oauthSession.redirect_uri,
          codeVerifier: oauthSession.code_verifier,
        });

    const accessToken = normalizeString(tokenPayload.access_token);
    const refreshToken = normalizeString(tokenPayload.refresh_token);
    const scope = normalizeString(tokenPayload.scope);
    const expiresInSeconds = Number(tokenPayload.expires_in ?? 0);

    if (!accessToken) {
      await failSession('Provider did not return access_token.');
      return redirect(
        toSafeRedirectUrl(appUrl, returnPath, {
          oauth_status: 'error',
          oauth_provider: oauthSession.provider,
          oauth_message: 'provider_token_exchange_failed',
        }),
      );
    }

    const identity = oauthSession.provider === 'google'
      ? await fetchGoogleSenderIdentity(accessToken)
      : await fetchMicrosoftSenderIdentity(accessToken);

    const encryptedAccessToken = await encryptSecret(accessToken);
    const encryptedRefreshToken = await encryptSecret(refreshToken || null);
    const expiresAt = expiresInSeconds > 0 ? new Date(Date.now() + Math.max(60, expiresInSeconds - 60) * 1000).toISOString() : null;

    const { data: existingSender } = await serviceClient
      .from('workspace_email_senders')
      .select('id, is_default')
      .eq('workspace_id', oauthSession.workspace_id)
      .eq('provider', oauthSession.provider)
      .eq('sender_email', identity.email)
      .maybeSingle();

    const { data: currentDefaultSender } = await serviceClient
      .from('workspace_email_senders')
      .select('id')
      .eq('workspace_id', oauthSession.workspace_id)
      .eq('is_default', true)
      .eq('is_active', true)
      .maybeSingle();

    const shouldDefault = existingSender ? existingSender.is_default : !currentDefaultSender;

    const { data: upsertedSender, error: senderError } = await serviceClient
      .from('workspace_email_senders')
      .upsert(
        {
          workspace_id: oauthSession.workspace_id,
          provider: oauthSession.provider,
          sender_email: identity.email,
          sender_name: identity.name,
          status: 'connected',
          is_default: shouldDefault,
          is_active: true,
          oauth_access_token_encrypted: encryptedAccessToken,
          oauth_refresh_token_encrypted: encryptedRefreshToken,
          oauth_token_expires_at: expiresAt,
          oauth_scope: scope || null,
          health_status: 'healthy',
          last_health_error: null,
          connected_at: new Date().toISOString(),
          updated_by: oauthSession.user_id,
          created_by: oauthSession.user_id,
        },
        {
          onConflict: 'workspace_id,provider,sender_email',
        },
      )
      .select('id')
      .single();

    if (senderError || !upsertedSender) {
      await failSession(senderError?.message || 'Unable to save sender connection.');
      return redirect(
        toSafeRedirectUrl(appUrl, returnPath, {
          oauth_status: 'error',
          oauth_provider: oauthSession.provider,
          oauth_message: 'sender_save_failed',
        }),
      );
    }

    if (shouldDefault) {
      await serviceClient
        .from('workspace_email_senders')
        .update({ is_default: false })
        .eq('workspace_id', oauthSession.workspace_id)
        .neq('id', upsertedSender.id);
    }

    const { error: sessionUpdateError } = await serviceClient
      .from('email_oauth_sessions')
      .update({
        status: 'completed',
        consumed_at: new Date().toISOString(),
        error_text: null,
      })
      .eq('id', oauthSession.id);

    if (sessionUpdateError) {
      return redirect(
        toSafeRedirectUrl(appUrl, returnPath, {
          oauth_status: 'error',
          oauth_provider: oauthSession.provider,
          oauth_message: 'session_update_failed',
        }),
      );
    }

    return redirect(
      toSafeRedirectUrl(appUrl, returnPath, {
        oauth_status: 'success',
        oauth_provider: oauthSession.provider,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return redirect(
      toSafeRedirectUrl(appUrl, '/account', {
        oauth_status: 'error',
        oauth_message: message,
      }),
    );
  }
});
