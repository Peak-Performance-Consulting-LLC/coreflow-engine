import { TelnyxApiError } from './telnyx-client.ts';
import {
  normalizeVoiceAgentLanguage,
  normalizeVoiceAgentTranscriptionModel,
  resolveDefaultVoiceAgentLanguage,
  resolveDefaultVoiceAgentTranscriptionModel,
} from './voice-agent-transcription.ts';
import {
  createTelnyxAssistant,
  updateTelnyxAssistant,
  type TelnyxAssistantPayload,
  type TelnyxAssistantRecord,
} from './telnyx-assistant-client.ts';

export interface VoiceAgentTelnyxSyncInput {
  name: string;
  description?: string | null;
  greeting: string;
  systemPrompt: string;
  telnyxModel: string;
  telnyxVoice: string;
  telnyxTranscriptionModel: string;
  telnyxLanguage: string;
}

const DEFAULT_ASSISTANT_MODEL = 'gpt-4o-mini';
const DEFAULT_ASSISTANT_VOICE = 'af';
const DEFAULT_TRANSCRIPTION_MODEL = resolveDefaultVoiceAgentTranscriptionModel();
const DEFAULT_TRANSCRIPTION_LANGUAGE = resolveDefaultVoiceAgentLanguage();

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeNullableString(value: unknown) {
  const normalized = getString(value);
  return normalized.length > 0 ? normalized : null;
}

function getTelnyxAssistantModel() {
  return getString(Deno.env.get('TELNYX_ASSISTANT_MODEL')) || DEFAULT_ASSISTANT_MODEL;
}

function getTelnyxAssistantVoice() {
  return getString(Deno.env.get('TELNYX_ASSISTANT_VOICE')) || DEFAULT_ASSISTANT_VOICE;
}

function getTelnyxAssistantTranscriptionModel() {
  return normalizeVoiceAgentTranscriptionModel(Deno.env.get('TELNYX_ASSISTANT_TRANSCRIPTION_MODEL')) ??
    DEFAULT_TRANSCRIPTION_MODEL;
}

function getTelnyxAssistantLanguage() {
  return normalizeVoiceAgentLanguage(Deno.env.get('TELNYX_ASSISTANT_LANGUAGE')) ?? DEFAULT_TRANSCRIPTION_LANGUAGE;
}

function normalizeTelnyxVoiceId(value: string) {
  const normalizedVoice = getString(value);

  if (!normalizedVoice) {
    return '';
  }

  const kokoroPrefix = 'Telnyx.KokoroTTS.';

  if (normalizedVoice.startsWith(kokoroPrefix)) {
    const stripped = normalizedVoice.slice(kokoroPrefix.length).trim();
    return stripped.length > 0 ? stripped : '';
  }

  if (normalizedVoice.startsWith('Telnyx.')) {
    const lastDot = normalizedVoice.lastIndexOf('.');

    if (lastDot > -1 && lastDot < normalizedVoice.length - 1) {
      return normalizedVoice.slice(lastDot + 1).trim();
    }
  }

  return normalizedVoice;
}

function normalizeTelnyxLanguageId(value: unknown) {
  return normalizeVoiceAgentLanguage(value) ?? '';
}

function isRetriableAssistantPayloadError(error: unknown) {
  if (!(error instanceof TelnyxApiError)) {
    return false;
  }

  // Telnyx returns 400/422 for payload issues and may also return generic 5xx-style
  // errors while still accepting a minimal assistant payload.
  if (error.status >= 500) {
    return true;
  }

  if (error.status === 400 || error.status === 422 || error.status === 409) {
    return true;
  }

  if (typeof error.responseBody !== 'object' || error.responseBody === null) {
    return false;
  }

  const rawMessage = JSON.stringify(error.responseBody).toLowerCase();
  return rawMessage.includes('voice') && rawMessage.includes('not found') ||
    rawMessage.includes('model') && rawMessage.includes('not found') ||
    rawMessage.includes('transcription') ||
    rawMessage.includes('an unexpected error occured') ||
    rawMessage.includes('an unexpected error occurred');
}

export function isRecoverableAssistantUpdateError(error: unknown) {
  if (!(error instanceof TelnyxApiError)) {
    return false;
  }

  if (error.status === 404) {
    return true;
  }

  if (typeof error.responseBody !== 'object' || error.responseBody === null) {
    return false;
  }

  const rawMessage = JSON.stringify(error.responseBody).toLowerCase();
  return rawMessage.includes('assistant') && rawMessage.includes('not found') ||
    rawMessage.includes('voice') && rawMessage.includes('not found') ||
    rawMessage.includes('model') && rawMessage.includes('not found') ||
    rawMessage.includes('an unexpected error occured') ||
    rawMessage.includes('an unexpected error occurred');
}

function buildMinimalAssistantPayload(payload: TelnyxAssistantPayload): TelnyxAssistantPayload {
  return {
    name: payload.name,
    model: payload.model,
    instructions: payload.instructions,
    ...(payload.greeting ? { greeting: payload.greeting } : {}),
    ...(payload.description ? { description: payload.description } : {}),
  };
}

