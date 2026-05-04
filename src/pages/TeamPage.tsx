import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Filter,
  MailPlus,
  MoreHorizontal,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { useAuth } from '../hooks/useAuth';
import { isWorkspaceOwner } from '../lib/utils';
import { getAccountSettings } from '../lib/account-service';
import {
  getWorkspaceTeam,
  inviteWorkspaceAgent,
  removeWorkspaceMember,
  revokeWorkspaceInvite,
  type WorkspaceTeamInvite,
  type WorkspaceTeamMember,
} from '../lib/team-service';

function hasConfiguredWorkspaceEmailSender(
  senders: Array<{
    status: 'pending' | 'connected' | 'failed' | 'disabled';
    is_active: boolean;
  }>,
) {
  return senders.some((sender) => sender.is_active && sender.status === 'connected');
}

function formatShortDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function getInitials(name?: string | null, email?: string | null) {
  const source = name || email || 'U';
  return source
    .split(/[.\s@_-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function upsertInviteList(current: WorkspaceTeamInvite[], nextInvite: WorkspaceTeamInvite) {
  const existingIndex = current.findIndex((invite) => invite.id === nextInvite.id);

  if (existingIndex === -1) {
    return [nextInvite, ...current];
  }

  const next = [...current];
  next[existingIndex] = nextInvite;
  return next;
}

type TeamRemovalTarget =
  | { kind: 'member'; member: WorkspaceTeamMember }
  | { kind: 'invite'; invite: WorkspaceTeamInvite };

async function copyInviteLinkWithFallback(inviteLink: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(inviteLink);
      return true;
    }
  } catch {
    // Fall through to prompt fallback.
  }

  if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
    window.prompt('Copy this secure invite link:', inviteLink);
    return true;
  }

  return false;
}

