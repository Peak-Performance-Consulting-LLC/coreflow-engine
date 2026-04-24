import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabaseClient';
import type {
  AssistantPromptInput,
  GenerateVoiceAssistantConfigInput,
  GeneratedAssistantContent,
} from '../types/voice-assistant-ai';
import type { VoiceAgentRecord } from './voice-agent-service';

function getAuthHeaders(session: Session) {
  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeString(entry))
    .filter(Boolean)
    .slice(0, 5);
}

const PROMPT_HEADINGS = new Set([
  'ROLE',
  'OBJECTIVE',
  'BUSINESS CONTEXT',
  'CALL FLOW',
  'DATA COLLECTION',
  'DATA QUALITY RULES',
  'CONVERSATION PRINCIPLES',
  'STATE HANDLING',
  'INTENT HANDLING',
  'ESCALATION LOGIC',
  'ESCALATION RULES',
  'BOUNDARIES',
  'RESTRICTIONS',
  'ERROR HANDLING',
  'VOICE GUIDELINES',
  'TONE',
  'FALLBACK',
  'CALL COMPLETION',
  'CLOSING',
]);

function splitNaturalLanguageList(value: string) {
  return value
    .split(/,| and /i)
    .map((entry) => normalizeString(entry.replace(/\.$/, '')))
    .filter(Boolean)
    .slice(0, 5);
}

function extractPromptSection(prompt: string, headings: string[]) {
  const lines = prompt.replace(/\r\n?/g, '\n').split('\n');
  const headingSet = new Set(headings);
  const startIndex = lines.findIndex((line) => headingSet.has(line.trim()));

  if (startIndex < 0) {
    return '';
  }

  const collected: string[] = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();

    if (PROMPT_HEADINGS.has(trimmed)) {
      break;
    }

    collected.push(lines[index]);
  }

  return collected.join('\n').trim();
}

function extractBulletLines(section: string) {
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => normalizeString(line.slice(2)));
}

function deriveRoleLabel(agent: VoiceAgentRecord) {
  const description = normalizeString(agent.description);
  const fromDescription = description.match(/as a (.+?) and helps/i)?.[1];
  return normalizeString(fromDescription) || normalizeString(agent.name) || 'Inbound call assistant';
}

function deriveLanguageLabel(agent: VoiceAgentRecord, businessContextSection: string) {
  const fromPrompt = businessContextSection.match(/Respond in (.+?) unless/i)?.[1];
  return normalizeString(fromPrompt) || normalizeString(agent.telnyx_language) || 'English';
}