function buildVoiceFallbackCandidate(voice: string) {
  const normalizedVoice = normalizeTelnyxVoiceId(voice);

  if (!normalizedVoice) {
    return null;
  }

  if (!normalizedVoice.startsWith('Telnyx.')) {
    return `Telnyx.KokoroTTS.${normalizedVoice}`;
  }

  return null;
}

export function buildTelnyxAssistantPayload(input: VoiceAgentTelnyxSyncInput): TelnyxAssistantPayload {
  const description = normalizeNullableString(input.description);
  const normalizedVoice = normalizeTelnyxVoiceId(input.telnyxVoice);
  const normalizedTranscriptionModel = normalizeVoiceAgentTranscriptionModel(input.telnyxTranscriptionModel);
  const normalizedLanguage = normalizeTelnyxLanguageId(input.telnyxLanguage) ||
    normalizeTelnyxLanguageId(getTelnyxAssistantLanguage()) ||
    DEFAULT_TRANSCRIPTION_LANGUAGE;

  return {
    name: getString(input.name),
    model: getString(input.telnyxModel) || getTelnyxAssistantModel(),
    instructions: getString(input.systemPrompt),
    greeting: getString(input.greeting),
    ...(description ? { description } : {}),
    enabled_features: ['telephony'],
    voice_settings: {
      voice: normalizedVoice || normalizeTelnyxVoiceId(getTelnyxAssistantVoice()) || DEFAULT_ASSISTANT_VOICE,
    },
    transcription: {
      model: normalizedTranscriptionModel || getTelnyxAssistantTranscriptionModel(),
      language: normalizedLanguage,
    },
  };
}

export async function createTelnyxAssistantForVoiceAgent(
  input: VoiceAgentTelnyxSyncInput,
): Promise<TelnyxAssistantRecord> {
  const payload = buildTelnyxAssistantPayload(input);
  const fallbackVoice = buildVoiceFallbackCandidate(input.telnyxVoice);

  try {
    return await createTelnyxAssistant({ payload });
  } catch (firstError) {
    if (!isRetriableAssistantPayloadError(firstError)) {
      throw firstError;
    }

    if (fallbackVoice) {
      try {
        return await createTelnyxAssistant({
          payload: {
            ...payload,
            voice_settings: {
              ...(isRecord(payload.voice_settings) ? payload.voice_settings : {}),
              voice: fallbackVoice,
            },
          },
        });
      } catch (secondError) {
        if (!isRetriableAssistantPayloadError(secondError)) {
          throw secondError;
        }
      }
    }

    // Fallback 2: let Telnyx pick default voice.
    try {
      return await createTelnyxAssistant({
        payload: {
          ...payload,
          voice_settings: undefined,
        },
      });
    } catch (thirdError) {
      if (!isRetriableAssistantPayloadError(thirdError)) {
        throw thirdError;
      }

      // Fallback 3: strip optional settings and submit only required payload fields.
      return createTelnyxAssistant({
        payload: buildMinimalAssistantPayload(payload),
      });
    }
  }
}

export async function updateTelnyxAssistantForVoiceAgent(
  assistantId: string,
  input: VoiceAgentTelnyxSyncInput,
): Promise<TelnyxAssistantRecord> {
  const payload = buildTelnyxAssistantPayload(input);
  const fallbackVoice = buildVoiceFallbackCandidate(input.telnyxVoice);

  try {
    return await updateTelnyxAssistant({
      assistantId,
      payload,
    });
  } catch (firstError) {
    if (!isRetriableAssistantPayloadError(firstError)) {
      throw firstError;
    }

    if (fallbackVoice) {
      try {
        return await updateTelnyxAssistant({
          assistantId,
          payload: {
            ...payload,
            voice_settings: {
              ...(isRecord(payload.voice_settings) ? payload.voice_settings : {}),
              voice: fallbackVoice,
            },
          },
        });
      } catch (secondError) {
        if (!isRetriableAssistantPayloadError(secondError)) {
          throw secondError;
        }
      }
    }

    // Fallback 2: let Telnyx pick default voice.
    try {
      return await updateTelnyxAssistant({
        assistantId,
        payload: {
          ...payload,
          voice_settings: undefined,
        },
      });
    } catch (thirdError) {
      if (!isRetriableAssistantPayloadError(thirdError)) {
        throw thirdError;
      }

      // Fallback 3: strip optional settings and submit only required payload fields.
      return updateTelnyxAssistant({
        assistantId,
        payload: buildMinimalAssistantPayload(payload),
      });
    }
  }
}

export function formatTelnyxAssistantSyncError(error: unknown) {
  if (error instanceof TelnyxApiError && isRecord(error.responseBody)) {
    const errors = Array.isArray(error.responseBody.errors) ? error.responseBody.errors : [];
    const first = errors.find((entry): entry is Record<string, unknown> => isRecord(entry));

    if (first) {
      const title = getString(first.title);
      const detail = getString(first.detail);
      return [title, detail].filter(Boolean).join(': ') || error.message;
    }

    const raw = JSON.stringify(error.responseBody);
    if (raw && raw !== '{}') {
      return `${error.message} ${raw}`;
    }
  }

  return error instanceof Error ? error.message : 'Unable to sync assistant with Telnyx.';
}
