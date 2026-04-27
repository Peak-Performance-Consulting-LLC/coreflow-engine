import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { encryptSecret } from '../_shared/email-crypto.ts';
import { authenticateRequest, ensureWorkspaceOwner } from '../_shared/server.ts';

const ALLOWED_PROVIDERS = ['google', 'microsoft', 'zoho', 'hostinger', 'godaddy', 'smtp'] as const;
type EmailProvider = (typeof ALLOWED_PROVIDERS)[number];

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

interface SenderAddBody {
  provider: EmailProvider;
  sender_email: string;
  sender_name?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_use_tls?: boolean;
  make_default?: boolean;
}

interface LegacyAsyncWriter {
  write(data: Uint8Array): Promise<number>;
}

interface LegacySyncWriter {
  writeSync(data: Uint8Array): number;
}

type SmtpConnectionMode = 'tls' | 'plain';
interface SmtpConnectionAttempt {
  mode: SmtpConnectionMode;
  port: number;
}

function ensureLegacyDenoWriteAllPolyfill() {
  const denoCompat = Deno as unknown as {
    writeAll?: (writer: LegacyAsyncWriter, data: Uint8Array) => Promise<void>;
    writeAllSync?: (writer: LegacySyncWriter, data: Uint8Array) => void;
  };

  if (typeof denoCompat.writeAll !== 'function') {
    denoCompat.writeAll = async (writer: LegacyAsyncWriter, data: Uint8Array) => {
      let offset = 0;
      while (offset < data.length) {
        const written = await writer.write(data.subarray(offset));
        if (!Number.isFinite(written) || written <= 0) {
          throw new Error('Legacy writeAll polyfill failed to make write progress.');
        }
        offset += written;
      }
    };
  }

  if (typeof denoCompat.writeAllSync !== 'function') {
    denoCompat.writeAllSync = (writer: LegacySyncWriter, data: Uint8Array) => {
      let offset = 0;
      while (offset < data.length) {
        const written = writer.writeSync(data.subarray(offset));
        if (!Number.isFinite(written) || written <= 0) {
          throw new Error('Legacy writeAllSync polyfill failed to make write progress.');
        }
        offset += written;
      }
    };
  }
}

function resolveSmtpConnectionAttempts(port: number, useTls: boolean): SmtpConnectionAttempt[] {
  const attempts: SmtpConnectionAttempt[] = [];
  const normalizedPort = Number.isFinite(port) && port > 0 ? port : 587;

  if (useTls) {
    attempts.push({ mode: 'tls', port: normalizedPort });
    if (normalizedPort === 587) {
      attempts.push({ mode: 'plain', port: 587 });
      attempts.push({ mode: 'tls', port: 465 });
    }
  } else {
    attempts.push({ mode: 'plain', port: normalizedPort });
    if (normalizedPort === 587) {
      attempts.push({ mode: 'tls', port: 465 });
    }
  }

  return attempts;
}

