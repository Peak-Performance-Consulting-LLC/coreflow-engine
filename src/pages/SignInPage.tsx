import { AuthLayout } from '../components/auth/AuthLayout';
import { SignInForm } from '../components/auth/SignInForm';
import { SigninValuePanel } from '../components/auth/SigninValuePanel';

export function SignInPage() {
  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in to continue into your workspace."
      description=""
      leftPanel={<SigninValuePanel />}
      layoutVariant="signin"
      footer={
        <p>
          Session persistence is enabled through Supabase Auth, so returning users stay signed in across reloads.
        </p>
      }
    >
      <SignInForm />
    </AuthLayout>
  );
}
 
