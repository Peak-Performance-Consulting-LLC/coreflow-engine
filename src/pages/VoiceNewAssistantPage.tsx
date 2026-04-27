import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Bot, Database, MessageSquareText, Settings2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { AppPageGuide } from '../context/AppGuideContext';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { AssistantAIGeneratorModal } from '../components/voice/AssistantAIGeneratorModal';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { SectionSkeleton } from '../components/ui/SectionSkeleton';
import { useAuth } from '../hooks/useAuth';
import { usePageGuide } from '../hooks/useAppGuide';
import { useCrmWorkspace } from '../hooks/useCrmWorkspace';
import { sanitizeVoiceAssistantFallbackReason } from '../lib/voice-assistant-ai-service';
import {
  createVoiceAgent,
  listVoiceAgentTelnyxOptions,
  type VoiceAgentCreateInput,
  type VoiceAgentStatus,
  type VoiceAgentTelnyxOptions,
  VoiceAgentServiceError,
} from '../lib/voice-agent-service';
import { formatCrmLabel, isWorkspaceOwner } from '../lib/utils';
import type { GeneratedAssistantContent } from '../types/voice-assistant-ai';

interface VoiceAgentFormValues {
  name: string;
  description: string;
  greeting: string;
  system_prompt: string;
  telnyx_model: string;
  telnyx_voice: string;
  telnyx_transcription_model: string;
  telnyx_language: string;
  source_id: string;
  status: VoiceAgentStatus;
}

const DEFAULT_FORM_VALUES: VoiceAgentFormValues = {
  name: '',
  description: '',
  greeting: '',
  system_prompt: '',
  telnyx_model: 'qwen/qwen3',
  telnyx_voice: 'af',
  telnyx_transcription_model: 'deepgram/nova-3',
  telnyx_language: 'en-US',
  source_id: '',
  status: 'draft',
};

const FIELD_LABEL_CLASS = 'text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500';
const FIELD_CONTROL_CLASS =
  'h-11 w-full rounded-xl border border-slate-600 bg-white px-3 text-sm text-slate-900 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const TEXTAREA_CLASS =
  'w-full rounded-xl border border-slate-600 bg-white px-3 py-3 text-sm text-slate-900 transition placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const AI_BUTTON_CLASS = 'ai-cta-button';
const LOCKED_ENGINE_NOTE = 'These engine defaults are locked for every assistant and cannot be edited here.';

function createEmptyVoiceAgentFormValues() {
  return { ...DEFAULT_FORM_VALUES };
}

function getSourceDisplayLabel(sourceId: string, sources: Array<{ id: string; name: string }>) {
  if (!sourceId) {
    return 'Inbound-call fallback';
  }

  return sources.find((source) => source.id === sourceId)?.name ?? sourceId;
}

