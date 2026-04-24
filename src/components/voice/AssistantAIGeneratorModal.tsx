import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Session } from '@supabase/supabase-js';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { cn } from '../../lib/utils';
import {
  generateVoiceAssistantConfig,
  sanitizeVoiceAssistantFallbackReason,
} from '../../lib/voice-assistant-ai-service';
import type {
  AssistantPromptInput,
  AssistantTone,
  GeneratedAssistantContent,
} from '../../types/voice-assistant-ai';
import { AssistantAIGuide } from './AssistantAIGuide';

const CALLER_TYPE_OPTIONS = [
  'customer',
  'vendor',
  'partner',
  'service caller',
  'appointment caller',
  'support caller',
  'general inquiry',
];

const COLLECT_FIELD_OPTIONS = [
  'Full name',
  'Phone number',
  'Email',
  'Inquiry type',
  'Budget',
  'Location',
  'Timeline',
  'Preferred callback time',
  'Notes',
];

const RESTRICTION_OPTIONS = [
  'Do not give legal advice',
  'Do not promise pricing',
  'Do not guarantee availability unless confirmed',
  'Do not make refund promises',
  'Do not provide unsupported troubleshooting steps',
];

const PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  values: AssistantPromptInput;
}> = [
  {
    id: 'lead-intake',
    label: 'Lead Intake',
    description: 'Capture new inbound opportunities, qualify the caller, and route high-priority requests quickly.',
    values: {
      businessType: '',
      assistantRole: 'Inbound lead intake assistant',
      callerTypes: ['customer', 'general inquiry'],
      primaryGoal: 'Understand the caller intent, capture contact details, and identify whether follow-up should be prioritized',
      collectFields: ['Full name', 'Phone number', 'Email', 'Inquiry type', 'Location', 'Timeline', 'Notes'],
      tone: 'friendly',
      transferRule: 'Transfer if the caller requests a human, is high priority, or has an urgent issue',
      restrictions: ['Do not promise pricing or availability', 'Do not make commitments outside confirmed information'],
      fallbackBehavior: 'Ask a short clarifying question or offer a callback',
      language: 'English',
    },
  },
  {
    id: 'support-intake',
    label: 'Customer Support Intake',
    description: 'Capture issue details, route correctly, and keep scope clear for support callers.',
    values: {
      businessType: '',
      assistantRole: 'Support call intake assistant',
      callerTypes: ['customer', 'general inquiry'],
      primaryGoal: 'Understand the issue, collect customer details, and route the caller correctly',
      collectFields: ['Full name', 'Phone number', 'Email', 'Inquiry type', 'Notes'],
      tone: 'professional',
      transferRule: 'Transfer if the issue is urgent, billing-related, or the caller requests a human',
      restrictions: ['Do not make refund promises', 'Do not provide unsupported troubleshooting steps'],
      fallbackBehavior: 'Ask clarifying questions and summarize the issue before routing',
      language: 'English',
    },
  },
  {
    id: 'appointment-booking',
    label: 'Appointment Booking',
    description: 'Collect booking details, set expectations clearly, and escalate complex scheduling requests.',
    values: {
      businessType: '',
      assistantRole: 'Appointment booking assistant',
      callerTypes: ['customer', 'appointment caller', 'general inquiry'],
      primaryGoal: 'Collect booking details and help route or schedule the caller',
      collectFields: ['Full name', 'Phone number', 'Email', 'Preferred callback time', 'Notes'],
      tone: 'empathetic',
      transferRule: 'Transfer if the caller requests immediate confirmation or has a complex scheduling request',
      restrictions: ['Do not guarantee availability unless confirmed by the system'],
      fallbackBehavior: 'Offer a callback or collect details for follow-up',
      language: 'English',
    },
  },
];

const DEFAULT_INPUT = (businessType?: string): AssistantPromptInput => ({
  businessType: businessType ?? '',
  assistantRole: '',
  callerTypes: [],
  primaryGoal: '',
  collectFields: [],
  tone: 'friendly',
  language: '',
  transferRule: '',
  restrictions: [],
  fallbackBehavior: '',
});

type ValidationErrors = Partial<Record<keyof AssistantPromptInput, string>>;

