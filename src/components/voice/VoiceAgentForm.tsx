import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import type { RecordSource } from '../../lib/crm-types';
import type { VoiceAgentRecord, VoiceAgentStatus, VoiceAgentTelnyxOptions } from '../../lib/voice-agent-service';
import { sanitizeVoiceAssistantFallbackReason } from '../../lib/voice-assistant-ai-service';
import type { GeneratedAssistantContent } from '../../types/voice-assistant-ai';
import { AssistantAIGuide } from './AssistantAIGuide';

export interface VoiceAgentFormValues {
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

const emptyFormValues: VoiceAgentFormValues = {
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

const READ_ONLY_FIELD_CLASSES =
  'h-12 rounded-2xl border border-slate-300 bg-slate-50 px-4 text-sm text-slate-700';

export function createEmptyVoiceAgentFormValues() {
  return { ...emptyFormValues };
}

function getSourceDisplayLabel(sourceId: string, sources: RecordSource[]) {
  if (!sourceId) {
    return 'Use inbound-call fallback';
  }

  return sources.find((source) => source.id === sourceId)?.name ?? sourceId;
}

function toFormValues(agent: VoiceAgentRecord | null | undefined): VoiceAgentFormValues {
  if (!agent) {
    return createEmptyVoiceAgentFormValues();
  }

  const normalizedVoice = agent.telnyx_voice.replace(/^Telnyx\.KokoroTTS\./, '').trim() || 'af';

  return {
    name: agent.name,
    description: agent.description ?? '',
    greeting: agent.greeting,
    system_prompt: agent.system_prompt,
    telnyx_model: agent.telnyx_model,
    telnyx_voice: normalizedVoice,
    telnyx_transcription_model: agent.telnyx_transcription_model,
    telnyx_language: agent.telnyx_language,
    source_id: agent.source_id ?? '',
    status: agent.status,
  };
}

interface VoiceAgentFormProps {
  agent: VoiceAgentRecord | null;
  sources: RecordSource[];
  mode: 'create' | 'edit';
  submitting: boolean;
  errorMessage?: string;
  activationIssues?: string[];
  telnyxOptions?: VoiceAgentTelnyxOptions | null;
  telnyxOptionsLoading?: boolean;
  telnyxOptionsError?: string;
  values?: VoiceAgentFormValues;
  onValuesChange?: (values: VoiceAgentFormValues) => void;
  onSubmit: (values: VoiceAgentFormValues) => Promise<void> | void;
  aiGeneration?: {
    onOpen: () => void;
    lastGenerated?: GeneratedAssistantContent | null;
    buttonLabel?: string;
  };
}

export function VoiceAgentForm({
  agent,
  sources,
  mode,
  submitting,
  errorMessage,
  activationIssues = [],
  telnyxOptions: _telnyxOptions,
  telnyxOptionsLoading: _telnyxOptionsLoading = false,
  telnyxOptionsError: _telnyxOptionsError,
  values: controlledValues,
  onValuesChange,
  onSubmit,
  aiGeneration,
}: VoiceAgentFormProps) {
  const [values, setValues] = useState<VoiceAgentFormValues>(() => toFormValues(agent));
  const isControlled = Boolean(controlledValues && onValuesChange);
  const formValues = controlledValues ?? values;

  function updateValues(next: VoiceAgentFormValues | ((current: VoiceAgentFormValues) => VoiceAgentFormValues)) {
    if (isControlled && controlledValues && onValuesChange) {
      onValuesChange(typeof next === 'function' ? next(controlledValues) : next);
      return;
    }

    setValues(next);
  }

  useEffect(() => {
    if (!isControlled) {
      setValues(toFormValues(agent));
    }
  }, [agent, mode, isControlled]);

  const fallbackReasonDetail = sanitizeVoiceAssistantFallbackReason(aiGeneration?.lastGenerated?.fallbackReason);

  return (
    <div className="p-6 bg-transparent">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl text-slate-900">{mode === 'create' ? 'New assistant' : 'Assistant setup'}</h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Configure the greeting, prompt, and CRM source used when this assistant handles inbound calls.
          </p>
        </div>
        {mode === 'edit' && agent ? (
          <div className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs uppercase tracking-[0.24em] text-slate-700">
            {agent.status}
          </div>
        ) : null}
      </div>

      <form
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(formValues);
        }}
      >
        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <div>{errorMessage}</div>
            {activationIssues.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-rose-700">
                {activationIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {aiGeneration ? (
          <div data-guide-id="voice-assistant-ai-setup">
            <AssistantAIGuide
              title={mode === 'edit' ? 'Need help improving this?' : 'Need help writing this?'}
              body={mode === 'edit'
                ? 'Use AI Setup to refine the greeting, description, and system prompt based on this assistant\'s workflow.'
                : 'Use AI Setup to generate a greeting, description, and system prompt based on your workflow.'}
              buttonLabel={aiGeneration.buttonLabel ?? 'Generate with AI'}
              onAction={aiGeneration.onOpen}
            />
          </div>
        ) : null}

        {mode === 'edit' && agent?.status === 'active' && aiGeneration ? (
          <Card className="border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This assistant is active. Any changes you save here will affect future calls handled by this assistant.
          </Card>
        ) : null}

        {aiGeneration?.lastGenerated?.usedFallback ? (
          <Card className="border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="font-medium">We generated a basic draft because the AI response could not be used fully. Please review before saving.</div>
            {fallbackReasonDetail ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-amber-700">Why am I seeing this?</summary>
                <p className="mt-2 text-xs leading-6 text-amber-700">{fallbackReasonDetail}</p>
              </details>
            ) : null}
          </Card>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Input
            label="Assistant name"
            data-guide-id="voice-assistant-name"
            value={formValues.name}
            onChange={(event) => updateValues((current) => ({ ...current, name: event.target.value }))}
            placeholder="Inbound sales intake"
          />

          <label className="flex flex-col gap-2 text-sm text-slate-700">
            <span className="font-medium">Status</span>
            <select
              value={formValues.status}
              onChange={(event) =>
                updateValues((current) => ({ ...current, status: event.target.value as VoiceAgentStatus }))}
              className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900"
            >
              <option value="draft">Draft</option>
              {mode === 'edit' ? <option value="active">Active</option> : null}
              <option value="disabled">Disabled</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-2 text-sm text-slate-700">
          <span className="font-medium">Description</span>
          <textarea
            value={formValues.description}
            onChange={(event) => updateValues((current) => ({ ...current, description: event.target.value }))}
            rows={3}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500"
            placeholder="Short note about the assistant's role in this workspace."
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-700">
          <span className="font-medium">Greeting</span>
          <textarea
            value={formValues.greeting}
            onChange={(event) => updateValues((current) => ({ ...current, greeting: event.target.value }))}
            rows={3}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500"
            placeholder="Hello, thanks for calling..."
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-medium">System prompt</span>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                This defines how your assistant behaves during calls, including what it says, what it collects, and when it transfers.
              </p>
            </div>
            {aiGeneration ? (
              <Button type="button" variant="secondary" size="sm" onClick={aiGeneration.onOpen}>
                {aiGeneration.buttonLabel ?? 'Generate with AI'}
              </Button>
            ) : null}
          </div>
          <textarea
            data-guide-id="voice-assistant-system-prompt"
            value={formValues.system_prompt}
            onChange={(event) => updateValues((current) => ({ ...current, system_prompt: event.target.value }))}
            rows={6}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500"
            placeholder="Describe how the assistant should handle calls, collect information, and when to transfer. Or use AI generation."
          />
          {aiGeneration?.lastGenerated?.sampleQuestions?.length ? (
            <Card className="border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Your assistant will likely ask:</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {aiGeneration.lastGenerated.sampleQuestions.map((question) => (
                  <span
                    key={question}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs leading-5 text-slate-700"
                  >
                    {question}
                  </span>
                ))}
              </div>
            </Card>
          ) : null}
        </label>

        <div className="rounded-2xl border border-slate-300 bg-white p-4">
          <div className="text-sm font-medium text-slate-900">Telnyx assistant settings</div>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            These values are sent to Telnyx when the assistant is created or updated there.
          </p>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-slate-700">
              <span className="font-medium">Telnyx model</span>
              <input value={formValues.telnyx_model} disabled className={READ_ONLY_FIELD_CLASSES} />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700">
              <span className="font-medium">Telnyx voice</span>
              <input value={formValues.telnyx_voice} disabled className={READ_ONLY_FIELD_CLASSES} />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700">
              <span className="font-medium">Transcription model</span>
              <input value={formValues.telnyx_transcription_model} disabled className={READ_ONLY_FIELD_CLASSES} />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700">
              <span className="font-medium">Language</span>
              <input value={formValues.telnyx_language} disabled className={READ_ONLY_FIELD_CLASSES} />
            </label>
          </div>
        </div>

        <label className="flex flex-col gap-2 text-sm text-slate-700">
          <span className="font-medium">CRM source</span>
          <input
            value={getSourceDisplayLabel(formValues.source_id, sources)}
            disabled
            className={READ_ONLY_FIELD_CLASSES}
          />
        </label>

        <div className="flex justify-end">
          <Button type="submit" loading={submitting} data-guide-id="voice-assistant-submit">
            {mode === 'create' ? 'Create assistant' : 'Save assistant'}
          </Button>
        </div>
      </form>
    </div>
  );
}
