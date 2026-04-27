import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  Copy,
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
import {
  getWorkspaceTeam,
  inviteWorkspaceAgent,
  removeWorkspaceMember,
  revokeWorkspaceInvite,
  type WorkspaceTeamInvite,
  type WorkspaceTeamMember,
} from '../lib/team-service';

function buildInviteLink(invitedEmail: string) {
  if (typeof window === 'undefined') {
    return `/signin?invite=1&email=${encodeURIComponent(invitedEmail)}`;
  }

  return `${window.location.origin}/signin?invite=1&email=${encodeURIComponent(invitedEmail)}`;
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

export function TeamPage() {
  const navigate = useNavigate();
  const { session, workspace, signOut } = useAuth();

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<WorkspaceTeamMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceTeamInvite[]>([]);
  const [email, setEmail] = useState('');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);

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

    setSubmittingInvite(true);

    try {
      const response = await inviteWorkspaceAgent(session, workspace.id, email.trim());
      setInvites((current) => [response.invite, ...current]);

      const inviteLink = buildInviteLink(response.invite.invited_email);

      setEmail('');
      toast.success('Agent invite created.');

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteLink);
        toast.success('Invite sign-in link copied.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to invite agent.';
      toast.error(message);
    } finally {
      setSubmittingInvite(false);
    }
  }

  async function handleCopyInvite(invite: WorkspaceTeamInvite) {
    try {
      await navigator.clipboard.writeText(buildInviteLink(invite.invited_email));
      toast.success('Invite sign-in link copied.');
    } catch {
      toast.error('Unable to copy invite link.');
    }
  }

  async function handleCopyBlankInvite() {
    if (!email.trim()) {
      toast.error('Enter an email address first.');
      return;
    }

    try {
      await navigator.clipboard.writeText(buildInviteLink(email.trim()));
      toast.success('Invite link copied.');
    } catch {
      toast.error('Unable to copy invite link.');
    }
  }

  async function handleRemoveMember(member: WorkspaceTeamMember) {
    if (!session || !workspace) {
      return;
    }

    if (!window.confirm(`Remove ${member.full_name || member.email || 'this member'} from the workspace?`)) {
      return;
    }

    const removingToken = `member:${member.user_id}`;
    setRemovingKey(removingToken);

    try {
      await removeWorkspaceMember(session, workspace.id, member.user_id);
      setMembers((current) => current.filter((item) => item.user_id !== member.user_id));
      toast.success('Workspace member removed.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove workspace member.';
      toast.error(message);
    } finally {
      setRemovingKey(null);
    }
  }

  async function handleRevokeInvite(invite: WorkspaceTeamInvite) {
    if (!session || !workspace) {
      return;
    }

    if (!window.confirm(`Cancel the pending invite for ${invite.invited_email}?`)) {
      return;
    }

    const removingToken = `invite:${invite.id}`;
    setRemovingKey(removingToken);

    try {
      await revokeWorkspaceInvite(session, workspace.id, invite.id);
      setInvites((current) => current.filter((item) => item.id !== invite.id));
      toast.success('Pending invite canceled.');
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
                            onClick={() => void handleCopyInvite(invite)}
                            className="text-sm font-semibold text-indigo-600 transition hover:text-indigo-700"
                          >
                            Resend
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

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-xs font-semibold text-slate-400">OR</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>

            <button
              type="button"
              onClick={() => void handleCopyBlankInvite()}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Copy className="h-4 w-4" />
              Copy invite link
            </button>

            <div className="mt-6 rounded-xl bg-indigo-50 px-4 py-4 text-xs leading-5 text-indigo-700">
              Invited members will receive an email with a link to join your workspace.
              Roles can be changed at any time.
            </div>
          </Card>
        </div>
      </div>
    </WorkspaceLayout>
  );
}