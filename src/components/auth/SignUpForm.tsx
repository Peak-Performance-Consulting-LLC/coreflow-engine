// SignUpForm.tsx
import { Eye, EyeOff, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { toast } from 'sonner';
import { completeSignup } from '../../lib/auth-helpers';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { getDashboardPath, isValidWorkspaceSlug, slugify } from '../../lib/utils';
import type { CRMType } from '../../lib/types';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/Button';
import { ConfigurationNotice } from '../ui/ConfigurationNotice';
import { Input } from '../ui/Input';
import { SignupStepIndicator } from './SignupStepIndicator';
import { WorkspaceSetupFields } from './WorkspaceSetupFields';

type FormErrors = Partial<
  Record<
    | 'fullName'
    | 'email'
    | 'password'
    | 'confirmPassword'
    | 'workspaceName'
    | 'workspaceSlug'
    | 'crmType'
    | 'terms',
    string
  >
>;

const smoothEase = [0.21, 0.47, 0.32, 0.98] as const;

const formVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.4, ease: smoothEase },
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
    transition: { duration: 0.3 },
  }),
};

export function SignUpForm() {
  const navigate = useNavigate();
  const { isSupabaseReady, refreshWorkspace } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [direction, setDirection] = useState(0);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [crmType, setCrmType] = useState<CRMType>('real-estate');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  function validateAccountStep() {
    const nextErrors: FormErrors = {};

    if (fullName.trim().length < 2) nextErrors.fullName = 'Enter your full name.';
    if (!/\S+@\S+\.\S+/.test(email)) nextErrors.email = 'Enter a valid email address.';
    if (!/^(?=.*\d).{8,}$/.test(password)) {
      nextErrors.password = 'Use at least 8 characters and include a number.';
    }
    if (confirmPassword !== password) nextErrors.confirmPassword = 'Passwords do not match.';

    return nextErrors;
  }

  function validateWorkspaceStep() {
    const nextErrors: FormErrors = {};

    if (workspaceName.trim().length < 2) nextErrors.workspaceName = 'Workspace name is required.';
    if (!isValidWorkspaceSlug(workspaceSlug)) {
      nextErrors.workspaceSlug = 'Use 3+ lowercase characters, numbers, and hyphens only.';
    }
    if (!crmType) nextErrors.crmType = 'Choose a CRM mode.';
    if (!termsAccepted) nextErrors.terms = 'You need to accept the terms to continue.';

    return nextErrors;
  }

  function updateWorkspaceName(value: string) {
    setWorkspaceName(value);

    if (!slugTouched) {
      setWorkspaceSlug(slugify(value));
    }
  }

  function goToStep(newStep: 1 | 2) {
    setDirection(newStep === 2 ? 1 : -1);
    setStep(newStep);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = {
      ...validateAccountStep(),
      ...(step === 2 ? validateWorkspaceStep() : {}),
    };
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (step === 1) {
      goToStep(2);
      return;
    }

    if (!isSupabaseReady) {
      toast.error('Add your Supabase environment variables to enable sign up.');
      return;
    }

    setLoading(true);

    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (error) {
        throw error;
      }

      let session = data.session;

      if (!session) {
        const signInResult = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInResult.error) {
          toast.success('Account created. Verify your email, then sign in to finish onboarding.');
          navigate('/signin', { replace: true, state: { prefillEmail: email.trim() } });
          return;
        }

        session = signInResult.data.session;
      }

      if (!session) {
        throw new Error('Unable to open a session after signup.');
      }

      const workspace = await completeSignup(
        {
          full_name: fullName.trim(),
          workspace_name: workspaceName.trim(),
          workspace_slug: workspaceSlug.trim(),
          crm_type: crmType,
        },
        session,
      );

      await refreshWorkspace(session);
      toast.success('Workspace created. Welcome to CoreFlow.');
      navigate(getDashboardPath(workspace), { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to complete signup.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="relative space-y-4" onSubmit={handleSubmit}>
      <motion.div
        className="pointer-events-none absolute -right-2 -top-3 hidden h-16 w-16 sm:block"
        animate={{ rotate: [0, 10, -8, 0], scale: [1, 1.05, 0.98, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.span
          className="absolute inset-3 rounded-full border border-indigo-200"
          animate={{ scale: [0.8, 1.35], opacity: [0.55, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
        <span className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-glow" />
        <Sparkles className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-white" />
      </motion.div>

      <SignupStepIndicator currentStep={step} />

      {!isSupabaseReady ? <ConfigurationNotice /> : null}

      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          {step === 1 ? (
            <motion.section
              key="step1"
              custom={direction}
              variants={formVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="space-y-4"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Account details</h2>
                <p className="mt-1 text-xs text-slate-600">Add your personal login details first.</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Input
                  label="Full name"
                  placeholder="Jordan Lee"
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  error={errors.fullName}
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 }}
              >
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  error={errors.email}
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="grid gap-4 lg:grid-cols-2"
              >
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  error={errors.password}
                  hint="At least 8 characters and one number."
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
                <Input
                  label="Confirm password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  error={errors.confirmPassword}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((current) => !current)}
                      className="text-slate-600 transition hover:text-slate-900"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                />
              </motion.div>
            </motion.section>
          ) : (
            <motion.section
              key="step2"
              custom={direction}
              variants={formVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="space-y-4"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent-blue" />
                  <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Workspace setup</h2>
                </div>
                <p className="mt-1 text-xs text-slate-600">Now create your workspace and choose your business template.</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <WorkspaceSetupFields
                  workspaceName={workspaceName}
                  workspaceSlug={workspaceSlug}
                  crmType={crmType}
                  errors={errors}
                  onWorkspaceNameChange={updateWorkspaceName}
                  onWorkspaceSlugChange={(value) => {
                    setSlugTouched(true);
                    setWorkspaceSlug(slugify(value));
                  }}
                  onCrmTypeChange={setCrmType}
                  singleColumn
                  showSlugPreview
                  slugPreviewPrefix={typeof window === 'undefined' ? 'coreflow.app/' : `${window.location.host}/`}
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-2"
              >
                <label className="inline-flex items-start gap-3 text-xs leading-5 text-slate-700">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(event) => setTermsAccepted(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-indigo-200 bg-white text-accent-blue focus:ring-accent-blue focus:ring-2 transition-all"
                  />
                  <span>
                    I agree to the terms, privacy expectations, and workspace ownership rules for this launch build.
                  </span>
                </label>
                {errors.terms ? <p className="text-xs text-rose-500 animate-shake">{errors.terms}</p> : null}
              </motion.div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        {step === 2 ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => goToStep(1)}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </motion.button>
        ) : (
          <span />
        )}
        <Button
          type="submit"
          size="sm"
          className="w-full sm:w-auto group relative h-8 overflow-hidden px-4 text-xs"
          loading={loading}
        >
          <span className="relative z-10">
            {step === 1 ? 'Continue to workspace setup' : 'Start my workspace'}
          </span>
          <ArrowRight className="relative z-10 h-4 w-4 transition-transform group-hover:translate-x-1" />
          <span className="absolute inset-0 bg-gradient-to-r from-accent-blue to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </Button>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-center text-[10px] uppercase leading-4 tracking-[0.16em] text-slate-500"
      >
        No credit card required | Takes less than a minute
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="text-center text-xs leading-4 text-slate-600"
      >
        Already have an account?{' '}
        <Link
          to="/signin"
          className="group relative font-medium text-accent-blue transition-all hover:text-accent-blue/80"
        >
          Sign in
          <span className="absolute bottom-0 left-0 h-0.5 w-0 bg-accent-blue transition-all duration-300 group-hover:w-full" />
        </Link>
      </motion.p>
    </form>
  );
}
