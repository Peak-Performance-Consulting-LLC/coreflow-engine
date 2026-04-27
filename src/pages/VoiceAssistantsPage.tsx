import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { AppPageGuide } from '../context/AppGuideContext';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { PageHeader } from '../components/dashboard/PageHeader';
import { VoiceAgentsPanel } from '../components/voice/VoiceAgentsPanel';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { useAuth } from '../hooks/useAuth';
import { usePageGuide } from '../hooks/useAppGuide';
import { isWorkspaceOwner } from '../lib/utils';
import type { VoiceNumberRecord } from '../lib/voice-service';
import { listVoiceNumbers } from '../lib/voice-service';

export function VoiceAssistantsPage() {
  const navigate = useNavigate();
  const { session, workspace, signOut } = useAuth();
  const [numbers, setNumbers] = useState<VoiceNumberRecord[]>([]);
  const [numbersLoading, setNumbersLoading] = useState(true);
  const [numbersError, setNumbersError] = useState('');
  const numbersRequestIdRef = useRef(0);

  const isOwner = isWorkspaceOwner(workspace);
  const guide = useMemo<AppPageGuide>(
    () => ({
      key: 'voice-assistants',
      title: 'Manage workspace assistants',
      summary:
        'This page is the shared control center for voice assistants, number bindings, and CRM field mappings used during inbound call handling.',
      nextStep:
        numbers.length === 0
          ? 'Create an assistant first, then provision or bind a number when you are ready to route live calls.'
          : 'Review the existing assistant setup and create a new assistant when a workflow needs its own call-handling logic.',
      highlights: ['Assistant inventory', 'Number bindings', 'CRM mapping control'],
      autoStart: 'once' as const,
      steps: [
        {
          id: 'voice-assistants-new',
          title: 'Create a new assistant',
          body: 'Use this when the workspace needs a separate greeting, call flow, or routing policy for a specific workflow.',
          targetId: 'voice-assistants-new',
        },
        {
          id: 'voice-assistants-panel',
          title: 'Review assistant setup in one place',
          body: 'The assistants panel centralizes configuration, bindings, and CRM mappings so the voice workspace stays manageable.',
          targetId: 'voice-assistants-panel',
          placement: 'top',
        },
      ],
    }),
    [numbers.length],
  );

  usePageGuide(guide);

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  async function loadNumbers() {
    const requestId = numbersRequestIdRef.current + 1;
    numbersRequestIdRef.current = requestId;

    if (!session || !workspace || !isOwner) {
      if (numbersRequestIdRef.current === requestId) {
        setNumbers([]);
        setNumbersLoading(false);
        setNumbersError('');
      }
      return;
    }

    if (numbersRequestIdRef.current === requestId) {
      setNumbersLoading(true);
      setNumbersError('');
    }

    try {
      const response = await listVoiceNumbers(session, workspace.id, true);
      if (numbersRequestIdRef.current === requestId) {
        setNumbers(response.numbers);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load voice numbers.';
      if (numbersRequestIdRef.current === requestId) {
        setNumbersError(message);
      }
    } finally {
      if (numbersRequestIdRef.current === requestId) {
        setNumbersLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadNumbers();
  }, [session, workspace?.id, isOwner]);

  if (!session || !workspace) {
    return <FullPageLoader label="Loading voice assistants..." />;
  }

  if (!isOwner) {
    return <Navigate to={`/dashboard/${workspace.crmType}`} replace />;
  }

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={handleSignOut}>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Voice workspace"
          title="Assistants"
          description="Create and manage assistants, mappings, and number bindings in a dedicated workspace area."
          actions={(
            <>
              <Link
                to="/voice/numbers"
                className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Provisioned numbers
              </Link>
              <Link
                to="/voice/assistants/new"
                data-guide-id="voice-assistants-new"
                className="inline-flex items-center rounded-xl border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                New assistant
              </Link>
            </>
          )}
        />

        <div data-guide-id="voice-assistants-panel">
          <VoiceAgentsPanel
            session={session}
            workspaceId={workspace.id}
            workspaceCrmType={workspace.crmType}
            numbers={numbers}
            numbersLoading={numbersLoading}
            numbersError={numbersError}
          />
        </div>
      </div>
    </WorkspaceLayout>
  );
}
