import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getConnectedDefaultSender } from '../_shared/email-automation.ts';
import { sendEmailWithSender } from '../_shared/email-sender-adapters.ts';
import { authenticateRequest, ensureWorkspaceOwner } from '../_shared/server.ts';
import type { EdgeClient } from '../_shared/server.ts';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value: unknown) {
  return normalizeString(value).toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeBoolean(value: unknown) {
  return value === true;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAppUrl(request: Request) {
  const origin = normalizeString(request.headers.get('origin'));
  const configuredUrl =
    normalizeString(Deno.env.get('APP_URL')) ||
    normalizeString(Deno.env.get('FRONTEND_URL'));
  const baseUrl = origin || configuredUrl || 'http://localhost:5173';

  return baseUrl.replace(/\/+$/, '');
}

function buildInviteRedirectUrl(request: Request) {
  return `${getAppUrl(request)}/invite/accept`;
}

function buildAuthVerifyUrl(params: { supabaseUrl: string; hashedToken: string; redirectTo: string }) {
  const supabaseUrl = params.supabaseUrl.replace(/\/+$/, '');
  return `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(params.hashedToken)}&type=invite&redirect_to=${encodeURIComponent(params.redirectTo)}`;
}

function buildInviteEmail(params: {
  workspaceName: string;
  inviterName: string;
  invitedEmail: string;
  inviteUrl: string;
}) {
  const workspaceName = normalizeString(params.workspaceName) || 'your workspace';
  const inviterName = normalizeString(params.inviterName) || 'A workspace owner';
  const invitedEmail = normalizeString(params.invitedEmail);
  const inviteUrl = normalizeString(params.inviteUrl);

  return {
    subject: `You're invited to join ${workspaceName} on CoreFlow`,
    bodyText:
      `${inviterName} invited you to join ${workspaceName} on CoreFlow as an agent.\n\n` +
      `Open this secure invite link to confirm your email and create your password:\n${inviteUrl}\n\n` +
      `This invite is reserved for ${invitedEmail}.\n\n` +
      'If you were not expecting this invite, you can ignore this email.',
    bodyHtml:
      `<div style="margin:0;padding:24px;background:#f4f7fb;font-family:Arial,sans-serif;color:#0f172a">` +
      `<div style="max-width:640px;margin:0 auto;overflow:hidden;border-radius:24px;background:#ffffff;box-shadow:0 24px 60px rgba(15,23,42,0.08)">` +
      `<div style="padding:40px 40px 28px;background:linear-gradient(135deg,#4338ca 0%,#6366f1 55%,#22c55e 130%);color:#ffffff">` +
      `<div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.82">CoreFlow Workspace Invite</div>` +
      `<h1 style="margin:14px 0 10px;font-size:32px;line-height:1.15;font-weight:700">You're invited to join ${escapeHtml(workspaceName)}</h1>` +
      `<p style="margin:0;font-size:16px;line-height:1.7;opacity:0.94">${escapeHtml(inviterName)} added you as an agent. Confirm your email, create your password, and you'll be ready to sign in.</p>` +
      `</div>` +
      `<div style="padding:32px 40px 40px">` +
      `<div style="margin-bottom:22px;border:1px solid #e2e8f0;border-radius:18px;padding:18px 20px;background:#f8fafc">` +
      `<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;margin-bottom:8px">Invited email</div>` +
      `<div style="font-size:18px;font-weight:700;color:#0f172a">${escapeHtml(invitedEmail)}</div>` +
      `</div>` +
      `<div style="margin:0 0 26px;font-size:15px;line-height:1.7;color:#334155">Use the secure button below to accept the invite. After that, you'll set your password and continue into the workspace.</div>` +
      `<div style="margin:0 0 28px"><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:#4338ca;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700">Accept Invite</a></div>` +
      `<div style="margin:0 0 8px;font-size:13px;line-height:1.7;color:#64748b">If the button does not open, copy and paste this link into your browser:</div>` +
      `<div style="word-break:break-word;font-size:13px;line-height:1.7"><a href="${escapeHtml(inviteUrl)}" style="color:#4338ca;text-decoration:none">${escapeHtml(inviteUrl)}</a></div>` +
      `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.7;color:#94a3b8">If you were not expecting this invite, you can safely ignore this email.</div>` +
      `</div>` +
      `</div>` +
      `</div>`,
  };
}

async function buildCustomInviteLink(params: {
  request: Request;
  serviceClient: EdgeClient;
  invitedEmail: string;
  workspaceId: string;
  role: string;
}) {
  const supabaseUrl = normalizeString(Deno.env.get('SUPABASE_URL'));
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required to generate custom invite links.');
  }

  const redirectTo = buildInviteRedirectUrl(params.request);
  const { data, error } = await params.serviceClient.auth.admin.generateLink({
    type: 'invite',
    email: params.invitedEmail,
    options: {
      redirectTo,
      data: {
        invited_workspace_id: params.workspaceId,
        invited_role: params.role,
      },
    },
  });

  if (error) {
    throw new Error(error.message || 'Unable to generate the invite confirmation link.');
  }

  const hashedToken = normalizeString(data.properties?.hashed_token);
  if (!hashedToken) {
    throw new Error('Invite confirmation link was generated without a token.');
  }

  return buildAuthVerifyUrl({
    supabaseUrl,
    hashedToken,
    redirectTo,
  });
}

async function buildFallbackInviteLink(params: {
  request: Request;
  serviceClient: EdgeClient;
  invitedEmail: string;
  workspaceId: string;
  role: string;
  existingInviteLink: string | null;
}) {
  if (params.existingInviteLink) {
    return params.existingInviteLink;
  }

  try {
    return await buildCustomInviteLink({
      request: params.request,
      serviceClient: params.serviceClient,
      invitedEmail: params.invitedEmail,
      workspaceId: params.workspaceId,
      role: params.role,
    });
  } catch (error) {
    console.error('Unable to build invite fallback link', error);
    return null;
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
    const invitedEmail = normalizeEmail(payload.invited_email);
    const role = normalizeString(payload.role) || 'agent';
    const resendExisting = normalizeBoolean(payload.resend_existing);

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    if (!invitedEmail || !isValidEmail(invitedEmail)) {
      return jsonResponse({ error: 'A valid invited_email is required.' }, 400);
    }

    if (role !== 'agent') {
      return jsonResponse({ error: 'Only the agent role can be invited.' }, 400);
    }

    const workspace = await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);

    if (invitedEmail === (authContext.user.email ?? '').trim().toLowerCase()) {
      return jsonResponse({ error: 'You already own this workspace.' }, 400);
    }

    const { data: existingInvite, error: existingInviteError } = await authContext.serviceClient
      .from('workspace_member_invites')
      .select('id, invited_email, role, status, created_at')
      .eq('workspace_id', workspaceId)
      .eq('invited_email', invitedEmail)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingInviteError) {
      return jsonResponse({ error: existingInviteError.message }, 500);
    }

    const { data: members, error: membersError } = await authContext.serviceClient
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId);

    if (membersError) {
      return jsonResponse({ error: membersError.message }, 500);
    }

    for (const member of members ?? []) {
      const { data, error } = await authContext.serviceClient.auth.admin.getUserById(member.user_id);

      if (error) {
        return jsonResponse({ error: error.message || 'Unable to validate existing members.' }, 500);
      }

      const memberEmail = data.user?.email?.trim().toLowerCase() ?? '';
      if (memberEmail && memberEmail === invitedEmail) {
        return jsonResponse({ error: 'This user is already a member of the workspace.' }, 409);
      }
    }

    let invite = existingInvite;

    if (!invite) {
      const { data: createdInvite, error: inviteError } = await authContext.serviceClient
        .from('workspace_member_invites')
        .insert({
          workspace_id: workspaceId,
          invited_email: invitedEmail,
          role,
          invited_by: authContext.user.id,
        })
        .select('id, invited_email, role, status, created_at')
        .single();

      if (inviteError || !createdInvite) {
        return jsonResponse({ error: inviteError?.message || 'Unable to create invite.' }, 500);
      }

      invite = createdInvite;
    }

    const { data: inviterProfile } = await authContext.serviceClient
      .from('profiles')
      .select('full_name')
      .eq('id', authContext.user.id)
      .maybeSingle();
    const inviterName =
      normalizeString(inviterProfile?.full_name) ||
      normalizeString(authContext.user.email) ||
      'A workspace owner';

    let inviteLink: string | null = null;
    let attemptedProvider: 'workspace_sender' | 'supabase_auth' = 'supabase_auth';
    let emailDelivery:
      | { status: 'sent'; provider: 'workspace_sender' | 'supabase_auth'; message?: string }
      | { status: 'failed'; provider: 'workspace_sender' | 'supabase_auth' | 'none'; message: string } = {
        status: 'failed',
        provider: 'none',
        message: 'Unable to send the invite email.',
      };

    try {
      const sender = await getConnectedDefaultSender(authContext.serviceClient, workspaceId);

      if (sender) {
        attemptedProvider = 'workspace_sender';
        inviteLink = await buildCustomInviteLink({
          request,
          serviceClient: authContext.serviceClient,
          invitedEmail,
          workspaceId,
          role,
        });

        const emailContent = buildInviteEmail({
          workspaceName: workspace.name ?? 'your workspace',
          inviterName,
          invitedEmail,
          inviteUrl: inviteLink,
        });

        await sendEmailWithSender({
          db: authContext.serviceClient,
          sender,
          toEmail: invitedEmail,
          subject: emailContent.subject,
          bodyText: emailContent.bodyText,
          bodyHtml: emailContent.bodyHtml,
          fromName: sender.sender_name,
          fromEmail: sender.sender_email,
        });

        emailDelivery = {
          status: 'sent',
          provider: 'workspace_sender',
          message: resendExisting || existingInvite ? 'Invite email resent.' : 'Invite email sent.',
        };
      } else {
        const redirectTo = buildInviteRedirectUrl(request);
        const { error } = await authContext.serviceClient.auth.admin.inviteUserByEmail(invitedEmail, {
          redirectTo,
          data: {
            invited_workspace_id: workspaceId,
            invited_role: role,
            inviter_name: inviterName,
          },
        });

        if (error) {
          throw new Error(error.message || 'Unable to send the auth invite email.');
        }

        emailDelivery = {
          status: 'sent',
          provider: 'supabase_auth',
          message: 'Invite email sent.',
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send invite email.';
      inviteLink = await buildFallbackInviteLink({
        request,
        serviceClient: authContext.serviceClient,
        invitedEmail,
        workspaceId,
        role,
        existingInviteLink: inviteLink,
      });
      emailDelivery = {
        status: 'failed',
        provider: attemptedProvider,
        message,
      };
    }

    return jsonResponse({
      invite,
      invite_link: inviteLink,
      reused_existing: Boolean(existingInvite),
      email_delivery: emailDelivery,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