function mergeOptions(currentValue: string, options?: string[]) {
  const seen = new Set<string>();
  const merged = [currentValue, ...(options ?? [])].filter(Boolean);

  return merged.filter((value) => {
    const normalized = value.trim().toLowerCase();

    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

interface SelectFieldProps {
  label: string;
  value: string;
  options?: string[];
  onChange?: (value: string) => void;
  disabled?: boolean;
}

function SelectField({ label, value, options, onChange, disabled = false }: SelectFieldProps) {
  const selectOptions = mergeOptions(value, options);

  return (
    <label className="flex flex-col gap-2">
      <span className={FIELD_LABEL_CLASS}>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className={`${FIELD_CONTROL_CLASS} ${disabled ? 'cursor-not-allowed bg-slate-50 text-slate-600' : ''}`}
      >
        {selectOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function VoiceNewAssistantPage() {
  const navigate = useNavigate();
  const { session, workspace, signOut } = useAuth();
  const { config, configLoading, configError, configRefreshing } = useCrmWorkspace();
  const [values, setValues] = useState<VoiceAgentFormValues>(createEmptyVoiceAgentFormValues);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [activationIssues, setActivationIssues] = useState<string[]>([]);
  const [telnyxOptions, setTelnyxOptions] = useState<VoiceAgentTelnyxOptions | null>(null);
  const [telnyxOptionsLoading, setTelnyxOptionsLoading] = useState(false);
  const [telnyxOptionsError, setTelnyxOptionsError] = useState('');
  const [isAiGeneratorOpen, setIsAiGeneratorOpen] = useState(false);
  const [lastGeneratedContent, setLastGeneratedContent] = useState<GeneratedAssistantContent | null>(null);

  const isOwner = isWorkspaceOwner(workspace);
  const sourceLabel = getSourceDisplayLabel(values.source_id, config?.sources ?? []);
  const fallbackReasonDetail = sanitizeVoiceAssistantFallbackReason(lastGeneratedContent?.fallbackReason);
  const hasDedicatedSource = Boolean(values.source_id);

  const guide = useMemo<AppPageGuide>(
    () => ({
      key: 'voice-new-assistant',
      title: 'Create a voice assistant',
      summary:
        'This page creates the assistant configuration used for inbound call handling. Users can draft manually or use AI Setup to generate a structured starting point.',
      nextStep:
        values.system_prompt.trim().length > 0
          ? 'Review the assistant name, greeting, and system prompt, then save when the workflow looks ready.'
          : 'Start with AI Setup for guided generation, or fill the fields manually if the call flow is already defined.',
      highlights: ['AI-assisted draft', 'Manual editing', 'Telnyx-ready setup'],
      autoStart: 'once' as const,
      steps: [
        {
          id: 'voice-assistant-ai',
          title: 'Generate a first draft with AI',
          body: 'AI Setup is the quickest way to produce a structured greeting and prompt for the assistant without writing from scratch.',
          targetId: 'voice-assistant-ai-setup',
        },
        {
          id: 'voice-assistant-name',
          title: 'Name the assistant clearly',
          body: 'Give the assistant an operational name the team can recognize later in assistant lists, bindings, and voice review queues.',
          targetId: 'voice-assistant-name',
        },
        {
          id: 'voice-assistant-prompt',
          title: 'Review the call behavior prompt',
          body: 'The system prompt controls what the assistant says, what it collects, and how it decides to route, transfer, or close the call.',
          targetId: 'voice-assistant-system-prompt',
        },
        {
          id: 'voice-assistant-save',
          title: 'Save the assistant into the workspace',
          body: 'Saving creates the workspace assistant and stores the configuration that future inbound call handling can use.',
          targetId: 'voice-assistant-submit',
          placement: 'top',
        },
      ],
    }),
    [values.system_prompt],
  );

  usePageGuide(guide);

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  async function handleCreateAssistant() {
    if (!session || !workspace) {
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setActivationIssues([]);

    try {
      const payload: VoiceAgentCreateInput = {
        workspace_id: workspace.id,
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

      await createVoiceAgent(session, payload);
      toast.success('Voice assistant created.');
      navigate('/voice/assistants', { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create voice assistant.';
      setErrorMessage(message);
      setActivationIssues(error instanceof VoiceAgentServiceError ? error.activationIssues : []);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleApplyGeneratedContent(content: GeneratedAssistantContent) {
    setValues((current) => ({
      ...current,
      name: content.suggestedName,
      description: content.description,
      greeting: content.greeting,
      system_prompt: content.systemPrompt,
    }));
    setLastGeneratedContent(content);
    toast.success(
      content.usedFallback
        ? 'A basic AI draft was applied. Please review it before saving.'
        : 'AI-generated assistant setup applied. You can edit everything before saving.',
    );
  }

  useEffect(() => {
    if (!session || !workspace) {
      return;
    }

    const currentSession = session;
    const currentWorkspaceId = workspace.id;
    let cancelled = false;

    async function loadTelnyxOptions() {
      setTelnyxOptionsLoading(true);
      setTelnyxOptionsError('');

      try {
        const response = await listVoiceAgentTelnyxOptions(currentSession, currentWorkspaceId);

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
  }, [session, workspace]);

  if (!session || !workspace) {
    return <FullPageLoader label="Loading assistant setup..." />;
  }

  if (!isOwner) {
    return <Navigate to={`/dashboard/${workspace.crmType}`} replace />;
  }

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={handleSignOut}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-[28px]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Create Voice Assistant
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Configure your voice assistant with the same fields already available in your platform, arranged in a cleaner setup flow.
              </p>
            </div>
            <Link to="/voice/assistants" className="inline-flex">
              <Button type="button" variant="secondary">
                Back to assistants
              </Button>
            </Link>
          </div>

          {configRefreshing ? (
            <Card className="p-4 text-sm text-slate-600">Refreshing CRM field metadata in the background...</Card>
          ) : null}

          {configLoading && !config ? (
            <SectionSkeleton title="Assistant setup" rows={6} />
          ) : configError ? (
            <Card className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{configError}</Card>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                void handleCreateAssistant();
              }}
            >
              {errorMessage ? (
                <Card className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  <div>{errorMessage}</div>
                  {activationIssues.length > 0 ? (
                    <ul className="mt-2 list-disc pl-5">
                      {activationIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : null}
                </Card>
              ) : null}

              <Card
                data-guide-id="voice-assistant-ai-setup"
                className="overflow-hidden border-0 bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 shadow-xl shadow-indigo-200/60"
              >
                <div className="flex flex-col gap-5 p-6 text-white lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Smart Setup with AI</h2>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-indigo-50">
                        Describe what you want your assistant to do, and we&apos;ll generate the greeting, description, and prompt for you.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    className={`${AI_BUTTON_CLASS} min-w-[280px] justify-center`}
                    onClick={() => setIsAiGeneratorOpen(true)}
                  >
                    <span>Generate assistant setup with AI</span>
                  </Button>
                </div>
              </Card>

              {lastGeneratedContent?.usedFallback ? (
                <Card className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <div className="font-medium">
                    We generated a simpler draft because the advanced AI response could not be used fully.
                  </div>
                  {fallbackReasonDetail ? <p className="mt-2 text-xs leading-5 text-amber-700">{fallbackReasonDetail}</p> : null}
                </Card>
              ) : null}

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <div className="space-y-5">
                  <Card className="p-5 sm:p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">Basic Info</h2>
                        <p className="text-sm text-slate-500">Keep the identity and starting state clear for your team.</p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-2">
                        <span className={FIELD_LABEL_CLASS}>Assistant name</span>
                        <input
                          data-guide-id="voice-assistant-name"
                          value={values.name}
                          onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
                          placeholder="e.g. Sales Follow-up Agent"
                          className={FIELD_CONTROL_CLASS}
                        />
                      </label>

                      <SelectField
                        label="Initial status"
                        value={values.status}
                        options={['draft', 'disabled']}
                        onChange={(value) => setValues((current) => ({ ...current, status: value as VoiceAgentStatus }))}
                      />
                    </div>

                    <label className="mt-4 flex flex-col gap-2">
                      <span className={FIELD_LABEL_CLASS}>Description</span>
                      <textarea
                        value={values.description}
                        onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
                        rows={4}
                        placeholder="Describe the internal purpose of this assistant..."
                        className={TEXTAREA_CLASS}
                      />
                    </label>
                  </Card>

                  <Card className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                          <MessageSquareText className="h-4 w-4" />
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-slate-900">Conversation Setup</h2>
                          <p className="text-sm text-slate-500">Define what callers hear first and how the assistant should behave.</p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        className={AI_BUTTON_CLASS}
                        onClick={() => setIsAiGeneratorOpen(true)}
                      >
                        <span>Generate with AI</span>
                      </Button>
                    </div>

                    <label className="mt-5 flex flex-col gap-2">
                      <span className={FIELD_LABEL_CLASS}>Greeting message</span>
                      <textarea
                        value={values.greeting}
                        onChange={(event) => setValues((current) => ({ ...current, greeting: event.target.value }))}
                        rows={4}
                        placeholder="Hello! Thanks for calling..."
                        className={TEXTAREA_CLASS}
                      />
                    </label>

                    <label className="mt-4 flex flex-col gap-2">
                      <span className={FIELD_LABEL_CLASS}>System prompt</span>
                      <textarea
                        data-guide-id="voice-assistant-system-prompt"
                        value={values.system_prompt}
                        onChange={(event) => setValues((current) => ({ ...current, system_prompt: event.target.value }))}
                        rows={8}
                        placeholder="Describe how the assistant should qualify, respond, collect details, and transfer when needed."
                        className={TEXTAREA_CLASS}
                      />
                    </label>

                    {lastGeneratedContent?.sampleQuestions?.length ? (
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                          Suggested caller prompts
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {lastGeneratedContent.sampleQuestions.map((question) => (
                            <span
                              key={question}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                            >
                              {question}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </Card>
                </div>

                <div className="space-y-5">
                  <Card className="p-5 sm:p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                        <Settings2 className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">Voice &amp; AI Engine</h2>
                        <p className="text-sm text-slate-500">Use the existing engine settings already supported by the platform.</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-xs leading-5 text-sky-700">
                      {LOCKED_ENGINE_NOTE}
                    </div>

                    <div className="mt-5 space-y-4">
                      <SelectField
                        label="Model"
                        value={values.telnyx_model}
                        options={telnyxOptions?.telnyx_models}
                        disabled
                      />

                      <SelectField
                        label="Voice profile"
                        value={values.telnyx_voice}
                        options={telnyxOptions?.telnyx_voices}
                        disabled
                      />

                      <div className="grid gap-4 md:grid-cols-2">
                        <SelectField
                          label="Language"
                          value={values.telnyx_language}
                          options={telnyxOptions?.telnyx_languages}
                          disabled
                        />

                        <SelectField
                          label="Transcription"
                          value={values.telnyx_transcription_model}
                          options={telnyxOptions?.telnyx_transcription_models}
                          disabled
                        />
                      </div>
                    </div>

                    {telnyxOptionsLoading ? (
                      <p className="mt-4 text-xs text-slate-500">Loading available voice engine options...</p>
                    ) : null}

                    {telnyxOptionsError ? (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                        {telnyxOptionsError}
                      </div>
                    ) : null}
                  </Card>

                  <Card className="p-5 sm:p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                        <Database className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">CRM Integration</h2>
                        <p className="text-sm text-slate-500">Show the existing CRM source linkage used by this assistant.</p>
                      </div>
                    </div>

                    <div className={`mt-5 rounded-2xl border p-4 ${hasDedicatedSource ? 'border-emerald-200 bg-emerald-50/80' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{sourceLabel}</div>
                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            {hasDedicatedSource
                              ? 'This assistant will use the selected CRM source already stored in your workspace.'
                              : 'No dedicated source is selected yet, so this assistant will use the inbound-call fallback path.'}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                            hasDedicatedSource ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500'
                          }`}
                        >
                          {hasDedicatedSource ? 'Connected' : 'Fallback'}
                        </span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>

              <Card className="sticky bottom-4 z-10 border-slate-200/90 bg-white/95 p-4 shadow-lg backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <Link to="/voice/assistants" className="inline-flex">
                    <Button type="button" variant="ghost" className="w-full sm:w-auto">
                      Discard changes
                    </Button>
                  </Link>
                  <Button type="submit" loading={submitting} data-guide-id="voice-assistant-submit" className="w-full sm:w-auto">
                    Save assistant
                  </Button>
                </div>
              </Card>
            </form>
          )}
        </div>
      </div>

      <AssistantAIGeneratorModal
        isOpen={isAiGeneratorOpen}
        session={session}
        workspaceId={workspace.id}
        suggestedBusinessType={formatCrmLabel(workspace.crmType)}
        onClose={() => setIsAiGeneratorOpen(false)}
        onApply={handleApplyGeneratedContent}
      />
    </WorkspaceLayout>
  );
}
