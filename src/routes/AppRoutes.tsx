import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { CrmWorkspaceRoute } from './CrmWorkspaceRoute';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicOnlyRoute } from './PublicOnlyRoute';

const HomePage = lazy(async () => import('../pages/HomePage').then((module) => ({ default: module.HomePage })));
const SignInPage = lazy(async () => import('../pages/SignInPage').then((module) => ({ default: module.SignInPage })));
const SignUpPage = lazy(async () => import('../pages/SignUpPage').then((module) => ({ default: module.SignUpPage })));
const InviteAcceptPage = lazy(async () =>
  import('../pages/InviteAcceptPage').then((module) => ({ default: module.InviteAcceptPage })),
);
const CompleteOnboardingPage = lazy(async () =>
  import('../pages/CompleteOnboardingPage').then((module) => ({ default: module.CompleteOnboardingPage })),
);
const DashboardPage = lazy(async () => import('../pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const RecordsPage = lazy(async () => import('../pages/RecordsPage').then((module) => ({ default: module.RecordsPage })));
const RecordCreatePage = lazy(async () =>
  import('../pages/RecordCreatePage').then((module) => ({ default: module.RecordCreatePage })),
);
const RecordDetailPage = lazy(async () =>
  import('../pages/RecordDetailPage').then((module) => ({ default: module.RecordDetailPage })),
);
const RecordFormBuilderPage = lazy(async () =>
  import('../pages/RecordFormBuilderPage').then((module) => ({ default: module.RecordFormBuilderPage })),
);
const ImportsPage = lazy(async () => import('../pages/ImportsPage').then((module) => ({ default: module.ImportsPage })));
const VoiceOpsPage = lazy(async () => import('../pages/VoiceOpsPage').then((module) => ({ default: module.VoiceOpsPage })));
const VoiceNumbersPage = lazy(async () =>
  import('../pages/VoiceNumbersPage').then((module) => ({ default: module.VoiceNumbersPage })),
);
const VoiceNewNumberPage = lazy(async () =>
  import('../pages/VoiceNewNumberPage').then((module) => ({ default: module.VoiceNewNumberPage })),
);
const VoiceAssistantsPage = lazy(async () =>
  import('../pages/VoiceAssistantsPage').then((module) => ({ default: module.VoiceAssistantsPage })),
);
const VoiceNewAssistantPage = lazy(async () =>
  import('../pages/VoiceNewAssistantPage').then((module) => ({ default: module.VoiceNewAssistantPage })),
);
const AccountPage = lazy(async () => import('../pages/AccountPage').then((module) => ({ default: module.AccountPage })));
const EmailPage = lazy(async () => import('../pages/EmailPage').then((module) => ({ default: module.EmailPage })));
const EmailTemplatesPage = lazy(async () =>
  import('../pages/EmailTemplatesPage').then((module) => ({ default: module.EmailTemplatesPage })),
);
const TeamPage = lazy(async () => import('../pages/TeamPage').then((module) => ({ default: module.TeamPage })));

function withPageLoader(children: ReactNode, variant: 'app' | 'auth' = 'app') {
  return <Suspense fallback={<FullPageLoader variant={variant} />}>{children}</Suspense>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={withPageLoader(<HomePage />)} />
      <Route path="/invite/accept" element={withPageLoader(<InviteAcceptPage />, 'auth')} />

      <Route element={<PublicOnlyRoute />}>
        <Route path="/signin" element={withPageLoader(<SignInPage />)} />
        <Route path="/signup" element={withPageLoader(<SignUpPage />, 'auth')} />
      </Route>

      <Route element={<ProtectedRoute allowWithoutWorkspace />}>
        <Route path="/onboarding/complete" element={withPageLoader(<CompleteOnboardingPage />)} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={withPageLoader(<DashboardPage />)} />
        <Route path="/dashboard/:crmType" element={withPageLoader(<DashboardPage />)} />
        <Route path="/voice" element={<Navigate to="/voice/ops" replace />} />
        <Route path="/settings/voice" element={<Navigate to="/voice/numbers" replace />} />
        <Route path="/voice/ops" element={withPageLoader(<VoiceOpsPage />)} />

        <Route element={<CrmWorkspaceRoute />}>
          <Route path="/voice/numbers" element={withPageLoader(<VoiceNumbersPage />)} />
          <Route path="/voice/numbers/new" element={withPageLoader(<VoiceNewNumberPage />)} />
          <Route path="/voice/assistants" element={withPageLoader(<VoiceAssistantsPage />)} />
          <Route path="/voice/assistants/new" element={withPageLoader(<VoiceNewAssistantPage />)} />
          <Route path="/records" element={withPageLoader(<RecordsPage />)} />
          <Route path="/records/new" element={withPageLoader(<RecordCreatePage />)} />
          <Route path="/records/form-builder" element={withPageLoader(<RecordFormBuilderPage />)} />
          <Route path="/records/:recordId" element={withPageLoader(<RecordDetailPage />)} />
          <Route path="/imports" element={withPageLoader(<ImportsPage />)} />
          <Route path="/account" element={withPageLoader(<AccountPage />)} />
          <Route path="/team" element={withPageLoader(<TeamPage />)} />
          <Route path="/email" element={withPageLoader(<EmailPage />)} />
          <Route path="/email/templates" element={withPageLoader(<EmailTemplatesPage />)} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
