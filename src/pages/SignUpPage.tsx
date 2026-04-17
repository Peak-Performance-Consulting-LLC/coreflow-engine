import { AuthLayout } from '../components/auth/AuthLayout';
import { SignUpForm } from '../components/auth/SignUpForm';
import { SignupValuePanel } from '../components/auth/SignupValuePanel';

export function SignUpPage() {
  return (
    <AuthLayout
      eyebrow="Create workspace"
      title="Launch your CRM workspace"
      description="Set up your account and workspace in one guided flow."
      leftPanel={<SignupValuePanel />}
      footer={
        <p>Workspace setup happens during signup, so you can start using CoreFlow right away.</p>
      }
    >
      <SignUpForm />
    </AuthLayout>
  );
}
