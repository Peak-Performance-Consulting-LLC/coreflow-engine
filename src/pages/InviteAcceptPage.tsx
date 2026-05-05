import { Eye, EyeOff, LockKeyhole, MailCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthLayout } from '../components/auth/AuthLayout';
import { SigninValuePanel } from '../components/auth/SigninValuePanel';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../hooks/useAuth';
import { acceptWorkspaceInvite } from '../lib/auth-helpers';
import { getSupabaseClient } from '../lib/supabaseClient';
import { getDashboardPath } from '../lib/utils';

export function InviteAcceptPage() {
  const navigate = useNavigate();
  const { loading, workspaceLoading, session, user, workspace, refreshWorkspace } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  const invitedEmail = useMemo(() => user?.email?.trim() ?? '', [user?.email]);
  const workspaceName = workspace?.name?.trim() || 'your workspace';
  const ready = !loading && !(workspaceLoading && !!user && !workspace);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: { password?: string; confirmPassword?: string } = {};
    if (!/^(?=.*\d).{8,}$/.test(password)) {
      nextErrors.password = 'Use at least 8 characters and include a number.';
    }
    if (confirmPassword !== password) {
      nextErrors.confirmPassword = 'Passwords do not match.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      const client = getSupabaseClient();
      const { error } = await client.auth.updateUser({
        password,
      });

      if (error) {
        throw error;
      }

      if (!session) {
        throw new Error('Your invite session expired. Ask the workspace owner to resend the invite.');
      }

      const nextWorkspace = await acceptWorkspaceInvite(session);
      await refreshWorkspace(session);
      if (!nextWorkspace) {
        throw new Error('Your password was saved, but the workspace invite could not be attached. Ask the workspace owner to resend the invite.');
      }

      toast.success('Password created. Welcome to CoreFlow.');
      navigate(getDashboardPath(nextWorkspace), { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to finish the invite.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Accept invite"
      title="Create your password to join CoreFlow."
      description="This secure step confirms the invite and finishes access to the workspace."
      leftPanel={<SigninValuePanel />}
      footer={(
        <p>
          After this password is saved, you can sign in anytime with the invited email address and this password.
        </p>
      )}
    >
      {!ready ? (
        <div className="rounded-2xl border border-slate-200 bg-white/70 px-5 py-6 text-sm text-slate-600">
          Verifying your invite...
        </div>
      ) : !user ? (
        <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <MailCheck className="h-4 w-4" />
            This invite link is missing, expired, or has already been used.
          </div>
          <p className="leading-6 text-amber-800">
            Ask the workspace owner to resend your invite email, then open the newest link from that message.
          </p>
          <Link
            to="/signin"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-5 py-4 text-sm text-slate-700">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
              <MailCheck className="h-4 w-4" />
              Invite confirmed
            </div>
            <p className="mt-2 leading-6">
              You're joining <span className="font-semibold text-slate-950">{workspaceName}</span> with{' '}
              <span className="font-semibold text-slate-950">{invitedEmail || 'your invited email'}</span>.
            </p>
          </div>

          <Input
            label="New password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Create your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            hint="At least 8 characters and one number."
            rightElement={(
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="text-slate-600 transition hover:text-slate-900"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
          />

          <Input
            label="Confirm password"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Repeat your password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            error={errors.confirmPassword}
            rightElement={(
              <button
                type="button"
                onClick={() => setShowConfirmPassword((current) => !current)}
                className="text-slate-600 transition hover:text-slate-900"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
          />

          <Button type="submit" loading={submitting} className="h-11 w-full text-sm font-semibold">
            <LockKeyhole className="h-4 w-4" />
            Save password and continue
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
