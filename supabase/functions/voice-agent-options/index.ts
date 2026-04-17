import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceOwner } from '../_shared/server.ts';
import { listTelnyxAiModels, listTelnyxVoices } from '../_shared/telnyx-options-client.ts';
import {
  normalizeVoiceAgentLanguage,
  resolveDefaultVoiceAgentLanguage,
  resolveDefaultVoiceAgentTranscriptionModel,
} from '../_shared/voice-agent-transcription.ts';

const DEFAULT_TELNYX_MODEL = 'gpt-4o-mini';
const DEFAULT_TELNYX_VOICE = 'af';
const DEFAULT_TRANSCRIPTION_MODEL = resolveDefaultVoiceAgentTranscriptionModel();
const DEFAULT_LANGUAGE = resolveDefaultVoiceAgentLanguage();

const KNOWN_TRANSCRIPTION_MODELS = [
  'deepgram/flux',
  'deepgram/nova-3',
  'deepgram/nova-2',
  'distil-whisper/distil-large-v2',
  'openai/whisper-large-v3-turbo',
  'azure/fast',
];

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueSorted(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.trim();

    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(normalized);
  }

  return output.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

function normalizeVoiceId(value: unknown) {
  const normalized = getString(value);

  if (!normalized) {
    return '';
  }

  return normalized.replace(/^Telnyx\.KokoroTTS\./, '').trim();
}

function normalizeLanguage(value: unknown) {
  return normalizeVoiceAgentLanguage(value) ?? '';
}

function getLanguageVariants(value: string) {
  const normalized = normalizeLanguage(value);

  if (!normalized) {
    return [];
  }

  const [base] = normalized.split('-');

  if (!base || base === normalized) {
    return [normalized];
  }

  return [base, normalized];
}

function isLikelyTranscriptionModel(modelId: string) {
  const normalized = modelId.toLowerCase();
  return normalized.includes('whisper') ||
    normalized.includes('deepgram') ||
    normalized.includes('speech') ||
    normalized.includes('transcrib') ||
    normalized.includes('stt');
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
    const workspaceId = getString(payload.workspace_id);

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);

    const warnings: string[] = [];
    let modelIds: string[] = [];
    let voiceIds: string[] = [];
    let voiceLanguages: string[] = [];

    try {
      const models = await listTelnyxAiModels({});
      modelIds = models.map((model) => model.id);
    } catch (error) {
      warnings.push(`Unable to load Telnyx models: ${error instanceof Error ? error.message : 'Unknown error.'}`);
    }

    try {
      const voices = await listTelnyxVoices({ provider: 'telnyx' });
      voiceIds = voices.map((voice) => normalizeVoiceId(voice.voice_id)).filter(Boolean);
      voiceLanguages = voices
        .flatMap((voice) => getLanguageVariants(getString(voice.language)))
        .filter(Boolean);
    } catch (error) {
      warnings.push(`Unable to load Telnyx voices: ${error instanceof Error ? error.message : 'Unknown error.'}`);
    }

    const transcriptionModelCandidates = modelIds.filter((modelId) => isLikelyTranscriptionModel(modelId));

    const telnyxModels = uniqueSorted([DEFAULT_TELNYX_MODEL, ...modelIds]);
    const telnyxVoices = uniqueSorted([DEFAULT_TELNYX_VOICE, ...voiceIds]);
    const telnyxTranscriptionModels = uniqueSorted([
      DEFAULT_TRANSCRIPTION_MODEL,
      ...KNOWN_TRANSCRIPTION_MODELS,
      ...transcriptionModelCandidates,
    ]);
    const telnyxLanguages = uniqueSorted([DEFAULT_LANGUAGE, ...voiceLanguages]);

    return jsonResponse({
      options: {
        telnyx_models: telnyxModels,
        telnyx_voices: telnyxVoices,
        telnyx_transcription_models: telnyxTranscriptionModels,
        telnyx_languages: telnyxLanguages,
      },
      warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