interface AssistantAIGeneratorModalProps {
  isOpen: boolean;
  session: Session;
  workspaceId: string;
  suggestedBusinessType?: string;
  initialInput?: AssistantPromptInput | null;
  mode?: 'create' | 'edit';
  contextNotice?: string;
  onClose: () => void;
  onApply: (content: GeneratedAssistantContent) => void;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function validateInput(input: AssistantPromptInput) {
  const errors: ValidationErrors = {};

  if (!input.assistantRole.trim()) {
    errors.assistantRole = 'Assistant role is required.';
  }

  if (!input.primaryGoal.trim()) {
    errors.primaryGoal = 'Primary goal is required.';
  }

  if (input.collectFields.length === 0) {
    errors.collectFields = 'Select at least one field to collect.';
  }

  if (!input.transferRule.trim()) {
    errors.transferRule = 'Transfer rule is required.';
  }

  return errors;
}

function ToggleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm transition',
        active
          ? 'border-indigo-600 bg-indigo-600 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900',
      )}
    >
      {label}
    </button>
  );
}

function InlineError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <div className="text-xs text-rose-600">{message}</div>;
}

export function AssistantAIGeneratorModal({
  isOpen,
  session,
  workspaceId,
  suggestedBusinessType,
  initialInput,
  mode = 'create',
  contextNotice,
  onClose,
  onApply,
}: AssistantAIGeneratorModalProps) {
  const [input, setInput] = useState<AssistantPromptInput>(() => DEFAULT_INPUT(suggestedBusinessType));
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generated, setGenerated] = useState<GeneratedAssistantContent | null>(null);
  const [customCallerType, setCustomCallerType] = useState('');
  const [customCollectField, setCustomCollectField] = useState('');
  const [customRestriction, setCustomRestriction] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, submitting]);

  useEffect(() => {
    setInput((current) => {
      if (current.businessType?.trim()) {
        return current;
      }

      return { ...current, businessType: suggestedBusinessType ?? '' };
    });
  }, [suggestedBusinessType]);

  useEffect(() => {
    if (!isOpen || !initialInput) {
      return;
    }

    setInput({
      businessType: initialInput.businessType ?? '',
      assistantRole: initialInput.assistantRole,
      callerTypes: [...initialInput.callerTypes],
      primaryGoal: initialInput.primaryGoal,
      collectFields: [...initialInput.collectFields],
      tone: initialInput.tone,
      language: initialInput.language ?? '',
      transferRule: initialInput.transferRule,
      restrictions: [...(initialInput.restrictions ?? [])],
      fallbackBehavior: initialInput.fallbackBehavior ?? '',
    });
    setGenerated(null);
    setErrors({});
    setSubmitError('');
  }, [initialInput, isOpen]);

  const selectedRestrictions = useMemo(() => input.restrictions ?? [], [input.restrictions]);
  const fallbackReasonDetail = sanitizeVoiceAssistantFallbackReason(generated?.fallbackReason);

  if (!isOpen) {
    return null;
  }

  function updateInput<K extends keyof AssistantPromptInput>(key: K, value: AssistantPromptInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitError('');
  }

  function toggleStringListValue(key: 'callerTypes' | 'collectFields' | 'restrictions', value: string) {
    const normalized = value.trim();

    if (!normalized) {
      return;
    }

    const currentValues = key === 'restrictions' ? input.restrictions ?? [] : input[key];
    const nextValues = currentValues.includes(normalized)
      ? currentValues.filter((entry) => entry !== normalized)
      : [...currentValues, normalized];

    updateInput(key, uniqueValues(nextValues) as AssistantPromptInput[typeof key]);
  }

  function addCustomValue(key: 'callerTypes' | 'collectFields' | 'restrictions', rawValue: string, reset: () => void) {
    const normalized = rawValue.trim();

    if (!normalized) {
      return;
    }

    const currentValues = key === 'restrictions' ? input.restrictions ?? [] : input[key];
    updateInput(key, uniqueValues([...currentValues, normalized]) as AssistantPromptInput[typeof key]);
    reset();
  }

  function handleApplyPreset(values: AssistantPromptInput) {
    setInput({
      businessType: values.businessType ?? '',
      assistantRole: values.assistantRole,
      callerTypes: [...values.callerTypes],
      primaryGoal: values.primaryGoal,
      collectFields: [...values.collectFields],
      tone: values.tone,
      language: values.language ?? '',
      transferRule: values.transferRule,
      restrictions: [...(values.restrictions ?? [])],
      fallbackBehavior: values.fallbackBehavior ?? '',
    });
    setErrors({});
    setSubmitError('');
  }

  async function handleGenerate() {
    const validationErrors = validateInput(input);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const result = await generateVoiceAssistantConfig(session, {
        workspace_id: workspaceId,
        businessType: input.businessType?.trim() || undefined,
        assistantRole: input.assistantRole.trim(),
        callerTypes: uniqueValues(input.callerTypes),
        primaryGoal: input.primaryGoal.trim(),
        collectFields: uniqueValues(input.collectFields),
        tone: input.tone,
        language: input.language?.trim() || undefined,
        transferRule: input.transferRule.trim(),
        restrictions: uniqueValues(input.restrictions ?? []),
        fallbackBehavior: input.fallbackBehavior?.trim() || undefined,
      });

      setGenerated(result);
      onApply(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate assistant content.';
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close AI assistant setup"
        className="absolute inset-0"
        onClick={() => {
          if (!submitting) {
            onClose();
          }
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-ai-setup-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-indigo-600">AI Setup</div>
            <h2 id="assistant-ai-setup-title" className="mt-2 font-display text-2xl text-slate-900">
              {mode === 'edit' ? 'Improve Assistant with AI' : 'AI Assistant Setup'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {mode === 'edit'
                ? 'Refine the current assistant using workflow-aware AI suggestions before you save changes.'
                : 'Answer a few workflow questions and we\'ll generate a voice-friendly assistant draft.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-300 bg-white text-slate-700 transition hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="space-y-5">
            <div>
              <div className="text-sm font-semibold text-slate-900">Quick presets</div>
              <p className="mt-1 text-sm text-slate-600">Start with a realistic example and adjust it for your workflow.</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset.values)}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    <div className="font-medium text-slate-900">{preset.label}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{preset.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <AssistantAIGuide
              variant="modal"
              title={mode === 'edit' ? 'How improvement works' : 'How this works'}
              body={mode === 'edit'
                ? 'Adjust the workflow details below and we\'ll rewrite the assistant name, description, greeting, and system prompt. You can review everything before saving the updated assistant.'
                : 'Describe the assistant\'s job, who it talks to, what it should collect, and when it should transfer to a human. We\'ll generate a suggested name, description, greeting, and system prompt. You can review and edit everything before saving.'}
            />

            {contextNotice ? (
              <Card className="border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {contextNotice}
              </Card>
            ) : null}

            <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">See example output</summary>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div>
                  <div className="font-medium text-slate-900">Example greeting</div>
                  <p className="mt-1">Hi, thanks for calling. I can help with a few quick questions and connect you with the right next step if needed.</p>
                </div>
                <div>
                  <div className="font-medium text-slate-900">Example system prompt preview</div>
                  <p className="mt-1 whitespace-pre-line rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-700">
                    ROLE{'\n'}You are a voice assistant for this business.{'\n\n'}OBJECTIVE{'\n'}Handle inbound calls, capture the right details, and route the caller clearly.
                  </p>
                </div>
                <div>
                  <div className="font-medium text-slate-900">Example sample questions</div>
                  <ul className="mt-1 list-disc pl-5 text-slate-600">
                    <li>What can I help you with today?</li>
                    <li>What is the best phone number and email for follow-up?</li>
                    <li>Would you like me to route this to the right teammate?</li>
                  </ul>
                </div>
              </div>
            </details>

            <div className="grid gap-4 lg:grid-cols-2">
              <Input
                label="Business type"
                value={input.businessType ?? ''}
                onChange={(event) => updateInput('businessType', event.target.value)}
                placeholder="Restaurant, Gas Station, Auto Repair, Convenience Store, Real Estate"
                hint="Optional. Add your business type if you want the generated prompt to reflect the current CRM mode."
              />

              <label className="flex flex-col gap-1.5 text-sm text-slate-800">
                <span className="font-semibold text-slate-800">Tone</span>
                <select
                  value={input.tone}
                  onChange={(event) => updateInput('tone', event.target.value as AssistantTone)}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900"
                >
                  <option value="friendly">Friendly</option>
                  <option value="professional">Professional</option>
                  <option value="empathetic">Empathetic</option>
                  <option value="concise">Concise</option>
                </select>
              </label>
            </div>

            <Input
              label="Assistant role"
              value={input.assistantRole}
              onChange={(event) => updateInput('assistantRole', event.target.value)}
              placeholder="Inbound call qualification and routing assistant"
              hint="Example: Qualify inbound callers and route them correctly"
              error={errors.assistantRole}
            />

            <label className="flex flex-col gap-2 text-sm text-slate-800">
              <span className="font-semibold text-slate-800">Primary goal</span>
              <textarea
                value={input.primaryGoal}
                onChange={(event) => updateInput('primaryGoal', event.target.value)}
                rows={3}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500"
                placeholder="Collect caller details, understand the request, and route the caller correctly"
              />
              <div className="text-xs text-slate-500">
                Example: Collect caller details, understand the request, and route the caller correctly
              </div>
              <InlineError message={errors.primaryGoal} />
            </label>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-800">Caller types</div>
              <div className="text-xs text-slate-500">Who will call this assistant? Example: customers, vendors, partners, general inquiries</div>
              <div className="flex flex-wrap gap-2">
                {CALLER_TYPE_OPTIONS.map((option) => (
                  <ToggleChip
                    key={option}
                    label={option}
                    active={input.callerTypes.includes(option)}
                    onClick={() => toggleStringListValue('callerTypes', option)}
                  />
                ))}
                {input.callerTypes
                  .filter((value) => !CALLER_TYPE_OPTIONS.includes(value))
                  .map((value) => (
                    <ToggleChip
                      key={value}
                      label={value}
                      active
                      onClick={() => toggleStringListValue('callerTypes', value)}
                    />
                  ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={customCallerType}
                  onChange={(event) => setCustomCallerType(event.target.value)}
                  placeholder="Add custom caller type"
                  className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 placeholder:text-slate-500"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => addCustomValue('callerTypes', customCallerType, () => setCustomCallerType(''))}
                >
                  Add caller type
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-800">Collect fields</div>
              <div className="text-xs text-slate-500">Select what information should be saved into CRM records</div>
              <div className="flex flex-wrap gap-2">
                {COLLECT_FIELD_OPTIONS.map((option) => (
                  <ToggleChip
                    key={option}
                    label={option}
                    active={input.collectFields.includes(option)}
                    onClick={() => toggleStringListValue('collectFields', option)}
                  />
                ))}
                {input.collectFields
                  .filter((value) => !COLLECT_FIELD_OPTIONS.includes(value))
                  .map((value) => (
                    <ToggleChip
                      key={value}
                      label={value}
                      active
                      onClick={() => toggleStringListValue('collectFields', value)}
                    />
                  ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={customCollectField}
                  onChange={(event) => setCustomCollectField(event.target.value)}
                  placeholder="Add custom field"
                  className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 placeholder:text-slate-500"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => addCustomValue('collectFields', customCollectField, () => setCustomCollectField(''))}
                >
                  Add field
                </Button>
              </div>
              <InlineError message={errors.collectFields} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Input
                label="Language"
                value={input.language ?? ''}
                onChange={(event) => updateInput('language', event.target.value)}
                placeholder="English"
                hint="Optional. Use a natural language label like English or Spanish."
              />

              <label className="flex flex-col gap-2 text-sm text-slate-800">
                <span className="font-semibold text-slate-800">Transfer rule</span>
                <textarea
                  value={input.transferRule}
                  onChange={(event) => updateInput('transferRule', event.target.value)}
                  rows={3}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500"
                  placeholder="Transfer if the caller asks for a human or has an urgent request"
                />
                <div className="text-xs text-slate-500">
                  Example: Transfer if the caller asks for a human or has an urgent request
                </div>
                <InlineError message={errors.transferRule} />
              </label>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-800">Restrictions</div>
              <div className="text-xs text-slate-500">Example: Do not give legal advice or promise pricing</div>
              <div className="flex flex-wrap gap-2">
                {RESTRICTION_OPTIONS.map((option) => (
                  <ToggleChip
                    key={option}
                    label={option}
                    active={selectedRestrictions.includes(option)}
                    onClick={() => toggleStringListValue('restrictions', option)}
                  />
                ))}
                {selectedRestrictions
                  .filter((value) => !RESTRICTION_OPTIONS.includes(value))
                  .map((value) => (
                    <ToggleChip
                      key={value}
                      label={value}
                      active
                      onClick={() => toggleStringListValue('restrictions', value)}
                    />
                  ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={customRestriction}
                  onChange={(event) => setCustomRestriction(event.target.value)}
                  placeholder="Add custom restriction"
                  className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 placeholder:text-slate-500"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => addCustomValue('restrictions', customRestriction, () => setCustomRestriction(''))}
                >
                  Add restriction
                </Button>
              </div>
            </div>

            <label className="flex flex-col gap-2 text-sm text-slate-800">
              <span className="font-semibold text-slate-800">Fallback behavior</span>
              <textarea
                value={input.fallbackBehavior ?? ''}
                onChange={(event) => updateInput('fallbackBehavior', event.target.value)}
                rows={3}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500"
                placeholder="Ask a clarifying question or offer a callback"
              />
              <div className="text-xs text-slate-500">Example: Ask a clarifying question or offer a callback</div>
            </label>

            {submitError ? (
              <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{submitError}</Card>
            ) : null}

            {generated ? (
              <Card className="border-indigo-200 bg-indigo-50/60 p-5">
                <div className="space-y-4">
                  {generated.usedFallback ? (
                    <Card className="border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <div className="font-medium">
                        We generated a basic draft because the AI response could not be used fully. Please review before saving.
                      </div>
                      {fallbackReasonDetail ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-medium text-amber-700">Why am I seeing this?</summary>
                          <p className="mt-2 text-xs leading-6 text-amber-700">{fallbackReasonDetail}</p>
                        </details>
                      ) : null}
                    </Card>
                  ) : null}

                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-indigo-600">Generated draft</div>
                    <h3 className="mt-2 text-lg font-semibold text-slate-900">{generated.suggestedName}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{generated.description}</p>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Role</div>
                      <div className="mt-2 text-sm text-slate-700">{input.assistantRole}</div>
                    </div>
                    <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Goal</div>
                      <div className="mt-2 text-sm text-slate-700">{input.primaryGoal}</div>
                    </div>
                    <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Data collected</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {input.collectFields.map((field) => (
                          <span key={field} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                            {field}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Transfer rule</div>
                      <div className="mt-2 text-sm text-slate-700">{input.transferRule}</div>
                    </div>
                    {(input.restrictions ?? []).length > 0 ? (
                      <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 lg:col-span-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Restrictions</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(input.restrictions ?? []).map((restriction) => (
                            <span key={restriction} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                              {restriction}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-slate-900">Greeting</div>
                    <p className="mt-1 rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                      {generated.greeting}
                    </p>
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-slate-900">System prompt</div>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-xs leading-6 text-slate-700">
                      {generated.systemPrompt}
                    </pre>
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-slate-900">Your assistant will likely ask:</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {generated.sampleQuestions.map((question) => (
                        <span
                          key={question}
                          className="rounded-full border border-indigo-100 bg-white px-3 py-1.5 text-xs leading-5 text-slate-700"
                        >
                          {question}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="text-sm text-slate-500">
            {generated
              ? 'The generated draft is already applied to the form. Edit the inputs above and use Regenerate if you want a different result.'
              : 'You can still edit the final assistant name, greeting, description, and prompt before saving.'}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              {generated ? 'Close' : 'Cancel'}
            </Button>
            <Button
              type="button"
              variant={generated ? 'secondary' : 'primary'}
              onClick={() => void handleGenerate()}
              loading={submitting}
            >
              {generated ? 'Regenerate' : mode === 'edit' ? 'Improve assistant' : 'Generate assistant'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
