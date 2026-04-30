import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { PhoneIncoming, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { AppPageGuide } from '../context/AppGuideContext';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { PageHeader } from '../components/dashboard/PageHeader';
import { VoiceNumberTable } from '../components/voice/VoiceNumberTable';
import { Card } from '../components/ui/Card';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { SectionSkeleton } from '../components/ui/SectionSkeleton';
import { useAuth } from '../hooks/useAuth';
import { usePageGuide } from '../hooks/useAppGuide';
import { isWorkspaceOwner } from '../lib/utils';
import type { VoiceNumberRecord } from '../lib/voice-service';
import { getCachedVoiceNumbers, listVoiceNumbers, reconcileVoiceNumber, updateVoiceNumber } from '../lib/voice-service';

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
  const { session, workspace, signOut } = useAuth();
  const cachedNumbers = workspace ? getCachedVoiceNumbers(workspace.id, true)?.numbers ?? [] : [];
  const [numbers, setNumbers] = useState<VoiceNumberRecord[]>(cachedNumbers);
  const [drafts, setDrafts] = useState<Record<string, { label: string; is_active: boolean }>>(() => createDraftMap(cachedNumbers));
  const [numbersLoading, setNumbersLoading] = useState(!workspace || cachedNumbers.length === 0);
  const [numbersError, setNumbersError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const numbersRequestIdRef = useRef(0);

  const isOwner = isWorkspaceOwner(workspace);
  const readyCount = numbers.filter((number) => number.webhook_status === 'ready').length;
  const activeCount = numbers.filter((number) => number.is_active).length;
  const guide = useMemo<AppPageGuide>(
    () => ({
      key: 'voice-numbers',
      title: 'Manage provisioned voice numbers',
      summary:
        'This page is the inventory view for all workspace numbers. Users can label them, toggle active status, and reconcile provisioning state from one place.',
      nextStep:
        numbers.length === 0
          ? 'Provision a new number first so the workspace has a live inbound line.'
          : 'Review status and labels here, then jump into assistants or provisioning when the routing setup changes.',
      highlights: ['Provisioned inventory', 'Webhook status', 'Assistant handoff'],
      autoStart: 'once' as const,
      steps: [
        {
          id: 'voice-numbers-new',
          title: 'Provision another number',
          body: 'Use this when the workspace needs a new inbound line for a region, campaign, or business unit.',
          targetId: 'voice-numbers-new',
        },
        {
          id: 'voice-numbers-table',
          title: 'Manage the current inventory',
          body: 'Each row in the table lets the team update labels, toggle active status, and reconcile number state without leaving the voice workspace.',
          targetId: 'voice-numbers-table',
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
        setDrafts({});
        setNumbersLoading(false);
        setNumbersError('');
      }
      return;
    }

    const cachedResponse = getCachedVoiceNumbers(workspace.id, true);

    if (numbersRequestIdRef.current === requestId) {
      if (cachedResponse?.numbers) {
        setNumbers(cachedResponse.numbers);
        setDrafts(createDraftMap(cachedResponse.numbers));
      }
      setNumbersLoading(!cachedResponse?.numbers?.length);
      setNumbersError('');
    }

    try {
      const response = await listVoiceNumbers(session, workspace.id, true);
      if (numbersRequestIdRef.current === requestId) {
        setNumbers(response.numbers);
        setDrafts(createDraftMap(response.numbers));
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
                data-guide-id="voice-numbers-new"
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
          <Card className="relative overflow-hidden border border-slate-200/90 bg-gradient-to-br from-white via-slate-50 to-indigo-50/45 p-5 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.55)]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-indigo-200/35 blur-2xl"
            />
            <div className="relative">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600">
                  <PhoneIncoming className="h-4 w-4" />
                </span>
                Active numbers
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="font-display text-3xl text-slate-900">{activeCount}</div>
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-700">
                  live lines
                </span>
              </div>
            </div>
          </Card>
          <Card className="relative overflow-hidden border border-slate-200/90 bg-gradient-to-br from-white via-slate-50 to-sky-50/45 p-5 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.55)]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-8 -top-12 h-28 w-28 rounded-full bg-sky-200/35 blur-2xl"
            />
            <div className="relative">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                Webhook ready
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="font-display text-3xl text-slate-900">{readyCount}</div>
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                  routing ok
                </span>
              </div>
            </div>
          </Card>
        </div>

        {numbersLoading ? (
          <SectionSkeleton title="Voice numbers" rows={5} />
        ) : numbersError ? (
          <Card className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{numbersError}</Card>
        ) : (
          <div data-guide-id="voice-numbers-table">
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
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
