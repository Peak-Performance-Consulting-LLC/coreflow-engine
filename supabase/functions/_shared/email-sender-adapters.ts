import type { EdgeClient } from './server.ts';
import { decryptSecret, encryptSecret } from './email-crypto.ts';
import type { WorkspaceEmailSenderRow } from './email-automation.ts';

interface SendEmailParams {
  db: EdgeClient;
  sender: WorkspaceEmailSenderRow;
  toEmail: string;
  subject: string;
  bodyText: string;
  fromName?: string | null;
  fromEmail?: string | null;
}

interface SendEmailResult {
  providerMessageId: string;
  rawResponseMeta: Record<string, unknown>;
}

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const MICROSOFT_SCOPE = 'offline_access https://graph.microsoft.com/Mail.Send';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function base64UrlEncode(value: Uint8Array) {
  const base64 = btoa(String.fromCharCode(...value));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildRfc822Message(params: {
  fromName: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  bodyText: string;
}) {
  const fromLabel = params.fromName ? `${params.fromName} <${params.fromEmail}>` : params.fromEmail;
  const lines = [
    `From: ${fromLabel}`,
    `To: ${params.toEmail}`,
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    params.bodyText,
  ];

  return lines.join('\r\n');
}

async function refreshGoogleAccessToken(db: EdgeClient, sender: WorkspaceEmailSenderRow) {
  const refreshToken = await decryptSecret(sender.oauth_refresh_token_encrypted);

  if (!refreshToken) {
    throw new Error('Google sender has no refresh token. Reconnect the account.');
  }

  const clientId = normalizeString(Deno.env.get('GOOGLE_OAUTH_CLIENT_ID'));
  const clientSecret = normalizeString(Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET'));

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required.');
  }

  const payload = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload,
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Unable to refresh Google token: ${JSON.stringify(body)}`);
  }

  const accessToken = normalizeString((body as { access_token?: string }).access_token);
  const expiresIn = Number((body as { expires_in?: unknown }).expires_in ?? 0);

  if (!accessToken) {
    throw new Error('Google token refresh returned an invalid access token.');
  }

  const expiresAt = expiresIn > 0
    ? new Date(Date.now() + Math.max(60, expiresIn - 60) * 1000).toISOString()
    : null;

  const encryptedAccessToken = await encryptSecret(accessToken);

  const { error } = await db
    .from('workspace_email_senders')
    .update({
      oauth_access_token_encrypted: encryptedAccessToken,
      oauth_token_expires_at: expiresAt,
      oauth_scope: normalizeString((body as { scope?: string }).scope) || sender.oauth_scope || GOOGLE_SCOPE,
      updated_at: new Date().toISOString(),
      status: 'connected',
      health_status: 'healthy',
      last_health_error: null,
    })
    .eq('id', sender.id)
    .eq('workspace_id', sender.workspace_id);

  if (error) {
    throw new Error(error.message);
  }

  return accessToken;
}

async function refreshMicrosoftAccessToken(db: EdgeClient, sender: WorkspaceEmailSenderRow) {
  const refreshToken = await decryptSecret(sender.oauth_refresh_token_encrypted);

  if (!refreshToken) {
    throw new Error('Microsoft sender has no refresh token. Reconnect the account.');
  }

  const clientId = normalizeString(Deno.env.get('MICROSOFT_OAUTH_CLIENT_ID'));
  const clientSecret = normalizeString(Deno.env.get('MICROSOFT_OAUTH_CLIENT_SECRET'));

  if (!clientId || !clientSecret) {
    throw new Error('MICROSOFT_OAUTH_CLIENT_ID and MICROSOFT_OAUTH_CLIENT_SECRET are required.');
  }

  const payload = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: MICROSOFT_SCOPE,
  });

  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload,
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Unable to refresh Microsoft token: ${JSON.stringify(body)}`);
  }

  const accessToken = normalizeString((body as { access_token?: string }).access_token);
  const expiresIn = Number((body as { expires_in?: unknown }).expires_in ?? 0);
  const refreshedRefreshToken = normalizeString((body as { refresh_token?: string }).refresh_token) || refreshToken;

  if (!accessToken) {
    throw new Error('Microsoft token refresh returned an invalid access token.');
  }

  const expiresAt = expiresIn > 0
    ? new Date(Date.now() + Math.max(60, expiresIn - 60) * 1000).toISOString()
    : null;

  const encryptedAccessToken = await encryptSecret(accessToken);
  const encryptedRefreshToken = await encryptSecret(refreshedRefreshToken);

  const { error } = await db
    .from('workspace_email_senders')
    .update({
      oauth_access_token_encrypted: encryptedAccessToken,
      oauth_refresh_token_encrypted: encryptedRefreshToken,
      oauth_token_expires_at: expiresAt,
      oauth_scope: normalizeString((body as { scope?: string }).scope) || sender.oauth_scope || MICROSOFT_SCOPE,
      updated_at: new Date().toISOString(),
      status: 'connected',
      health_status: 'healthy',
      last_health_error: null,
    })
    .eq('id', sender.id)
    .eq('workspace_id', sender.workspace_id);

  if (error) {
    throw new Error(error.message);
  }

  return accessToken;
}