export function deriveAssistantPromptInputFromAgent(
  agent: VoiceAgentRecord,
  suggestedBusinessType?: string,
): AssistantPromptInput {
  const systemPrompt = normalizeString(agent.system_prompt);
  const roleSection = extractPromptSection(systemPrompt, ['ROLE']);
  const objectiveSection = extractPromptSection(systemPrompt, ['OBJECTIVE']);
  const dataCollectionSection = extractPromptSection(systemPrompt, ['DATA COLLECTION']);
  const escalationSection = extractPromptSection(systemPrompt, ['ESCALATION LOGIC', 'ESCALATION RULES']);
  const restrictionsSection = extractPromptSection(systemPrompt, ['BOUNDARIES', 'RESTRICTIONS']);
  const fallbackSection = extractPromptSection(systemPrompt, ['FALLBACK']);
  const voiceGuidelinesSection = extractPromptSection(systemPrompt, ['VOICE GUIDELINES', 'TONE']);
  const businessContextSection = extractPromptSection(systemPrompt, ['BUSINESS CONTEXT']);

  const businessTypeFromPrompt = roleSection.match(/voice assistant for (.+?)\./i)?.[1];
  const callerTypesFromPrompt = roleSection.match(/inbound calls from (.+?)\./i)?.[1];
  const primaryGoal = objectiveSection.replace(/^Your job is to\s+/i, '').replace(/\.$/, '').trim();
  const collectFields = extractBulletLines(dataCollectionSection).filter((line) => !/^collect:?$/i.test(line));
  const transferRule = extractBulletLines(escalationSection)[0] ?? '';
  const restrictions = extractBulletLines(restrictionsSection).slice(0, 5);
  const fallbackBehavior = extractBulletLines(fallbackSection)[0] ?? '';
  const toneMatch = voiceGuidelinesSection.match(/Use a ([a-z]+) tone/i) ?? voiceGuidelinesSection.match(/- ([a-z]+)$/im);
  const toneValue = normalizeString(toneMatch?.[1]).toLowerCase();

  return {
    businessType: normalizeString(businessTypeFromPrompt) || normalizeString(suggestedBusinessType) || undefined,
    assistantRole: deriveRoleLabel(agent),
    callerTypes: callerTypesFromPrompt ? splitNaturalLanguageList(callerTypesFromPrompt) : [],
    primaryGoal: primaryGoal || normalizeString(agent.description) || 'Collect key details, qualify requests, and route callers appropriately',
    collectFields,
    tone: toneValue === 'professional' || toneValue === 'empathetic' || toneValue === 'concise' ? toneValue : 'friendly',
    language: deriveLanguageLabel(agent, businessContextSection) || undefined,
    transferRule: transferRule || 'Transfer if the caller asks for a human or if the request is urgent or outside scope',
    restrictions,
    fallbackBehavior: fallbackBehavior || undefined,
  };
}

async function parseInvokeError(error: unknown) {
  let message = error instanceof Error ? error.message : 'Request failed.';
  const context = isRecord(error) ? error.context : null;

  if (context instanceof Response) {
    try {
      const payload = await context.clone().json();

      if (isRecord(payload) && typeof payload.error === 'string' && payload.error.trim()) {
        message = payload.error.trim();
      }
    } catch {
      // Fall back to the original message if the error payload cannot be parsed.
    }
  }

  return message;
}

function normalizeGeneratedAssistantContent(value: unknown): GeneratedAssistantContent | null {
  if (!isRecord(value)) {
    return null;
  }

  const suggestedName = normalizeString(value.suggestedName);
  const description = normalizeString(value.description);
  const greeting = normalizeString(value.greeting);
  const systemPrompt = normalizeString(value.systemPrompt);

  if (!suggestedName || !description || !greeting || !systemPrompt) {
    return null;
  }

  return {
    suggestedName,
    description,
    greeting,
    systemPrompt,
    sampleQuestions: normalizeStringList(value.sampleQuestions),
    usedFallback: value.usedFallback === true,
    fallbackReason: normalizeString(value.fallbackReason) || undefined,
  };
}

export function sanitizeVoiceAssistantFallbackReason(reason?: string | null) {
  const normalized = normalizeString(reason);

  if (!normalized) {
    return null;
  }

  if (/status\s*\d+|json|gemini|endpoint|retry|fetch|model response|request failed|unexpected/i.test(normalized)) {
    return 'The advanced AI response could not be used fully, so a simpler draft was returned.';
  }

  if (normalized.length > 180) {
    return `${normalized.slice(0, 177).trim()}...`;
  }

  return normalized;
}

export async function generateVoiceAssistantConfig(
  session: Session,
  payload: GenerateVoiceAssistantConfigInput,
) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<GeneratedAssistantContent>(
    'generate-voice-assistant-config',
    {
      body: payload,
      headers: getAuthHeaders(session),
    },
  );

  if (error) {
    throw new Error(await parseInvokeError(error));
  }

  if (!data) {
    throw new Error('AI assistant generation returned an empty response.');
  }

  const normalized = normalizeGeneratedAssistantContent(data);

  if (!normalized) {
    throw new Error('AI assistant generation returned an invalid response.');
  }

  return normalized;
}
