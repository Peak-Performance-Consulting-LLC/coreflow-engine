import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceOwner } from '../_shared/server.ts';
import { deleteTelnyxAssistant } from '../_shared/telnyx-assistant-client.ts';
import { createVoiceAgent } from '../_shared/voice-agent-repository.ts';
import {
  createTelnyxAssistantForVoiceAgent,
  formatTelnyxAssistantSyncError,
} from '../_shared/voice-agent-telnyx-sync.ts';
import {
  resolveDefaultVoiceAgentLanguage,
  resolveDefaultVoiceAgentTranscriptionModel,
} from '../_shared/voice-agent-transcription.ts';
import { validateVoiceAgentPayload } from '../_shared/voice-agent-validator.ts';

const DEFAULT_TELNYX_MODEL = 'gpt-4o-mini';
const DEFAULT_TELNYX_VOICE = 'af';
const DEFAULT_TELNYX_TRANSCRIPTION_MODEL = resolveDefaultVoiceAgentTranscriptionModel();
const DEFAULT_TELNYX_LANGUAGE = resolveDefaultVoiceAgentLanguage();

function normalizeTelnyxVoice(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim() : '';

  if (!normalized) {
    return DEFAULT_TELNYX_VOICE;
  }

  return normalized.replace(/^Telnyx\.KokoroTTS\./, '').trim() || DEFAULT_TELNYX_VOICE;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authContext = await authenticateRequest(request);

    if (authContext instanceof Response) {
      return authContext;
    }

    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const workspaceId = typeof payload.workspace_id === 'string' ? payload.workspace_id.trim() : '';

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);

    if (payload.status === 'active') {
      return jsonResponse({
        error: 'New assistants must be created as drafts before activation.',
        activation_issues: ['At least one field mapping is required before the assistant can be activated.'],
      }, 400);
    }

    const validated = await validateVoiceAgentPayload(authContext.serviceClient, workspaceId, {
      name: typeof payload.name === 'string' ? payload.name : undefined,
      description: typeof payload.description === 'string' ? payload.description : payload.description === null ? null : undefined,
      greeting: typeof payload.greeting === 'string' ? payload.greeting : undefined,
      system_prompt: typeof payload.system_prompt === 'string' ? payload.system_prompt : undefined,
      source_id: typeof payload.source_id === 'string' ? payload.source_id : payload.source_id === null ? null : undefined,
      fallback_mode:
        typeof payload.fallback_mode === 'string' ? payload.fallback_mode : payload.fallback_mode === null ? null : undefined,
      record_creation_mode:
        typeof payload.record_creation_mode === 'string'
          ? payload.record_creation_mode
          : payload.record_creation_mode === null
            ? null
            : undefined,
      telnyx_model: typeof payload.telnyx_model === 'string' ? payload.telnyx_model : undefined,
      telnyx_voice: typeof payload.telnyx_voice === 'string' ? payload.telnyx_voice : undefined,
      telnyx_transcription_model:
        typeof payload.telnyx_transcription_model === 'string' ? payload.telnyx_transcription_model : undefined,
      telnyx_language: typeof payload.telnyx_language === 'string' ? payload.telnyx_language : undefined,
      status: typeof payload.status === 'string' ? payload.status as 'draft' | 'disabled' : 'draft',
    });

    let telnyxAssistantId: string | null = null;
    const normalizedTelnyxVoice = normalizeTelnyxVoice(validated.telnyxVoice);

    try {
      const telnyxAssistant = await createTelnyxAssistantForVoiceAgent({
        name: validated.name ?? '',
        description: validated.description,
        greeting: validated.greeting ?? '',
        systemPrompt: validated.systemPrompt ?? '',
        telnyxModel: validated.telnyxModel ?? DEFAULT_TELNYX_MODEL,
        telnyxVoice: normalizedTelnyxVoice,
        telnyxTranscriptionModel: validated.telnyxTranscriptionModel ?? DEFAULT_TELNYX_TRANSCRIPTION_MODEL,
        telnyxLanguage: validated.telnyxLanguage ?? DEFAULT_TELNYX_LANGUAGE,
      });
      telnyxAssistantId = telnyxAssistant.id;

      const agent = await createVoiceAgent(authContext.serviceClient, {
        workspaceId,
        name: validated.name ?? '',
        description: validated.description,
        status: validated.status === 'disabled' ? 'disabled' : 'draft',
        greeting: validated.greeting ?? '',
        systemPrompt: validated.systemPrompt ?? '',
        sourceId: validated.sourceId,
        fallbackMode: validated.fallbackMode,
        recordCreationMode: validated.recordCreationMode,
        telnyxModel: validated.telnyxModel ?? DEFAULT_TELNYX_MODEL,
        telnyxVoice: normalizedTelnyxVoice,
        telnyxTranscriptionModel: validated.telnyxTranscriptionModel ?? DEFAULT_TELNYX_TRANSCRIPTION_MODEL,
        telnyxLanguage: validated.telnyxLanguage ?? DEFAULT_TELNYX_LANGUAGE,
        telnyxAssistantId,
        telnyxSyncStatus: 'synced',
        telnyxSyncError: null,
        telnyxLastSyncedAt: new Date().toISOString(),
        createdBy: authContext.user.id,
      });

      return jsonResponse({ agent }, 201);
    } catch (error) {
      if (telnyxAssistantId) {
        try {
          await deleteTelnyxAssistant({ assistantId: telnyxAssistantId });
        } catch (cleanupError) {
          console.warn('[voice-agent-create] failed to delete Telnyx assistant after local create failure', {
            workspaceId,
            telnyxAssistantId,
            message: cleanupError instanceof Error ? cleanupError.message : 'Unknown error.',
          });
        }
      }

      throw new Error(formatTelnyxAssistantSyncError(error));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    const activationIssues =
      error instanceof Error && 'issues' in error && Array.isArray((error as { issues?: string[] }).issues)
        ? (error as { issues?: string[] }).issues
        : undefined;
    return jsonResponse({ error: message, ...(activationIssues ? { activation_issues: activationIssues } : {}) }, 400);
  }
});
