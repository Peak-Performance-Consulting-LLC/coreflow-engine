import { Navigate, Route, Routes } from 'react-router-dom';
import { CrmWorkspaceProvider } from '../context/CrmWorkspaceContext';
import { CrmWorkspaceRoute } from './CrmWorkspaceRoute';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicOnlyRoute } from './PublicOnlyRoute';
import { HomePage } from '../pages/HomePage';
import { SignInPage } from '../pages/SignInPage';
import { SignUpPage } from '../pages/SignUpPage';
import { CompleteOnboardingPage } from '../pages/CompleteOnboardingPage';
import { DashboardPage } from '../pages/DashboardPage';
import { RecordsPage } from '../pages/RecordsPage';
import { RecordCreatePage } from '../pages/RecordCreatePage';
import { RecordDetailPage } from '../pages/RecordDetailPage';
import { ImportsPage } from '../pages/ImportsPage';
import { VoiceOpsPage } from '../pages/VoiceOpsPage';
import { VoiceNumbersPage } from '../pages/VoiceNumbersPage';
import { VoiceNewNumberPage } from '../pages/VoiceNewNumberPage';
import { VoiceAssistantsPage } from '../pages/VoiceAssistantsPage';
import { VoiceNewAssistantPage } from '../pages/VoiceNewAssistantPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />

      <Route element={<PublicOnlyRoute />}>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />
      </Route>

      <Route element={<ProtectedRoute allowWithoutWorkspace />}>
        <Route path="/onboarding/complete" element={<CompleteOnboardingPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/dashboard/:crmType" element={<DashboardPage />} />
        <Route path="/voice" element={<Navigate to="/voice/ops" replace />} />
        <Route
          path="/settings/voice"
          element={<Navigate to="/voice/numbers" replace />}
        />
        <Route path="/voice/ops" element={<VoiceOpsPage />} />
        <Route
          path="/voice/numbers"
          element={(
            <CrmWorkspaceProvider>
              <VoiceNumbersPage />
            </CrmWorkspaceProvider>
          )}
        />
        <Route
          path="/voice/numbers/new"
          element={(
            <CrmWorkspaceProvider>
              <VoiceNewNumberPage />
            </CrmWorkspaceProvider>
          )}
        />
        <Route
          path="/voice/assistants"
          element={(
            <CrmWorkspaceProvider>
              <VoiceAssistantsPage />
            </CrmWorkspaceProvider>
          )}
        />
        <Route
          path="/voice/assistants/new"
          element={(
            <CrmWorkspaceProvider>
              <VoiceNewAssistantPage />
            </CrmWorkspaceProvider>
          )}
        />
        <Route element={<CrmWorkspaceRoute />}>
          <Route path="/records" element={<RecordsPage />} />
          <Route path="/records/new" element={<RecordCreatePage />} />
          <Route path="/records/:recordId" element={<RecordDetailPage />} />
          <Route path="/imports" element={<ImportsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
