import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '../components/dashboard/PageHeader';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { VoiceAgentForm, createEmptyVoiceAgentFormValues, type VoiceAgentFormValues } from '../components/voice/VoiceAgentForm';
import { Card } from '../components/ui/Card';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { SectionSkeleton } from '../components/ui/SectionSkeleton';
import { useAuth } from '../hooks/useAuth';
import { useCrmWorkspace } from '../hooks/useCrmWorkspace';
import {
  createVoiceAgent,
  listVoiceAgentTelnyxOptions,
  type VoiceAgentCreateInput,
  type VoiceAgentTelnyxOptions,
  VoiceAgentServiceError,
} from '../lib/voice-agent-service';

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

  const isOwner = Boolean(workspace && user && workspace.ownerId === user.id);

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
          />
        )}
      </div>
    </WorkspaceLayout>
  );
}
