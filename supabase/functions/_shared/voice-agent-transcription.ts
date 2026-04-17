const DEFAULT_TRANSCRIPTION_MODEL = 'deepgram/nova-3';
const DEFAULT_LANGUAGE = 'en-US';

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeVoiceAgentTranscriptionModel(value: unknown) {
  const normalized = getString(value);

  if (!normalized) {
    return null;
  }

  if (normalized.length > 128) {
    return null;
  }

  if (!/^[a-zA-Z0-9._/-]+$/.test(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizeVoiceAgentLanguage(value: unknown) {
  const normalized = getString(value).toLowerCase().replace(/_/g, '-');

  if (!normalized) {
    return null;
  }

  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(normalized)) {
    return null;
  }

  const [language, regionOrVariant] = normalized.split('-');

  if (!language) {
    return null;
  }

  return regionOrVariant ? `${language}-${regionOrVariant.toUpperCase()}` : language;
}

export function resolveDefaultVoiceAgentTranscriptionModel() {
  return normalizeVoiceAgentTranscriptionModel(Deno.env.get('TELNYX_ASSISTANT_TRANSCRIPTION_MODEL')) ??
    DEFAULT_TRANSCRIPTION_MODEL;
}

export function resolveDefaultVoiceAgentLanguage() {
  return normalizeVoiceAgentLanguage(Deno.env.get('TELNYX_ASSISTANT_LANGUAGE')) ?? DEFAULT_LANGUAGE;
}
