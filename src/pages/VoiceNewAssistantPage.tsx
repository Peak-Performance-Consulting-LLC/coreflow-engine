import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { AppPageGuide } from '../context/AppGuideContext';
import { PageHeader } from '../components/dashboard/PageHeader';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { AssistantAIGeneratorModal } from '../components/voice/AssistantAIGeneratorModal';
import { VoiceAgentForm, createEmptyVoiceAgentFormValues, type VoiceAgentFormValues } from '../components/voice/VoiceAgentForm';
import { Card } from '../components/ui/Card';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { SectionSkeleton } from '../components/ui/SectionSkeleton';
import { useAuth } from '../hooks/useAuth';
import { usePageGuide } from '../hooks/useAppGuide';
import { useCrmWorkspace } from '../hooks/useCrmWorkspace';
import {
  createVoiceAgent,
  listVoiceAgentTelnyxOptions,
  type VoiceAgentCreateInput,
  type VoiceAgentTelnyxOptions,
  VoiceAgentServiceError,
} from '../lib/voice-agent-service';
import { formatCrmLabel } from '../lib/utils';
import type { GeneratedAssistantContent } from '../types/voice-assistant-ai';

export function VoiceNewAssistantPage() {
  const navigate = useNavigate();
  const { session, workspace, signOut, user } = useAuth();
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

  const isOwner = Boolean(workspace && user && workspace.ownerId === user.id);
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

  async function handleCreateAssistant(formValues: VoiceAgentFormValues) {
    if (!session || !workspace) {
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setActivationIssues([]);

    try {
      const payload: VoiceAgentCreateInput = {
        workspace_id: workspace.id,
        name: formValues.name,
        description: formValues.description || null,
        greeting: formValues.greeting,
        system_prompt: formValues.system_prompt,
        telnyx_model: formValues.telnyx_model,
        telnyx_voice: formValues.telnyx_voice,
        telnyx_transcription_model: formValues.telnyx_transcription_model,
        telnyx_language: formValues.telnyx_language,
        source_id: formValues.source_id || null,
        status: formValues.status,
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
      <div className="space-y-5">
        <PageHeader
          eyebrow="Voice workspace"
          title="New assistant"
          description="Create a voice assistant with greeting, system prompt, CRM source, and Telnyx settings."
          actions={(
            <>
              <Link
                to="/voice/assistants"
                className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Back to assistants
              </Link>
              <Link
                to="/voice/numbers"
                className="inline-flex items-center rounded-xl border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                Provisioned numbers
              </Link>
            </>
          )}
        />

        {configRefreshing ? (
          <Card className="p-4 text-sm text-slate-600">Refreshing CRM field metadata in the background...</Card>
        ) : null}

        {configLoading && !config ? (
          <SectionSkeleton title="Assistant setup" rows={5} />
        ) : configError ? (
          <Card className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{configError}</Card>
        ) : (
          <VoiceAgentForm
            agent={null}
            sources={config?.sources ?? []}
            mode="create"
            submitting={submitting}
            errorMessage={errorMessage}
            activationIssues={activationIssues}
            telnyxOptions={telnyxOptions}
            telnyxOptionsLoading={telnyxOptionsLoading}
            telnyxOptionsError={telnyxOptionsError}
            values={values}
            onValuesChange={setValues}
            onSubmit={handleCreateAssistant}
            aiGeneration={{
              onOpen: () => setIsAiGeneratorOpen(true),
              lastGenerated: lastGeneratedContent,
            }}
          />
        )}
      </div>

      {session && workspace ? (
        <AssistantAIGeneratorModal
          isOpen={isAiGeneratorOpen}
          session={session}
          workspaceId={workspace.id}
          suggestedBusinessType={formatCrmLabel(workspace.crmType)}
          onClose={() => setIsAiGeneratorOpen(false)}
          onApply={handleApplyGeneratedContent}
        />
      ) : null}
    </WorkspaceLayout>
  );
}
