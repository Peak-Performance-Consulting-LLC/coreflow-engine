// SignUpPage.tsx
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { AuthLayout } from '../components/auth/AuthLayout';
import { SignUpForm } from '../components/auth/SignUpForm';
import { SigninValuePanel } from '../components/auth/SigninValuePanel';

const smoothEase = [0.21, 0.47, 0.32, 0.98] as const;

const pageVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.6,
      ease: smoothEase,
    },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.4 },
  },
};

export function SignUpPage() {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <AuthLayout
        eyebrow="Create workspace"
        title="Launch your CRM workspace"
        description="Set up your account and workspace in one guided flow."
        leftPanel={<SigninValuePanel />}
        layoutVariant="signin"
        footer={
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex items-center gap-2"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-blue animate-pulse" />
            Workspace setup happens during signup, so you can start using CoreFlow right away.
          </motion.p>
        }
      >
        <SignUpForm />
      </AuthLayout>
    </motion.div>
  );
}