async function testSmtpAuthentication(params: {
  host: string;
  port: number;
  username: string;
  password: string;
  useTls: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  ensureLegacyDenoWriteAllPolyfill();

  const { SmtpClient } = await import('https://deno.land/x/smtp@v0.7.0/mod.ts');
  const attempts = resolveSmtpConnectionAttempts(params.port, params.useTls);
  let lastError = 'SMTP authentication failed.';

  for (const attempt of attempts) {
    const client = new SmtpClient();
    try {
      if (attempt.mode === 'tls') {
        await client.connectTLS({
          hostname: params.host,
          port: attempt.port,
          username: params.username,
          password: params.password,
        });
      } else {
        await client.connect({
          hostname: params.host,
          port: attempt.port,
          username: params.username,
          password: params.password,
        });
      }

      await client.close();
      return { ok: true };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'SMTP authentication failed.';
      try {
        await client.close();
      } catch {
        // no-op
      }
    }
  }

  return { ok: false, error: lastError };
}

function buildSmtpAuthFailureMessage(params: {
  provider: EmailProvider;
  host: string;
  port: number;
  senderEmail: string;
  smtpUsername: string;
  smtpError: string;
}) {
  const hints: string[] = [];

  if (params.provider === 'zoho') {
    hints.push(
      'Use your Zoho app password.',
      'Choose the correct Zoho SMTP host for your region: US smtp.zoho.com, India smtp.zoho.in, Europe smtp.zoho.eu, Australia smtp.zoho.com.au.',
      'Use port 465 (TLS, recommended) or 587 (STARTTLS).',
    );

    if (params.senderEmail.toLowerCase() !== params.smtpUsername.toLowerCase()) {
      hints.push('sender_email should match the authenticated mailbox or a verified Zoho alias.');
    }
  }

  const hintText = hints.length > 0 ? ` ${hints.join(' ')}` : '';
  return `Unable to authenticate with ${params.host}:${params.port}. ${params.smtpError}.${hintText}`;
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

    // Auto-resolve workspace if not provided
    let resolvedWorkspaceId = workspaceId;
    if (!resolvedWorkspaceId) {
      const { data: memberRow, error: memberError } = await authContext.serviceClient
        .from('workspace_members')
        .select('workspace_id, role')
        .eq('user_id', authContext.user.id)
        .eq('role', 'owner')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (memberError) return jsonResponse({ error: memberError.message }, 500);
      if (!memberRow) return jsonResponse({ error: 'No workspace found for this user.' }, 404);
      resolvedWorkspaceId = memberRow.workspace_id;
    }

    await ensureWorkspaceOwner(authContext.serviceClient, resolvedWorkspaceId, authContext.user.id);

    const body = payload as SenderAddBody;
    const provider = normalizeString(body.provider) as EmailProvider;

    if (!provider || !ALLOWED_PROVIDERS.includes(provider)) {
      return jsonResponse({ error: `Invalid provider. Must be one of: ${ALLOWED_PROVIDERS.join(', ')}.` }, 400);
    }

    const senderEmail = normalizeString(body.sender_email).toLowerCase();
    if (!senderEmail) return jsonResponse({ error: 'sender_email is required.' }, 400);

    // SMTP-specific validation
    const isSmtp = !['google', 'microsoft'].includes(provider);
    if (isSmtp) {
      const smtpHost = normalizeString(body.smtp_host);
      const smtpUsername = normalizeString(body.smtp_username);
      const smtpPassword = normalizeString(body.smtp_password);
      const smtpUseTls = typeof body.smtp_use_tls === 'boolean' ? body.smtp_use_tls : true;

      if (!smtpHost) return jsonResponse({ error: 'smtp_host is required for SMTP providers.' }, 400);
      if (!smtpUsername) return jsonResponse({ error: 'smtp_username is required.' }, 400);
      if (!smtpPassword) return jsonResponse({ error: 'smtp_password is required.' }, 400);

      const smtpPort = Number(body.smtp_port ?? 587);
      if (!Number.isFinite(smtpPort) || smtpPort <= 0) {
        return jsonResponse({ error: 'smtp_port must be a valid positive number.' }, 400);
      }

      const authResult = await testSmtpAuthentication({
        host: smtpHost,
        port: smtpPort,
        username: smtpUsername,
        password: smtpPassword,
        useTls: smtpUseTls,
      });
      if (!authResult.ok) {
        return jsonResponse(
          {
            error: buildSmtpAuthFailureMessage({
              provider,
              host: smtpHost,
              port: smtpPort,
              senderEmail,
              smtpUsername,
              smtpError: authResult.error,
            }),
          },
          422,
        );
      }

      // Encrypt password using AES-GCM (email-crypto.ts)
      const encryptedPassword = await encryptSecret(smtpPassword);

      // If make_default — clear existing defaults
      if (body.make_default) {
        await authContext.serviceClient
          .from('workspace_email_senders')
          .update({ is_default: false, updated_at: new Date().toISOString() })
          .eq('workspace_id', resolvedWorkspaceId)
          .eq('is_default', true);
      }

      const { data: sender, error: senderError } = await authContext.serviceClient
        .from('workspace_email_senders')
        .upsert(
          {
            workspace_id: resolvedWorkspaceId,
            provider,
            sender_email: senderEmail,
            sender_name: normalizeString(body.sender_name) || null,
            smtp_host: smtpHost,
            smtp_port: smtpPort,
            smtp_username: smtpUsername,
            smtp_password_encrypted: encryptedPassword,
            smtp_use_tls: smtpUseTls,
            status: 'connected',
            health_status: 'healthy',
            last_health_error: null,
            is_default: body.make_default ?? false,
            is_active: true,
            connected_at: new Date().toISOString(),
            created_by: authContext.user.id,
            updated_by: authContext.user.id,
          },
          { onConflict: 'workspace_id,provider,sender_email' },
        )
        .select('id, provider, sender_email, sender_name, status, is_default, is_active, health_status, connected_at')
        .single();

      if (senderError) return jsonResponse({ error: senderError.message }, 500);

      return jsonResponse({ sender });
    }

    // OAuth providers (google / microsoft) — return a message indicating OAuth flow required
    return jsonResponse(
      { error: `Use the email-oauth-start function to connect ${provider} via OAuth.` },
      422,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
