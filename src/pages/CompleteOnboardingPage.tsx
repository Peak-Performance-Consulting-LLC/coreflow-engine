import { AuthLayout } from '../components/auth/AuthLayout';
import { CompleteOnboardingForm } from '../components/auth/CompleteOnboardingForm';

export function CompleteOnboardingPage() {
  return (
    <AuthLayout
      eyebrow="Finish setup"
      title="Complete your workspace setup to enter the dashboard."
      description="This account is authenticated, but it does not have a workspace yet. Add the workspace name, slug, and CRM mode to finish onboarding."
      footer={<p>This route supports users who sign in successfully before their workspace was created.</p>}
    >
      <CompleteOnboardingForm />
    </AuthLayout>
  );
}
