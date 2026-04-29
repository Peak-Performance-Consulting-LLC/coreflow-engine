import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DashboardShell } from '../components/dashboard/DashboardShell';
import type { AppPageGuide } from '../context/AppGuideContext';
import { useAuth } from '../hooks/useAuth';
import { usePageGuide } from '../hooks/useAppGuide';
import { getAccountSettings } from '../lib/account-service';
import { isWorkspaceOwner } from '../lib/utils';
import { listVoiceAgents } from '../lib/voice-agent-service';
import { listVoiceNumbers } from '../lib/voice-service';

const dashboardSetupPopupWorkspaceIdKey = 'coreflow.dashboard.setup-popup-workspace-id';

interface DashboardSetupAction {
  id: string;
  title: string;
  description: string;
  to: string;
  configured: boolean;
  actionLabel: string;
}

function hasConfiguredWorkspaceEmailSender(
  senders: Array<{
    status: 'pending' | 'connected' | 'failed' | 'disabled';
    is_active: boolean;
  }>,
) {
  return senders.some((sender) => sender.is_active && sender.status === 'connected');
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { session, workspace, signOut } = useAuth();
  const [setupActions, setSetupActions] = useState<DashboardSetupAction[]>([]);
  const [setupActionsLoading, setSetupActionsLoading] = useState(false);
  const [setupActionsReady, setSetupActionsReady] = useState(false);
  const [showSetupPopup, setShowSetupPopup] = useState(false);
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

  useEffect(() => {
    let cancelled = false;

    async function loadSetupActions() {
      if (!session || !workspace || !isWorkspaceOwner(workspace)) {
        setSetupActions([]);
        setSetupActionsLoading(false);
        setSetupActionsReady(true);
        return;
      }

      setSetupActionsReady(false);
      setSetupActionsLoading(true);

      const [numbersResult, assistantsResult, accountResult] = await Promise.allSettled([
        listVoiceNumbers(session, workspace.id, true),
        listVoiceAgents(session, workspace.id),
        getAccountSettings(session, workspace.id),
      ]);

      const actions: DashboardSetupAction[] = [];

      if (numbersResult.status === 'fulfilled') {
        const hasPurchasedNumber = numbersResult.value.numbers.some((number) => number.provisioning_status !== 'released');
        actions.push({
          id: 'setup-number',
          title: 'Configure voice number',
          description: 'Get a number to receive inbound calls.',
          to: hasPurchasedNumber ? '/voice/numbers' : '/voice/numbers/new',
          configured: hasPurchasedNumber,
          actionLabel: 'Set up number',
        });
      }

      if (assistantsResult.status === 'fulfilled') {
        const hasAssistant = assistantsResult.value.agents.length > 0;
        actions.push({
          id: 'setup-assistant',
          title: 'Create assistant',
          description: 'Set up AI to answer calls and capture details.',
          to: hasAssistant ? '/voice/assistants' : '/voice/assistants/new',
          configured: hasAssistant,
          actionLabel: 'Create assistant',
        });
      }

      if (accountResult.status === 'fulfilled') {
        const hasEmailConfig = hasConfiguredWorkspaceEmailSender(accountResult.value.senders);
        actions.push({
          id: 'setup-email',
          title: 'Configure email',
          description: 'Enable invitations and automation emails.',
          to: '/email',
          configured: hasEmailConfig,
          actionLabel: 'Connect email',
        });
      }

      if (!cancelled) {
        setSetupActions(actions);
        setSetupActionsLoading(false);
        setSetupActionsReady(true);
      }
    }

    void loadSetupActions();

    return () => {
      cancelled = true;
    };
  }, [session, workspace]);

  useEffect(() => {
    if (typeof window === 'undefined' || !workspace || setupActionsLoading || !setupActionsReady) {
      return;
    }

    const flaggedWorkspaceId = window.sessionStorage.getItem(dashboardSetupPopupWorkspaceIdKey);

    if (flaggedWorkspaceId !== workspace.id) {
      return;
    }

    const missingSetup = setupActions.filter((action) => !action.configured);
    if (missingSetup.length > 0) {
      setShowSetupPopup(true);
    }

    window.sessionStorage.removeItem(dashboardSetupPopupWorkspaceIdKey);
  }, [workspace, setupActionsLoading, setupActionsReady, setupActions]);

  if (!workspace) {
    return null;
  }

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  return (
    <DashboardShell
      workspace={workspace}
      onSignOut={handleSignOut}
      setupActions={setupActions}
      setupActionsLoading={setupActionsLoading}
      showSetupPopup={showSetupPopup}
      onCloseSetupPopup={() => setShowSetupPopup(false)}
    />
  );
}
