export const VOICE_SYSTEM_PROMPT_MAX_LENGTH = 4000;

const VOICE_OPTIMIZATION_BLOCK = [
  'Voice pacing rules:',
  '- Keep replies brief and conversational.',
  '- Ask only one question at a time.',
  '- Avoid repeating the same instruction or question unless needed.',
  '- Confirm only critical contact details (name, phone, email) when uncertain.',
  '- If input is unclear, ask a short clarification question and continue.',
].join('\n');

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n');
}

function collapseExcessBlankLines(value: string) {
  return value.replace(/\n{3,}/g, '\n\n');
}

export function normalizeVoiceSystemPrompt(value: string) {
  const normalized = normalizeLineEndings(value);
  const lines = normalized.split('\n').map((line) => line.trimEnd());
  const compacted = collapseExcessBlankLines(lines.join('\n')).trim();
  return compacted;
}

function hasExcessiveRepeatedLines(value: string) {
  const lines = value
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length >= 12);

  if (lines.length < 6) {
    return false;
  }

  const counts = new Map<string, number>();

  for (const line of lines) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }

  for (const count of counts.values()) {
    if (count >= 4) {
      return true;
    }
  }

  return false;
}

export function validateVoiceSystemPrompt(value: string) {
  const normalized = normalizeVoiceSystemPrompt(value);

  if (!normalized) {
    return {
      normalized,
      issue: 'system_prompt is required.',
    };
  }

  if (normalized.length > VOICE_SYSTEM_PROMPT_MAX_LENGTH) {
    return {
      normalized,
      issue: `system_prompt must be ${VOICE_SYSTEM_PROMPT_MAX_LENGTH} characters or fewer for live voice use.`,
    };
  }

  if (hasExcessiveRepeatedLines(normalized)) {
    return {
      normalized,
      issue: 'system_prompt contains too many repeated instruction lines. Remove duplicate blocks to improve live pacing.',
    };
  }

  return {
    normalized,
    issue: null as string | null,
  };
}

export function buildVoiceProviderInstructions(systemPrompt: string) {
  const normalizedPrompt = normalizeVoiceSystemPrompt(systemPrompt);

  if (!normalizedPrompt) {
    return VOICE_OPTIMIZATION_BLOCK;
  }

  return `${VOICE_OPTIMIZATION_BLOCK}\n\n${normalizedPrompt}`;
}