async function resolveOAuthAccessToken(db: EdgeClient, sender: WorkspaceEmailSenderRow) {
  const accessToken = await decryptSecret(sender.oauth_access_token_encrypted);
  const expiresAt = sender.oauth_token_expires_at ? Date.parse(sender.oauth_token_expires_at) : Number.NaN;
  const isExpired = Number.isFinite(expiresAt) ? expiresAt <= Date.now() + 60_000 : !accessToken;

  if (!isExpired && accessToken) {
    return accessToken;
  }

  if (sender.provider === 'google') {
    return refreshGoogleAccessToken(db, sender);
  }

  if (sender.provider === 'microsoft') {
    return refreshMicrosoftAccessToken(db, sender);
  }

  throw new Error(`Unsupported OAuth sender provider: ${sender.provider}`);
}

async function markSenderHealth(
  db: EdgeClient,
  sender: WorkspaceEmailSenderRow,
  status: 'healthy' | 'degraded' | 'failed',
  errorText: string | null,
) {
  const { error } = await db
    .from('workspace_email_senders')
    .update({
      health_status: status,
      last_health_error: errorText,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(status === 'failed' ? { status: 'failed' } : {}),
    })
    .eq('id', sender.id)
    .eq('workspace_id', sender.workspace_id);

  if (error) {
    throw new Error(error.message);
  }
}

async function sendGoogleEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const accessToken = await resolveOAuthAccessToken(params.db, params.sender);
  const fromName = normalizeString(params.fromName) || normalizeString(params.sender.sender_name) || 'CoreFlow Team';
  const fromEmail = normalizeString(params.fromEmail) || params.sender.sender_email;

  const raw = base64UrlEncode(
    new TextEncoder().encode(
      buildRfc822Message({
        fromName,
        fromEmail,
        toEmail: params.toEmail,
        subject: params.subject,
        bodyText: params.bodyText,
      }),
    ),
  );

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Gmail send failed: ${JSON.stringify(body)}`);
  }

  const messageId = normalizeString((body as { id?: string }).id) || crypto.randomUUID();

  return {
    providerMessageId: messageId,
    rawResponseMeta: body as Record<string, unknown>,
  };
}

async function sendMicrosoftEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const accessToken = await resolveOAuthAccessToken(params.db, params.sender);
  const fromName = normalizeString(params.fromName) || normalizeString(params.sender.sender_name) || 'CoreFlow Team';

  const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject: params.subject,
        body: {
          contentType: 'Text',
          content: params.bodyText,
        },
        toRecipients: [
          {
            emailAddress: {
              address: params.toEmail,
            },
          },
        ],
        from: {
          emailAddress: {
            address: params.sender.sender_email,
            name: fromName,
          },
        },
      },
      saveToSentItems: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Microsoft Graph send failed: ${body}`);
  }

  return {
    providerMessageId: response.headers.get('x-ms-request-id') ?? crypto.randomUUID(),
    rawResponseMeta: {
      status: response.status,
      request_id: response.headers.get('x-ms-request-id'),
      date: response.headers.get('date'),
    },
  };
}

async function sendSmtpEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const host = normalizeString(params.sender.smtp_host);
  const port = Number(params.sender.smtp_port ?? 0);
  const username = normalizeString(params.sender.smtp_username);
  const password = await decryptSecret(params.sender.smtp_password_encrypted);

  if (!host || !port || !username || !password) {
    throw new Error('SMTP sender credentials are incomplete.');
  }

  const fromName = normalizeString(params.fromName) || normalizeString(params.sender.sender_name) || 'CoreFlow Team';
  const fromEmail = normalizeString(params.fromEmail) || params.sender.sender_email;
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  const { SmtpClient } = await import('https://deno.land/x/smtp@v0.7.0/mod.ts');
  const client = new SmtpClient();

  try {
    if (params.sender.smtp_use_tls) {
      await client.connectTLS({
        hostname: host,
        port,
        username,
        password,
      });
    } else {
      await client.connect({
        hostname: host,
        port,
        username,
        password,
      });
    }

    await client.send({
      from,
      to: params.toEmail,
      subject: params.subject,
      content: params.bodyText,
    });
  } finally {
    await client.close();
  }

  return {
    providerMessageId: crypto.randomUUID(),
    rawResponseMeta: {
      host,
      port,
      tls: params.sender.smtp_use_tls,
      provider: 'smtp',
    },
  };
}

export async function sendEmailWithSender(params: SendEmailParams): Promise<SendEmailResult> {
  if (!params.sender.is_active) {
    throw new Error('Sender is inactive.');
  }

  if (params.sender.status !== 'connected') {
    throw new Error(`Sender is not connected (status: ${params.sender.status}).`);
  }

  try {
    const result = params.sender.provider === 'google'
      ? await sendGoogleEmail(params)
      : params.sender.provider === 'microsoft'
        ? await sendMicrosoftEmail(params)
        : await sendSmtpEmail(params);

    await markSenderHealth(params.db, params.sender, 'healthy', null);

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send email.';
    await markSenderHealth(params.db, params.sender, 'failed', message);
    throw error;
  }
}
