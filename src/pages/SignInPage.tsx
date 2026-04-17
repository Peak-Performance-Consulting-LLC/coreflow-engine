import { AuthLayout } from '../components/auth/AuthLayout';
import { SignInForm } from '../components/auth/SignInForm';

export function SignInPage() {
  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in to continue into your CoreFlow workspace."
      description="Use your email and password to access your workspace. CoreFlow will look up your CRM mode and route you into the matching dashboard."
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
