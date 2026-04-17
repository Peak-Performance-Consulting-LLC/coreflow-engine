import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { getDashboardPath } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/Button';
import { ConfigurationNotice } from '../ui/ConfigurationNotice';
import { Input } from '../ui/Input';

const rememberedEmailKey = 'coreflow.remembered-email';
const existingUserSignedOutFlagKey = 'coreflow.existing-user-signed-out';
type SignInRouteState = { prefillEmail?: string; existingUser?: boolean } | null;

export function SignInForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSupabaseReady, refreshWorkspace } = useAuth();
  const routeState = location.state as SignInRouteState;
  const hideSignUpOption = Boolean(
    routeState?.existingUser ||
      (typeof window !== 'undefined' && window.sessionStorage.getItem(existingUserSignedOutFlagKey) === '1'),
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    const stateEmail = routeState?.prefillEmail;
    const storedEmail = window.localStorage.getItem(rememberedEmailKey);
    setEmail(stateEmail ?? storedEmail ?? '');
  }, [routeState]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: typeof errors = {};
    if (!email.trim()) nextErrors.email = 'Email is required.';
    if (!password) nextErrors.password = 'Password is required.';
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (!isSupabaseReady) {
      toast.error('Add your Supabase environment variables to enable sign in.');
      return;
    }

    setLoading(true);

    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw error;
      }

      if (rememberMe) {
        window.localStorage.setItem(rememberedEmailKey, email.trim());
      } else {
        window.localStorage.removeItem(rememberedEmailKey);
      }

      const workspace = await refreshWorkspace(data.session);
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(existingUserSignedOutFlagKey);
      }

      toast.success('Welcome back to CoreFlow.');

      if (workspace) {
        navigate(getDashboardPath(workspace), { replace: true });
      } else {
        navigate('/onboarding/complete', { replace: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {!isSupabaseReady ? <ConfigurationNotice /> : null}
      <div className="grid gap-5">
        <Input
          label="Email"
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
        />
        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Enter your password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          rightElement={
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="text-slate-600 transition hover:text-slate-900"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="inline-flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            className="h-4 w-4 rounded border-indigo-200 bg-white text-accent-blue focus:ring-accent-blue"
          />
          Remember me
        </label>
        <button
          type="button"
          onClick={() => toast.info('Password reset UI is next on the roadmap.')}
          className="text-sm text-accent-blue transition hover:text-accent-blue"
        >
          Forgot password?
        </button>
      </div>

      <Button type="submit" className="w-full" loading={loading}>
        Sign In
      </Button>

      {!hideSignUpOption ? (
        <p className="text-sm text-slate-600">
          New to CoreFlow?{' '}
          <Link to="/signup" className="font-medium text-accent-blue transition hover:text-accent-blue">
            Create your account
          </Link>
        </p>
      ) : null}
    </form>
  );
}
