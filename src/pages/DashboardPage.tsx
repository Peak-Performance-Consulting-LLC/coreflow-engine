import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DashboardShell } from '../components/dashboard/DashboardShell';
import type { AppPageGuide } from '../context/AppGuideContext';
import { useAuth } from '../hooks/useAuth';
import { usePageGuide } from '../hooks/useAppGuide';

export function DashboardPage() {
  const navigate = useNavigate();
  const { workspace, signOut } = useAuth();
  const guide = useMemo<AppPageGuide>(
    () => ({
      key: 'dashboard-overview',
      title: 'Workspace dashboard overview',
      summary:
        'This page orients the user inside the shared workspace and points them toward the most likely next action without forcing them into one workflow.',
      nextStep: 'Use the hero shortcuts to jump into records, create a record, or begin an import.',
      highlights: ['Shared CRM overview', 'Quick operational entry points', 'Cross-workspace handoff'],
      autoStart: 'once' as const,
      steps: [
        {
          id: 'dashboard-hero',
          title: 'Start from the hero card',
          body: 'This is the workspace launch point. It summarizes the environment and exposes the fastest ways into active CRM work.',
          targetId: 'dashboard-hero',
        },
        {
          id: 'dashboard-open-records',
          title: 'Open the record queue',
          body: 'Use this when the next job is reviewing or managing existing records in the shared workspace.',
          targetId: 'dashboard-open-records',
        },
        {
          id: 'dashboard-create-record',
          title: 'Create a record immediately',
          body: 'This shortcut opens the create flow directly from the dashboard when a user needs to log a new lead or contact quickly.',
          targetId: 'dashboard-create-record',
          placement: 'top',
        },
      ],
    }),
    [],
  );

  usePageGuide(guide);

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
