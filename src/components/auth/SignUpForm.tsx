import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

export function SignUpForm() {
  const navigate = useNavigate();
  const { isSupabaseReady, refreshWorkspace } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
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
      setStep(2);
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
    <form className="space-y-8" onSubmit={handleSubmit}>
      <SignupStepIndicator currentStep={step} />

      {!isSupabaseReady ? <ConfigurationNotice /> : null}

      {step === 1 ? (
        <section className="space-y-5">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-600">Account details</h2>
            <p className="mt-1 text-sm text-slate-600">Add your personal login details first.</p>
          </div>

          <Input
            label="Full name"
            placeholder="Jordan Lee"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            error={errors.fullName}
          />
          <Input
            label="Email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={errors.email}
          />
          <div className="grid gap-5 lg:grid-cols-2">
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
          </div>
        </section>
      ) : (
        <>
          <section className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-600">Workspace setup</h2>
              <p className="mt-1 text-sm text-slate-600">Now create your workspace and choose your business template.</p>
            </div>

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
          </section>

          <div className="space-y-3">
            <label className="inline-flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(event) => setTermsAccepted(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-indigo-200 bg-white text-accent-blue focus:ring-accent-blue"
              />
              <span>
                I agree to the terms, privacy expectations, and workspace ownership rules for this launch build.
              </span>
            </label>
            {errors.terms ? <p className="text-xs text-rose-300">{errors.terms}</p> : null}
          </div>
        </>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {step === 2 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setStep(1);
              setErrors((current) => ({
                fullName: current.fullName,
                email: current.email,
                password: current.password,
                confirmPassword: current.confirmPassword,
              }));
            }}
          >
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" className="w-full sm:w-auto" loading={loading}>
          {step === 1 ? 'Continue to workspace setup' : 'Start my workspace'}
        </Button>
      </div>

      <p className="text-center text-xs uppercase tracking-[0.2em] text-slate-500">
        No credit card required | Takes less than a minute
      </p>

      <p className="text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/signin" className="font-medium text-accent-blue transition hover:text-accent-blue">
          Sign in
        </Link>
      </p>
    </form>
  );
}
