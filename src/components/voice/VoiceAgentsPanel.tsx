import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useCrmWorkspace } from '../../hooks/useCrmWorkspace';
import type {
  VoiceAgentBindingRecord,
  VoiceAgentMappingInput,
  VoiceAgentMappingRecord,
  VoiceAgentRecord,
  VoiceAgentSummary,
  VoiceAgentTelnyxOptions,
  VoiceAgentUpdateInput,
} from '../../lib/voice-agent-service';
import {
  bindVoiceAgentNumber,
  deleteVoiceAgent,
  getVoiceAgent,
  listVoiceAgentTelnyxOptions,
  listVoiceAgents,
  setVoiceAgentMappings,
  VoiceAgentServiceError,
  updateVoiceAgent,
} from '../../lib/voice-agent-service';
import type { VoiceNumberRecord } from '../../lib/voice-service';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { SectionSkeleton } from '../ui/SectionSkeleton';
import { type VoiceAgentFormValues, createEmptyVoiceAgentFormValues } from './VoiceAgentForm';
import { VoiceAgentBindingsEditor } from './VoiceAgentBindingsEditor';
import { VoiceAgentFieldMappingEditor } from './VoiceAgentFieldMappingEditor';
import { VoiceAgentFormDrawer } from './VoiceAgentFormDrawer';
import type { Session } from '@supabase/supabase-js';

interface VoiceAgentsPanelProps {
  session: Session;
  workspaceId: string;
  numbers: VoiceNumberRecord[];
  numbersLoading: boolean;
  numbersError: string;
}

