// SignUpForm.tsx
import { Eye, EyeOff, ArrowRight, ArrowLeft, Sparkles, Rocket, CheckCircle2, X, Shuffle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { toast } from 'sonner';
import { completeSignup } from '../../lib/auth-helpers';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { getDashboardPath, isValidWorkspaceSlug, slugify } from '../../lib/utils';
import type { CRMType } from '../../lib/types';
import { crmOptions } from '../../lib/constants';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/Button';
import { ConfigurationNotice } from '../ui/ConfigurationNotice';
import { Input } from '../ui/Input';
import { SignupStepIndicator } from './SignupStepIndicator';

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
  const [crmType, setCrmType] = useState<CRMType | ''>('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const selectedCrm = crmOptions.find((option) => option.value === crmType);
  const SelectedCrmIcon = selectedCrm?.icon ?? Sparkles;
  const previewUrl = `${typeof window === 'undefined' ? 'coreflow.app/' : `${window.location.host}/`}${
    workspaceSlug || 'your-workspace'
  }`;

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
          crm_type: crmType as CRMType,
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
    <form className="relative space-y-3.5" onSubmit={handleSubmit}>
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
              className="space-y-3.5"
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
                className="grid gap-3.5 lg:grid-cols-2"
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
              className="relative overflow-hidden rounded-[26px] border border-indigo-100 bg-white/75 p-4 shadow-panel backdrop-blur-md"
            >
              <motion.div
                className="pointer-events-none absolute -right-14 -top-16 h-36 w-36 rounded-full bg-gradient-to-br from-fuchsia-300/25 to-cyan-300/25 blur-3xl"
                animate={{ scale: [1, 1.18, 1], opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div className="relative grid gap-3">
                <div className="flex items-center gap-3">
                  <motion.div
                    className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-glow"
                    animate={{ rotate: [0, -8, 8, 0], y: [0, -3, 0] }}
                    transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Rocket className="h-5 w-5" />
                  </motion.div>
                  <div className="min-w-0">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-700">Workspace setup</h2>
                    <p className="mt-1 text-xs text-slate-600">Compact launch details.</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    label="Workspace name"
                    placeholder="CoreFlow Ventures"
                    value={workspaceName}
                    onChange={(event) => updateWorkspaceName(event.target.value)}
                    error={errors.workspaceName}
                  />
                  <Input
                    label="Workspace slug"
                    placeholder="coreflow-ventures"
                    value={workspaceSlug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      setWorkspaceSlug(slugify(event.target.value));
                    }}
                    error={errors.workspaceSlug}
                    hint="Lowercase letters, numbers, and hyphens."
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-stretch">
                  <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3">
                    <motion.span
                      className="pointer-events-none absolute right-3 top-3 h-2 w-2 rounded-full bg-indigo-500"
                      animate={{ scale: [0.8, 1.6, 0.8], opacity: [0.35, 0.9, 0.35] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <div className="text-[10px] uppercase tracking-[0.2em] text-indigo-700">Preview URL</div>
                    <div className="mt-1 break-all font-display text-sm font-semibold text-slate-900">{previewUrl}</div>
                  </div>

                  <motion.button
                    type="button"
                    onClick={() => setModePickerOpen(true)}
                    className="group relative flex min-w-[250px] items-center gap-3 overflow-hidden rounded-2xl border-2 border-accent-blue/35 bg-white p-3 text-left shadow-glow transition hover:-translate-y-0.5 hover:border-accent-blue/70 hover:shadow-2xl"
                    animate={{
                      y: [0, -3, 0],
                      boxShadow: [
                        '0 0 0 rgba(79,70,229,0.12)',
                        '0 16px 36px rgba(79,70,229,0.26)',
                        '0 0 0 rgba(79,70,229,0.12)',
                      ],
                    }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    whileHover={{ scale: 1.025 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <motion.div
                      className="pointer-events-none absolute -inset-1 rounded-[18px] border border-accent-blue/30"
                      animate={{ scale: [1, 1.04, 1], opacity: [0.35, 0.9, 0.35] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/16 via-cyan-400/10 to-fuchsia-400/12 opacity-95" />
                    <motion.span
                      className="pointer-events-none absolute right-11 top-3 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.75)]"
                      animate={{ scale: [0.8, 1.7, 0.8], opacity: [0.35, 1, 0.35] }}
                      transition={{ duration: 1.25, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <motion.div
                      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent-blue/25 bg-white text-accent-blue shadow-sm"
                      animate={{ rotate: [0, -5, 5, 0], scale: [1, 1.06, 1] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <SelectedCrmIcon className="h-5 w-5" />
                    </motion.div>
                    <div className="relative min-w-0 flex-1">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">CRM mode</div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {selectedCrm ? (
                          <>
                            <span className="font-display text-sm font-semibold text-slate-900">{selectedCrm.label}</span>
                            <span className="rounded-full border border-accent-blue/25 bg-white/85 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-accent-blue">
                              is selected
                            </span>
                          </>
                        ) : (
                          <span className="font-display text-sm font-semibold text-slate-900">Select a CRM mode</span>
                        )}
                      </div>
                    </div>
                    <motion.div
                      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-blue text-white shadow-sm"
                      animate={{ rotate: [0, 12, -12, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.4 }}
                    >
                      <Shuffle className="h-4 w-4" />
                    </motion.div>
                  </motion.button>
                </div>

                <motion.label
                  whileHover={{ y: -2, scale: 1.005 }}
                  className="group relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-2xl border border-indigo-100 bg-white/80 p-3 text-xs leading-5 text-slate-700 shadow-sm"
                >
                  <motion.span
                    className="pointer-events-none absolute right-4 top-4 h-2 w-2 rounded-full bg-indigo-400 shadow-[0_0_16px_rgba(99,102,241,0.55)]"
                    animate={{ scale: [0.8, 1.5, 0.8], opacity: [0.35, 0.9, 0.35] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(event) => setTermsAccepted(event.target.checked)}
                    className="peer sr-only"
                  />
                  <motion.span
                    className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-white text-white shadow-sm transition peer-checked:border-accent-blue peer-checked:bg-accent-blue"
                    animate={termsAccepted ? { rotate: [0, -10, 10, 0], scale: [1, 1.12, 1] } : undefined}
                    transition={{ duration: 0.45 }}
                  >
                    {termsAccepted ? <CheckCircle2 className="h-4 w-4" /> : null}
                  </motion.span>
                  <span className="relative">
                    I agree to the terms, privacy expectations, and workspace ownership rules for this launch build.
                  </span>
                </motion.label>
                {errors.terms ? <p className="text-xs text-rose-500 animate-shake">{errors.terms}</p> : null}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {modePickerOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/70 bg-white p-4 shadow-2xl sm:p-5"
              initial={{ opacity: 0, scale: 0.9, y: 26, rotate: -1.5 }}
              animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 18, rotate: 1.5 }}
              transition={{ duration: 0.28, ease: smoothEase }}
            >
              <motion.div
                className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-indigo-300/35 to-cyan-300/25 blur-3xl"
                animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.85, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="pointer-events-none absolute -bottom-16 -left-12 h-36 w-36 rounded-full border border-fuchsia-300/40"
                animate={{ rotate: [0, 360], scale: [1, 1.12, 1] }}
                transition={{
                  rotate: { duration: 8, repeat: Infinity, ease: 'linear' },
                  scale: { duration: 2.6, repeat: Infinity, ease: 'easeInOut' },
                }}
              />

              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-indigo-700">Choose mode</div>
                  <h3 className="mt-1 font-display text-xl font-semibold text-slate-950">Pick your workspace engine</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setModePickerOpen(false)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-indigo-200 hover:text-slate-950"
                  aria-label="Close mode picker"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative mt-4 grid gap-3 sm:grid-cols-2">
                {crmOptions.map((option, index) => {
                  const Icon = option.icon;
                  const isSelected = option.value === crmType;

                  return (
                    <motion.button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setCrmType(option.value);
                        setModePickerOpen(false);
                      }}
                      className={`group relative overflow-hidden rounded-2xl border p-3 text-left shadow-sm transition ${
                        isSelected
                          ? 'border-accent-blue/60 bg-indigo-50 shadow-glow'
                          : 'border-slate-200 bg-white hover:-translate-y-1 hover:border-indigo-200 hover:shadow-panel'
                      }`}
                      initial={{ opacity: 0, y: 18, rotate: index % 2 === 0 ? -1.5 : 1.5 }}
                      animate={{ opacity: 1, y: 0, rotate: 0 }}
                      transition={{ delay: index * 0.04, duration: 0.28 }}
                      whileHover={{ scale: 1.015 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${option.accent} opacity-40`} />
                      <motion.span
                        className="absolute bottom-3 right-3 h-2 w-2 rounded-full bg-indigo-400/70 shadow-[0_0_14px_rgba(99,102,241,0.55)]"
                        animate={{ scale: [0.7, 1.35, 0.7], opacity: [0.3, 0.9, 0.3] }}
                        transition={{ duration: 1.8 + index * 0.1, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      <div className="relative flex items-center gap-3 pr-8">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/80 bg-white text-accent-blue shadow-sm">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-display text-sm font-semibold text-slate-950">{option.label}</div>
                          <div className="mt-0.5 text-xs leading-4 text-slate-600">{option.description}</div>
                        </div>
                      </div>
                      {isSelected ? (
                        <motion.span
                          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white text-accent-blue shadow-sm"
                          animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.1, 1] }}
                          transition={{ duration: 1.3, repeat: Infinity, repeatDelay: 1 }}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </motion.span>
                      ) : null}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
          className="w-full sm:w-auto group relative h-8 overflow-hidden px-4 text-xs disabled:hover:bg-indigo-600"
          loading={loading}
          disabled={step === 2 && !crmType}
          title={step === 2 && !crmType ? 'Select a CRM mode before starting your workspace.' : undefined}
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
