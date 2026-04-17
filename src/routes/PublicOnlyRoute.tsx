import { Navigate, Outlet } from 'react-router-dom';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { useAuth } from '../hooks/useAuth';
import { getDashboardPath } from '../lib/utils';

export function PublicOnlyRoute() {
  const { loading, user, workspace, workspaceLoading } = useAuth();

  if (loading || (workspaceLoading && !workspace && !!user)) {
    return <FullPageLoader label="Checking your session..." />;
  }

  if (user && workspace) {
    return <Navigate to={getDashboardPath(workspace)} replace />;
  }

  if (user && !workspace) {
    return <Navigate to="/onboarding/complete" replace />;
  }

  return <Outlet />;
}