export function VoiceAgentsPanel({
  session,
  workspaceId,
  numbers,
  numbersLoading,
  numbersError,
}: VoiceAgentsPanelProps) {
  const { config, configError, configLoading, configRefreshing } = useCrmWorkspace();
  const [agents, setAgents] = useState<VoiceAgentSummary[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    agent: VoiceAgentRecord;
    bindings: VoiceAgentBindingRecord[];
    mappings: VoiceAgentMappingRecord[];
  } | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [submittingAgent, setSubmittingAgent] = useState(false);
  const [savingMappings, setSavingMappings] = useState(false);
  const [savingBindingNumberId, setSavingBindingNumberId] = useState<string | null>(null);
  const [deletingAgent, setDeletingAgent] = useState(false);
  const [agentErrorMessage, setAgentErrorMessage] = useState('');
  const [agentActivationIssues, setAgentActivationIssues] = useState<string[]>([]);
  const [telnyxOptions, setTelnyxOptions] = useState<VoiceAgentTelnyxOptions | null>(null);
  const [telnyxOptionsLoading, setTelnyxOptionsLoading] = useState(false);
  const [telnyxOptionsError, setTelnyxOptionsError] = useState('');
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [editDraftValues, setEditDraftValues] = useState<VoiceAgentFormValues>(createEmptyVoiceAgentFormValues);

  const readyNumbers = useMemo(
    () =>
      numbers.filter(
        (number) =>
          number.is_active && number.provisioning_status === 'active' && number.webhook_status === 'ready' && !number.released_at,
      ),
    [numbers],
  );

  async function loadAgents(nextSelectedAgentId?: string | null) {
    setListLoading(true);
    setListError('');

    try {
      const response = await listVoiceAgents(session, workspaceId);
      setAgents(response.agents);

      const requestedSelection = nextSelectedAgentId ?? selectedAgentId;

      if (requestedSelection && response.agents.some((agent) => agent.id === requestedSelection)) {
        setSelectedAgentId(requestedSelection);
      } else if (response.agents[0]) {
        setSelectedAgentId(response.agents[0].id);
      } else {
        setSelectedAgentId(null);
        setDetail(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load voice assistants.';
      setListError(message);
    } finally {
      setListLoading(false);
    }
  }

  async function loadAgentDetail(voiceAgentId: string) {
    setDetailLoading(true);

    try {
      const response = await getVoiceAgent(session, workspaceId, voiceAgentId);
      setDetail(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load assistant details.';
      toast.error(message);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void loadAgents();
  }, [session, workspaceId]);

  useEffect(() => {
    let cancelled = false;

    async function loadTelnyxOptions() {
      setTelnyxOptionsLoading(true);
      setTelnyxOptionsError('');

      try {
        const response = await listVoiceAgentTelnyxOptions(session, workspaceId);

        if (cancelled) {
          return;
        }

        setTelnyxOptions(response.options);
        setTelnyxOptionsError(response.warnings?.join(' ') ?? '');
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Unable to load Telnyx options.';
        setTelnyxOptionsError(message);
      } finally {
        if (!cancelled) {
          setTelnyxOptionsLoading(false);
        }
      }
    }

    void loadTelnyxOptions();

    return () => {
      cancelled = true;
    };
  }, [session, workspaceId]);

  useEffect(() => {
    setAgentErrorMessage('');
    setAgentActivationIssues([]);

    if (!selectedAgentId) {
      setDetail(null);
      return;
    }

    void loadAgentDetail(selectedAgentId);
  }, [selectedAgentId]);

  async function handleUpdateAgent(values: VoiceAgentFormValues) {
    if (!detail) {
      return;
    }

    setSubmittingAgent(true);
    setAgentErrorMessage('');
    setAgentActivationIssues([]);

    try {
      const payload: VoiceAgentUpdateInput = {
        workspace_id: workspaceId,
        voice_agent_id: detail.agent.id,
        name: values.name,
        description: values.description || null,
        greeting: values.greeting,
        system_prompt: values.system_prompt,
        telnyx_model: values.telnyx_model,
        telnyx_voice: values.telnyx_voice,
        telnyx_transcription_model: values.telnyx_transcription_model,
        telnyx_language: values.telnyx_language,
        source_id: values.source_id || null,
        status: values.status,
      };
      const response = await updateVoiceAgent(session, payload);
      const normalizedVoice = response.agent.telnyx_voice.replace(/^Telnyx\.KokoroTTS\./, '').trim() || 'af';
      setDetail((current) => (current ? { ...current, agent: response.agent } : current));
      toast.success('Voice assistant updated.');
      setAgentErrorMessage('');
      setAgentActivationIssues([]);
      setEditDraftValues({
        name: response.agent.name,
        description: response.agent.description ?? '',
        greeting: response.agent.greeting,
        system_prompt: response.agent.system_prompt,
        telnyx_model: response.agent.telnyx_model,
        telnyx_voice: normalizedVoice,
        telnyx_transcription_model: response.agent.telnyx_transcription_model,
        telnyx_language: response.agent.telnyx_language,
        source_id: response.agent.source_id ?? '',
        status: response.agent.status,
      });
      setIsEditDrawerOpen(false);
      await loadAgents(response.agent.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save voice assistant.';
      setAgentErrorMessage(message);
      setAgentActivationIssues(error instanceof VoiceAgentServiceError ? error.activationIssues : []);
      toast.error(message);
    } finally {
      setSubmittingAgent(false);
    }
  }

  function handleOpenEditDrawer() {
    if (!detail) {
      return;
    }

    setAgentErrorMessage('');
    setAgentActivationIssues([]);
    const normalizedVoice = detail.agent.telnyx_voice.replace(/^Telnyx\.KokoroTTS\./, '').trim() || 'af';
    setEditDraftValues({
      name: detail.agent.name,
      description: detail.agent.description ?? '',
      greeting: detail.agent.greeting,
      system_prompt: detail.agent.system_prompt,
      telnyx_model: detail.agent.telnyx_model,
      telnyx_voice: normalizedVoice,
      telnyx_transcription_model: detail.agent.telnyx_transcription_model,
      telnyx_language: detail.agent.telnyx_language,
      source_id: detail.agent.source_id ?? '',
      status: detail.agent.status,
    });
    setIsEditDrawerOpen(true);
  }

  function handleCloseEditDrawer() {
    if (submittingAgent) {
      return;
    }

    setAgentErrorMessage('');
    setAgentActivationIssues([]);
    setIsEditDrawerOpen(false);
  }

  async function handleSaveMappings(mappings: VoiceAgentMappingInput[]) {
    if (!detail) {
      return;
    }

    setSavingMappings(true);

    try {
      const response = await setVoiceAgentMappings(session, {
        workspace_id: workspaceId,
        voice_agent_id: detail.agent.id,
        mappings,
      });
      setDetail((current) => (current ? { ...current, mappings: response.mappings } : current));
      toast.success('Assistant mappings saved.');
      await loadAgents(detail.agent.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save mappings.';
      toast.error(message);
    } finally {
      setSavingMappings(false);
    }
  }

  async function handleToggleBinding(workspacePhoneNumberId: string, nextActive: boolean) {
    if (!detail) {
      return;
    }

    setSavingBindingNumberId(workspacePhoneNumberId);

    try {
      const response = await bindVoiceAgentNumber(session, {
        workspace_id: workspaceId,
        voice_agent_id: detail.agent.id,
        workspace_phone_number_id: workspacePhoneNumberId,
        is_active: nextActive,
      });

      setDetail((current) => {
        if (!current) {
          return current;
        }

        const remaining = current.bindings.filter((binding) => binding.workspace_phone_number_id !== workspacePhoneNumberId);
        return {
          ...current,
          bindings: [...remaining, response.binding],
        };
      });

      toast.success(nextActive ? 'Assistant bound to number.' : 'Assistant binding deactivated.');
      await loadAgents(detail.agent.id);
      await loadAgentDetail(detail.agent.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update binding.';
      toast.error(message);
    } finally {
      setSavingBindingNumberId(null);
    }
  }

  async function handleDeleteAgent() {
    if (!detail || deletingAgent) {
      return;
    }

    const confirmed = window.confirm(
      `Delete assistant "${detail.agent.name}"? This will also delete the linked Telnyx assistant when present.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingAgent(true);

    try {
      await deleteVoiceAgent(session, {
        workspace_id: workspaceId,
        voice_agent_id: detail.agent.id,
      });
      toast.success('Voice assistant deleted.');
      setIsEditDrawerOpen(false);
      setDetail(null);
      setSelectedAgentId(null);
      await loadAgents(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete voice assistant.';
      toast.error(message);
    } finally {
      setDeletingAgent(false);
    }
  }

  if (listLoading) {
    return <SectionSkeleton title="Voice assistants" rows={5} />;
  }

  return (
    <div className="space-y-6">
      {configRefreshing ? (
        <Card className="p-4 text-sm text-slate-600">Refreshing CRM field metadata in the background...</Card>
      ) : null}

      {listError ? (
        <Card className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{listError}</Card>
      ) : null}

      {configError ? (
        <Card className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{configError}</Card>
      ) : null}

      {/* <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-emerald-200">Assistants</div>
            <h2 className="mt-2 font-display text-3xl text-slate-900">AI assistant configuration and binding</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Create workspace assistants, define their collected fields, map those fields safely into CRM, and bind
              assistants to ready voice numbers.
            </p>
          </div>

          <Link
            to="/voice/assistants/new"
            className="inline-flex items-center rounded-xl border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            New assistant
          </Link>
        </div>

        {configRefreshing ? (
          <div className="mt-4 text-sm text-slate-600">Refreshing CRM field metadata in the background...</div>
        ) : null}

        {listError ? <div className="mt-4 text-sm text-rose-300">{listError}</div> : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => setSelectedAgentId(agent.id)}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                selectedAgentId === agent.id
                  ? 'border-accent-blue/40 bg-accent-blue/10 text-slate-900'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-200 hover:text-slate-900'
              }`}
            >
              <div className="font-medium">{agent.name}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">{agent.status}</div>
              <div className="mt-2 text-xs text-slate-600">{agent.active_bindings.length} active binding(s)</div>
              <div className="mt-1 text-xs text-slate-500">Telnyx: {agent.telnyx_sync_status}</div>
            </button>
          ))}

          {agents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 px-4 py-3 text-sm text-slate-600">
              No assistants yet. Create the first draft assistant to start Phase 2.
            </div>
          ) : null}
        </div>
      </Card> */}

      {detailLoading ? <SectionSkeleton title="Assistant details" rows={5} /> : null}

      {detail ? (
        <>
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-accent-blue">Selected assistant</div>
                <h3 className="mt-2 font-display text-2xl text-slate-900">{detail.agent.name}</h3>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                  Manage CRM mappings and ready-number bindings below. Use edit to update the assistant setup in a side drawer.
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
                  <span className="rounded-full border border-slate-300 bg-white px-3 py-1">
                    Telnyx sync: {detail.agent.telnyx_sync_status}
                  </span>
                  {detail.agent.telnyx_assistant_id ? (
                    <span className="rounded-full border border-slate-300 bg-white px-3 py-1">
                      Assistant ID: {detail.agent.telnyx_assistant_id}
                    </span>
                  ) : null}
                </div>
                {detail.agent.telnyx_sync_error ? (
                  <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {detail.agent.telnyx_sync_error}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs uppercase tracking-[0.24em] text-slate-700">
                  {detail.agent.status}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleDeleteAgent}
                  loading={deletingAgent}
                  className="border border-rose-300/40 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
                >
                  Delete assistant
                </Button>
                <Button type="button" variant="secondary" onClick={handleOpenEditDrawer}>
                  Edit assistant
                </Button>
              </div>
            </div>
          </Card>

          {configLoading && !config ? (
            <SectionSkeleton title="Field mappings" rows={4} />
          ) : (
            <VoiceAgentFieldMappingEditor
              mappings={detail.mappings}
              customFields={config?.customFields ?? []}
              saving={savingMappings}
              onSave={handleSaveMappings}
            />
          )}

          <VoiceAgentBindingsEditor
            numbers={readyNumbers}
            bindings={detail.bindings}
            allAgents={agents}
            loading={numbersLoading}
            error={numbersError}
            savingNumberId={savingBindingNumberId}
            onToggleBinding={handleToggleBinding}
          />
        </>
      ) : agents.length === 0 ? (
        <Card className="p-6 text-sm leading-7 text-slate-600">
          No assistants yet. Open <span className="text-slate-900">New assistant</span> to create your first assistant.
        </Card>
      ) : null}

      <VoiceAgentFormDrawer
        isOpen={isEditDrawerOpen}
        mode="edit"
        agent={detail?.agent ?? null}
        sources={config?.sources ?? []}
        submitting={submittingAgent}
        errorMessage={agentErrorMessage}
        activationIssues={agentActivationIssues}
        telnyxOptions={telnyxOptions}
        telnyxOptionsLoading={telnyxOptionsLoading}
        telnyxOptionsError={telnyxOptionsError}
        values={editDraftValues}
        onValuesChange={setEditDraftValues}
        onClose={handleCloseEditDrawer}
        onSubmit={handleUpdateAgent}
      />
    </div>
  );
}
