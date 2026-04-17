import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { useAuth } from '../hooks/useAuth';
import { getDashboardPath } from '../lib/utils';

export function ProtectedRoute({ allowWithoutWorkspace = false }: { allowWithoutWorkspace?: boolean }) {
  const location = useLocation();
  const { loading, user, workspace, workspaceLoading } = useAuth();

  if (loading || (workspaceLoading && !workspace)) {
    return <FullPageLoader />;
  }

  if (!user) {
    return <Navigate to="/signin" replace state={{ from: location }} />;
  }

  if (allowWithoutWorkspace && workspace) {
    return <Navigate to={getDashboardPath(workspace)} replace />;
  }

  if (!allowWithoutWorkspace && !workspace) {
    return <Navigate to="/onboarding/complete" replace />;
  }

  return <Outlet />;
}
