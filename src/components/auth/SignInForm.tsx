import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { getConfiguredSupabaseProjectRef, getSupabaseClient } from '../../lib/supabaseClient';
import { getDashboardPath } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import { usePageGuide } from '../../hooks/useAppGuide';
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
  const projectRef = getConfiguredSupabaseProjectRef();

  usePageGuide({
    key: 'auth-signin',
    title: 'Sign in to your workspace',
    summary:
      'Use this page to access an existing CoreFlow workspace. After sign in, CoreFlow restores your workspace and routes you into the correct CRM experience.',
    nextStep: 'Enter your workspace email and password, then continue into CoreFlow.',
    highlights: ['Workspace-aware sign in', 'Remember me support', 'Fast dashboard routing'],
    autoStart: 'once',
    steps: [
      {
        id: 'signin-email',
        title: 'Start with the account email',
        body: 'Use the email already linked to your workspace so CoreFlow can restore the correct membership and routing.',
        targetId: 'sign-in-email',
      },
      {
        id: 'signin-password',
        title: 'Enter the current password',
        body: 'This signs you into Supabase Auth and unlocks the shared CRM workspace attached to this account.',
        targetId: 'sign-in-password',
      },
      {
        id: 'signin-submit',
        title: 'Enter the workspace',
        body: 'When you submit, CoreFlow refreshes your workspace access and sends you into the matching dashboard automatically.',
        targetId: 'sign-in-submit',
        placement: 'top',
      },
    ],
  });

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
      if (message.toLowerCase().includes('invalid login credentials')) {
        const projectLabel = projectRef ? ` (${projectRef})` : '';
        toast.error(
          `Invalid email or password for this Supabase project${projectLabel}. Verify you are signing in to the correct project.`,
        );
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="relative space-y-4" onSubmit={handleSubmit}>
      <motion.div
        className="pointer-events-none absolute -right-2 -top-4 hidden h-20 w-20 sm:block"
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      >
        <motion.span
          className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.65)]"
          animate={{ scale: [1, 1.45, 1], opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <span className="absolute inset-3 rounded-full border border-dashed border-indigo-200" />
        <motion.span
          className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 shadow-glow"
          animate={{ rotate: [0, -360] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        />
        <LogIn className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-white" />
      </motion.div>

      {!isSupabaseReady ? <ConfigurationNotice /> : null}
      <div className="grid gap-4">
        <Input
          label="Email"
          type="email"
          data-guide-id="sign-in-email"
          placeholder="you@company.com"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
        />
        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          data-guide-id="sign-in-password"
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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="inline-flex items-center gap-2.5 text-xs text-slate-700">
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
          className="text-xs font-medium text-accent-blue transition hover:text-accent-blue"
        >
          Forgot password?
        </button>
      </div>

      <Button type="submit" size="sm" className="group relative h-8 w-full overflow-hidden text-xs" loading={loading}>
        <span className="relative z-10">Sign In</span>
        <LogIn className="relative z-10 h-4 w-4 transition-transform group-hover:translate-x-1" />
        <span className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-indigo-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </Button>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="text-center text-[10px] uppercase leading-4 tracking-[0.16em] text-slate-500"
      >
        Secure workspace routing | Session restored automatically
      </motion.p>

      {!hideSignUpOption ? (
        <p className="text-center text-xs leading-4 text-slate-600">
          New to CoreFlow?{' '}
          <Link to="/signup" className="font-medium text-accent-blue transition hover:text-accent-blue">
            Create your account
          </Link>
        </p>
      ) : null}
    </form>
  );
}
