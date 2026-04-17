import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { PhoneIncoming, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { PageHeader } from '../components/dashboard/PageHeader';
import { VoiceNumberTable } from '../components/voice/VoiceNumberTable';
import { Card } from '../components/ui/Card';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { SectionSkeleton } from '../components/ui/SectionSkeleton';
import { useAuth } from '../hooks/useAuth';
import type { VoiceNumberRecord } from '../lib/voice-service';
import { listVoiceNumbers, reconcileVoiceNumber, updateVoiceNumber } from '../lib/voice-service';

function createDraftMap(numbers: VoiceNumberRecord[]) {
  return Object.fromEntries(
    numbers.map((number) => [
      number.id,
      {
        label: number.label ?? '',
        is_active: number.is_active,
      },
    ]),
  );
}

export function VoiceNumbersPage() {
  const navigate = useNavigate();
  const { session, workspace, signOut, user } = useAuth();
  const [numbers, setNumbers] = useState<VoiceNumberRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { label: string; is_active: boolean }>>({});
  const [numbersLoading, setNumbersLoading] = useState(true);
  const [numbersError, setNumbersError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);

  const isOwner = Boolean(workspace && user && workspace.ownerId === user.id);
  const readyCount = numbers.filter((number) => number.webhook_status === 'ready').length;
  const activeCount = numbers.filter((number) => number.is_active).length;

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  async function loadNumbers() {
    if (!session || !workspace || !isOwner) {
      setNumbers([]);
      setDrafts({});
      setNumbersLoading(false);
      return;
    }

    setNumbersLoading(true);
    setNumbersError('');

    try {
      const response = await listVoiceNumbers(session, workspace.id, true);
      setNumbers(response.numbers);
      setDrafts(createDraftMap(response.numbers));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load voice numbers.';
      setNumbersError(message);
    } finally {
      setNumbersLoading(false);
    }
  }

  useEffect(() => {
    void loadNumbers();
  }, [session, workspace?.id, isOwner]);

  function updateDraft(voiceNumberId: string, patch: Partial<{ label: string; is_active: boolean }>) {
    setDrafts((current) => ({
      ...current,
      [voiceNumberId]: {
        label: current[voiceNumberId]?.label ?? numbers.find((item) => item.id === voiceNumberId)?.label ?? '',
        is_active:
          current[voiceNumberId]?.is_active ?? numbers.find((item) => item.id === voiceNumberId)?.is_active ?? false,
        ...patch,
      },
    }));
  }

  async function handleSaveNumber(voiceNumberId: string) {
    if (!session || !workspace) {
      return;
    }

    const draft = drafts[voiceNumberId];
    if (!draft) {
      return;
    }

    setSavingId(voiceNumberId);

    try {
      const response = await updateVoiceNumber(session, {
        workspace_id: workspace.id,
        voice_number_id: voiceNumberId,
        label: draft.label,
        is_active: draft.is_active,
      });
      setNumbers((current) => current.map((item) => (item.id === voiceNumberId ? response.number : item)));
      setDrafts((current) => ({
        ...current,
        [voiceNumberId]: {
          label: response.number.label ?? '',
          is_active: response.number.is_active,
        },
      }));
      toast.success('Voice number updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update voice number.';
      toast.error(message);
    } finally {
      setSavingId(null);
    }
  }

  async function handleReconcileNumber(voiceNumberId: string) {
    if (!session || !workspace) {
      return;
    }

    setReconcilingId(voiceNumberId);

    try {
      const response = await reconcileVoiceNumber(session, {
        workspace_id: workspace.id,
        voice_number_id: voiceNumberId,
      });
      setNumbers((current) => current.map((item) => (item.id === voiceNumberId ? response.number : item)));
      setDrafts((current) => ({
        ...current,
        [voiceNumberId]: {
          label: response.number.label ?? '',
          is_active: response.number.is_active,
        },
      }));
      toast.success(response.provisioningInProgress ? 'Provisioning is already in progress.' : 'Voice number status refreshed.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reconcile voice number.';
      toast.error(message);
    } finally {
      setReconcilingId(null);
    }
  }

  if (!session || !workspace) {
    return <FullPageLoader label="Loading voice numbers..." />;
  }

  if (!isOwner) {
    return <Navigate to={`/dashboard/${workspace.crmType}`} replace />;
  }

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={handleSignOut}>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Voice workspace"
          title="Provisioned numbers"
          description="Manage purchased numbers, routing state, labels, and active status from a dedicated inventory page."
          actions={(
            <>
              <Link
                to="/voice/numbers/new"
                className="inline-flex items-center rounded-xl border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                New number
              </Link>
              <Link
                to="/voice/assistants"
                className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Assistants
              </Link>
            </>
          )}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <PhoneIncoming className="h-4 w-4 text-indigo-500" />
              Active numbers
            </div>
            <div className="mt-2 font-display text-3xl text-slate-900">{activeCount}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <ShieldCheck className="h-4 w-4 text-indigo-500" />
              Webhook ready
            </div>
            <div className="mt-2 font-display text-3xl text-slate-900">{readyCount}</div>
          </Card>
        </div>

        {numbersLoading ? (
          <SectionSkeleton title="Voice numbers" rows={5} />
        ) : numbersError ? (
          <Card className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{numbersError}</Card>
        ) : (
          <VoiceNumberTable
            numbers={numbers}
            drafts={drafts}
            savingId={savingId}
            reconcilingId={reconcilingId}
            onLabelChange={(voiceNumberId, label) => updateDraft(voiceNumberId, { label })}
            onActiveChange={(voiceNumberId, isActive) => updateDraft(voiceNumberId, { is_active: isActive })}
            onSave={handleSaveNumber}
            onReconcile={handleReconcileNumber}
          />
        )}
      </div>
    </WorkspaceLayout>
  );
}
