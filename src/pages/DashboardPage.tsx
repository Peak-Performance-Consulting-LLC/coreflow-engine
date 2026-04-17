import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DashboardShell } from '../components/dashboard/DashboardShell';
import { useAuth } from '../hooks/useAuth';

export function DashboardPage() {
  const navigate = useNavigate();
  const { workspace, signOut } = useAuth();

  if (!workspace) {
    return null;
  }

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  return <DashboardShell workspace={workspace} onSignOut={handleSignOut} />;
}
