import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { useAuth } from '../hooks/useAuth';
import { getDashboardPath } from '../lib/utils';

export function PublicOnlyRoute() {
  const location = useLocation();
  const { loading, user, workspace, workspaceLoading } = useAuth();
  const loaderVariant = location.pathname === '/signup' ? 'auth' : 'app';

  if (loading || (workspaceLoading && !workspace && !!user)) {
    return <FullPageLoader label="Checking your session..." variant={loaderVariant} />;
  }

  if (user && workspace) {
    return <Navigate to={getDashboardPath(workspace)} replace />;
  }

  if (user && !workspace) {
    return <Navigate to="/onboarding/complete" replace />;
  }

  return <Outlet />;
}