export function TeamPage() {
  const navigate = useNavigate();
  const { session, workspace, signOut } = useAuth();

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<WorkspaceTeamMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceTeamInvite[]>([]);
  const [email, setEmail] = useState('');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [ownerEmailConfigured, setOwnerEmailConfigured] = useState<boolean>(true);
  const [showEmailConfigModal, setShowEmailConfigModal] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<TeamRemovalTarget | null>(null);

  const isOwner = isWorkspaceOwner(workspace);

  const ownerCount = useMemo(
    () => members.filter((member) => member.role === 'owner').length,
    [members],
  );

  const agentCount = useMemo(
    () => members.filter((member) => member.role === 'agent').length,
    [members],
  );

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  async function loadTeam() {
    if (!session || !workspace || !isOwner) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const response = await getWorkspaceTeam(session, workspace.id);
      setMembers(response.members);
      setInvites(response.invites);

      try {
        const accountSettings = await getAccountSettings(session, workspace.id);
        setOwnerEmailConfigured(hasConfiguredWorkspaceEmailSender(accountSettings.senders));
      } catch {
        setOwnerEmailConfigured(true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load workspace team.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTeam();
  }, [session, workspace?.id, isOwner]);

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session || !workspace) {
      return;
    }

    if (!email.trim()) {
      toast.error('Enter the email address you want to invite.');
      return;
    }

    if (!ownerEmailConfigured) {
      setShowEmailConfigModal(true);
      return;
    }

    setSubmittingInvite(true);

    try {
      const response = await inviteWorkspaceAgent(session, workspace.id, email.trim());
      setInvites((current) => upsertInviteList(current, response.invite));

      setEmail('');

      if (response.email_delivery?.status === 'sent') {
        toast.success(response.email_delivery.message || (response.reused_existing ? 'Invite email resent.' : 'Invite email sent.'));
        return;
      }

      if (response.email_delivery?.status === 'failed') {
        if (response.invite_link) {
          const copied = await copyInviteLinkWithFallback(response.invite_link);
          if (copied) {
            toast.error(`${response.email_delivery.message || 'Invite email could not be sent.'} Secure invite link copied instead.`);
          } else {
            toast.error(`${response.email_delivery.message || 'Invite email could not be sent.'} Share the secure invite link manually.`);
          }
          return;
        }

        toast.error(response.email_delivery.message || 'Invite email could not be sent.');
        return;
      }

      toast.success(response.reused_existing ? 'Invite already existed.' : 'Agent invite created.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to invite agent.';
      toast.error(message);
    } finally {
      setSubmittingInvite(false);
    }
  }

  async function handleResendInvite(invite: WorkspaceTeamInvite) {
    if (!session || !workspace) {
      return;
    }

    if (!ownerEmailConfigured) {
      setShowEmailConfigModal(true);
      return;
    }

    try {
      const response = await inviteWorkspaceAgent(session, workspace.id, invite.invited_email, {
        resendExisting: true,
      });
      setInvites((current) => upsertInviteList(current, response.invite));

      if (response.email_delivery?.status === 'sent') {
        toast.success(response.email_delivery.message || 'Invite email resent.');
        return;
      }

      if (response.email_delivery?.status === 'failed') {
        if (response.invite_link) {
          const copied = await copyInviteLinkWithFallback(response.invite_link);
          if (copied) {
            toast.error(`${response.email_delivery.message || 'Invite email could not be resent.'} Secure invite link copied instead.`);
          } else {
            toast.error(`${response.email_delivery.message || 'Invite email could not be resent.'} Share the secure invite link manually.`);
          }
          return;
        }

        toast.error(response.email_delivery.message || 'Invite email could not be resent.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to resend invite.';
      toast.error(message);
    }
  }

  async function handleRemoveMember(member: WorkspaceTeamMember) {
    setPendingRemoval({ kind: 'member', member });
  }

  async function handleRevokeInvite(invite: WorkspaceTeamInvite) {
    setPendingRemoval({ kind: 'invite', invite });
  }

  async function handleConfirmRemoval() {
    if (!session || !workspace || !pendingRemoval) {
      return;
    }

    if (pendingRemoval.kind === 'member') {
      const member = pendingRemoval.member;
      const removingToken = `member:${member.user_id}`;
      setRemovingKey(removingToken);

      try {
        await removeWorkspaceMember(session, workspace.id, member.user_id);
        setMembers((current) => current.filter((item) => item.user_id !== member.user_id));
        toast.success('Workspace member removed.');
        setPendingRemoval(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to remove workspace member.';
        toast.error(message);
      } finally {
        setRemovingKey(null);
      }

      return;
    }

    const invite = pendingRemoval.invite;
    const removingToken = `invite:${invite.id}`;
    setRemovingKey(removingToken);

    try {
      await revokeWorkspaceInvite(session, workspace.id, invite.id);
      setInvites((current) => current.filter((item) => item.id !== invite.id));
      toast.success('Pending invite canceled.');
      setPendingRemoval(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to cancel invite.';
      toast.error(message);
    } finally {
      setRemovingKey(null);
    }
  }

  if (!session || !workspace) {
    return <FullPageLoader label="Loading team..." />;
  }

  if (!isOwner) {
    return <Navigate to={`/dashboard/${workspace.crmType}`} replace />;
  }

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={handleSignOut}>
      <div className="mx-auto max-w-[92rem] space-y-6 px-4 pb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-950">
              Team
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage members, roles, and access to your workspace
            </p>
          </div>

          <Button
            type="button"
            className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold shadow-sm shadow-indigo-200 hover:bg-indigo-700"
            onClick={() => {
              document.getElementById('invite-member-email')?.focus();
            }}
          >
            <MailPlus className="h-4 w-4" />
            Invite Member
          </Button>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Owners</p>
                <p className="mt-1 font-display text-3xl font-semibold text-slate-950">
                  {ownerCount}
                </p>
                <p className="mt-1 text-xs text-slate-500">Primary account holder</p>
              </div>
            </div>
          </Card>

          <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Agents</p>
                <p className="mt-1 font-display text-3xl font-semibold text-slate-950">
                  {agentCount}
                </p>
                <p className="mt-1 text-xs font-medium text-emerald-600">
                  ↗ +1 this week
                </p>
              </div>
            </div>
          </Card>

          <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <MailPlus className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Pending Invites</p>
                <p className="mt-1 font-display text-3xl font-semibold text-slate-950">
                  {invites.length}
                </p>
                <p className="mt-1 text-xs font-medium text-amber-600">
                  {invites.length > 0 ? 'Expiring soon' : 'No pending invites'}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                <h2 className="text-base font-semibold text-slate-950">Workspace Members</h2>

                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filter
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      <th className="px-6 py-4">User</th>
                      <th className="px-4 py-4">Role</th>
                      <th className="px-4 py-4">Status</th>
                      <th className="px-4 py-4">Joined</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                          Loading workspace members...
                        </td>
                      </tr>
                    ) : members.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                          No workspace members found yet.
                        </td>
                      </tr>
                    ) : (
                      members.map((member) => {
                        const isOwnerMember = member.role === 'owner';
                        const removing = removingKey === `member:${member.user_id}`;

                        return (
                          <tr key={member.user_id} className="transition hover:bg-slate-50/70">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                                  {getInitials(member.full_name, member.email) || (
                                    <UserRound className="h-4 w-4" />
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-slate-950">
                                    {member.full_name || member.email || 'Workspace member'}
                                  </p>
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    {member.email || 'Email unavailable'}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-4">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                                  isOwnerMember
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {isOwnerMember ? 'Owner' : 'Agent'}
                              </span>
                            </td>

                            <td className="px-4 py-4">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Active
                              </span>
                            </td>

                            <td className="px-4 py-4 text-sm text-slate-600">
                              {formatShortDate(member.created_at)}
                            </td>

                            <td className="px-6 py-4 text-right">
                              {!isOwnerMember ? (
                                <button
                                  type="button"
                                  disabled={removing}
                                  onClick={() => void handleRemoveMember(member)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                  title="Remove member"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                                  title="More options"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="text-base font-semibold text-slate-950">Pending Invites</h2>
              </div>

              <div className="divide-y divide-slate-100">
                {invites.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                      <MailPlus className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-700">
                      No pending invites right now.
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Invite your team to start collaborating.
                    </p>
                  </div>
                ) : (
                  invites.map((invite) => {
                    const removing = removingKey === `invite:${invite.id}`;

                    return (
                      <div
                        key={invite.id}
                        className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                            <UserRound className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-950">
                              {invite.invited_email}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              Invited {formatShortDate(invite.created_at)} • Expires soon
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 sm:justify-end">
                          <button
                            type="button"
                            onClick={() => void handleResendInvite(invite)}
                            className="text-sm font-semibold text-indigo-600 transition hover:text-indigo-700"
                          >
                            Resend email
                          </button>

                          <button
                            type="button"
                            disabled={removing}
                            onClick={() => void handleRevokeInvite(invite)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            title="Cancel invite"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>

          <Card className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <MailPlus className="h-4 w-4" />
              </div>
              <h2 className="text-base font-semibold text-slate-950">Invite new members</h2>
            </div>

            <form className="mt-6 space-y-5" onSubmit={(event) => void handleInvite(event)}>
              <div>
                <label
                  htmlFor="invite-member-email"
                  className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
                >
                  Email Address
                </label>
                <input
                  id="invite-member-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@company.com"
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Role
                </label>
                <select
                  value="agent"
                  disabled
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed"
                >
                  <option value="agent">Agent</option>
                </select>
              </div>

              <Button
                type="submit"
                loading={submittingInvite}
                className="h-12 w-full rounded-xl bg-indigo-600 font-semibold shadow-sm shadow-indigo-200 hover:bg-indigo-700"
              >
                Send Invite
              </Button>
            </form>

            {ownerEmailConfigured ? (
              <div className="mt-6 rounded-xl bg-indigo-50 px-4 py-4 text-xs leading-5 text-indigo-700">
                New agents receive a confirmation email with a secure link to set their password and join the workspace.
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-xs leading-5 text-amber-800">
                Configure workspace email first before sending invites.
                <button
                  type="button"
                  className="ml-1 font-semibold underline underline-offset-2"
                  onClick={() => setShowEmailConfigModal(true)}
                >
                  Open email configuration
                </button>
                .
              </div>
            )}
          </Card>
        </div>
      </div>

      {showEmailConfigModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-950">Configure workspace email first</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Invite emails are disabled until the workspace owner configures an email sender.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowEmailConfigModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setShowEmailConfigModal(false);
                  navigate('/email');
                }}
              >
                Configure email
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingRemoval ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-950">
              {pendingRemoval.kind === 'member' ? 'Remove workspace member?' : 'Cancel invite?'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {pendingRemoval.kind === 'member'
                ? `Remove ${pendingRemoval.member.full_name || pendingRemoval.member.email || 'this member'} from the workspace?`
                : `Cancel the pending invite for ${pendingRemoval.invite.invited_email}?`}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={Boolean(removingKey)}
                onClick={() => setPendingRemoval(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                loading={Boolean(removingKey)}
                onClick={() => void handleConfirmRemoval()}
              >
                {pendingRemoval.kind === 'member' ? 'Remove member' : 'Cancel invite'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </WorkspaceLayout>
  );
}
