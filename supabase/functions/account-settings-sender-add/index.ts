import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { encryptSecret } from '../_shared/email-crypto.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';

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

async function testSmtpConnectivity(host: string, port: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const conn = await Deno.connect({ hostname: host, port, transport: 'tcp' });
    conn.close();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Connection failed.' };
  }
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
        .in('role', ['owner', 'admin'])
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (memberError) return jsonResponse({ error: memberError.message }, 500);
      if (!memberRow) return jsonResponse({ error: 'Only workspace owners or admins can add email senders.' }, 403);
      resolvedWorkspaceId = memberRow.workspace_id;
    } else {
      const membership = await ensureWorkspaceMembership(authContext.serviceClient, resolvedWorkspaceId, authContext.user.id);
      if (membership.role !== 'owner' && membership.role !== 'admin') {
        return jsonResponse({ error: 'Only workspace owners or admins can add email senders.' }, 403);
      }
    }

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

      if (!smtpHost) return jsonResponse({ error: 'smtp_host is required for SMTP providers.' }, 400);
      if (!smtpUsername) return jsonResponse({ error: 'smtp_username is required.' }, 400);
      if (!smtpPassword) return jsonResponse({ error: 'smtp_password is required.' }, 400);

      const smtpPort = Number(body.smtp_port ?? 587);

      // Test connectivity
      const connectivity = await testSmtpConnectivity(smtpHost, smtpPort);
      if (!connectivity.ok) {
        return jsonResponse(
          { error: `Cannot reach ${smtpHost}:${smtpPort}. Check your SMTP host and port. (${connectivity.error})` },
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
            smtp_use_tls: body.smtp_use_tls ?? true,
            status: 'connected',
            health_status: 'healthy',
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
