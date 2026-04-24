import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceOwner, getString, isRecordLike } from '../_shared/server.ts';
import { validateVoiceSystemPrompt } from '../_shared/voice-agent-prompt.ts';

type AssistantTone = 'friendly' | 'professional' | 'empathetic' | 'concise';

interface AssistantPromptInput {
  businessType?: string;
  assistantRole: string;
  callerTypes: string[];
  primaryGoal: string;
  collectFields: string[];
  tone: AssistantTone;
  language?: string;
  transferRule: string;
  restrictions?: string[];
  fallbackBehavior?: string;
}

interface GeneratedAssistantContent {
  suggestedName: string;
  description: string;
  greeting: string;
  systemPrompt: string;
  sampleQuestions: string[];
  usedFallback?: boolean;
  fallbackReason?: string;
}

const DEFAULT_MODEL = 'gemini-1.5-flash';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_RETRY_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 700;
const DEFAULT_RETRY_MAX_DELAY_MS = 5000;
const MAX_LIST_ITEMS = 8;

function normalizeStringList(value: unknown, maxItems: number = MAX_LIST_ITEMS) {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();

  for (const entry of value) {
    const normalized = getString(entry);

    if (!normalized) {
      continue;
    }

    unique.add(normalized);

    if (unique.size >= maxItems) {
      break;
    }
  }

  return Array.from(unique);
}

function parseTone(value: unknown): AssistantTone {
  const normalized = getString(value).toLowerCase();

  if (
    normalized === 'friendly' ||
    normalized === 'professional' ||
    normalized === 'empathetic' ||
    normalized === 'concise'
  ) {
    return normalized;
  }

  return 'friendly';
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function extractRetryAfterMs(response: Response) {
  const retryAfterRaw = getString(response.headers.get('retry-after'));

  if (!retryAfterRaw) {
    return null;
  }

  const seconds = Number.parseInt(retryAfterRaw, 10);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const asDate = Date.parse(retryAfterRaw);
  return Number.isFinite(asDate) ? Math.max(0, asDate - Date.now()) : null;
}

function computeRetryDelayMs(params: {
  attemptIndex: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryAfterMs: number | null;
}) {
  const exponential = Math.min(params.maxDelayMs, params.baseDelayMs * (2 ** params.attemptIndex));
  const jitter = Math.floor(Math.random() * 250);
  const candidate = exponential + jitter;

  if (!params.retryAfterMs || params.retryAfterMs <= 0) {
    return candidate;
  }

  return Math.min(params.maxDelayMs, Math.max(candidate, params.retryAfterMs));
}

async function requestModelWithRetry(params: {
  endpoint: string;
  requestBody: unknown;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  workspaceId: string;
  userId: string;
}) {
  let attempt = 0;
  const maxAttempts = params.maxRetries + 1;

  while (attempt < maxAttempts) {
    try {
      const response = await fetch(params.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params.requestBody),
      });

      const responseBody = await response.json().catch(() => null);

      if (response.ok) {
        return responseBody;
      }

      const canRetry = isRetryableStatus(response.status) && attempt + 1 < maxAttempts;

      if (!canRetry) {
        throw new Error(`Voice assistant generation failed with status ${response.status}.`);
      }

      const delayMs = computeRetryDelayMs({
        attemptIndex: attempt,
        baseDelayMs: params.baseDelayMs,
        maxDelayMs: params.maxDelayMs,
        retryAfterMs: extractRetryAfterMs(response),
      });

      console.warn('[generate-voice-assistant-config] retrying model request', {
        workspaceId: params.workspaceId,
        userId: params.userId,
        status: response.status,
        attempt: attempt + 1,
        maxAttempts,
        delayMs,
      });

      attempt += 1;
      await sleep(delayMs);
    } catch (error) {
      const canRetry = attempt + 1 < maxAttempts;

      if (!canRetry) {
        throw error;
      }

      const delayMs = computeRetryDelayMs({
        attemptIndex: attempt,
        baseDelayMs: params.baseDelayMs,
        maxDelayMs: params.maxDelayMs,
        retryAfterMs: null,
      });

      console.warn('[generate-voice-assistant-config] retrying after fetch error', {
        workspaceId: params.workspaceId,
        userId: params.userId,
        attempt: attempt + 1,
        maxAttempts,
        delayMs,
        message: error instanceof Error ? error.message : 'Unknown fetch error.',
      });

      attempt += 1;
      await sleep(delayMs);
    }
  }

  throw new Error('Voice assistant generation failed after retry attempts.');
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trim()}…`;
}

function joinList(values: string[], fallback: string) {
  return values.length > 0 ? values.join(', ') : fallback;
}

function formatCrmModeLabel(value: string) {
  const normalized = getString(value).replace(/-/g, ' ');
  return normalized ? toTitleCase(normalized) : '';
}

function resolveBusinessContextLabel(input: AssistantPromptInput, workspaceCrmType?: string) {
  return getString(input.businessType) || formatCrmModeLabel(workspaceCrmType) || 'this business';
}

function resolveLanguageLabel(input: AssistantPromptInput) {
  return getString(input.language) || 'English';
}

function resolveCallerContext(input: AssistantPromptInput) {
  return input.callerTypes.length > 0 ? joinList(input.callerTypes, 'general inbound callers') : 'general inbound callers';
}

function getDeterministicRestrictions(input: AssistantPromptInput) {
  const restrictions = uniqueSampleQuestions(input.restrictions ?? []);

  if (restrictions.length > 0) {
    return restrictions;
  }

  return [
    'Do not make promises, guarantees, or unsupported claims.',
    'Stay within intake, qualification, and routing responsibilities.',
  ];
}

function getDeterministicFallbackBehavior(input: AssistantPromptInput) {
  return getString(input.fallbackBehavior) ||
    'Ask one short clarifying question, then offer to take a message, arrange follow-up, or route the caller appropriately.';
}

function inferSuggestedName(input: AssistantPromptInput) {
  const base = input.assistantRole
    .replace(/\bassistant\b/gi, '')
    .replace(/\bvoice\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const businessType = getString(input.businessType);
  const combined = [businessType, base || 'Call Intake'].filter(Boolean).join(' ');
  return truncate(toTitleCase(combined || 'Inbound Call Intake'), 64);
}

function inferDescription(input: AssistantPromptInput, workspaceCrmType?: string) {
  const businessContext = resolveBusinessContextLabel(input, workspaceCrmType);
  const roleLabel = input.assistantRole.trim() ? input.assistantRole.trim().toLowerCase() : 'call intake assistant';

  return truncate(
    `Handles inbound calls for ${businessContext} as a ${roleLabel} and helps collect key details, qualify requests, and route callers appropriately.`,
    220,
  );
}

function inferGreeting(input: AssistantPromptInput, workspaceCrmType?: string) {
  const businessContext = resolveBusinessContextLabel(input, workspaceCrmType);

  if (businessContext && businessContext !== 'this business') {
    return truncate(
      `Hi, thanks for calling ${businessContext}. I can help with a few quick questions and get you to the right next step.`,
      220,
    );
  }

  return 'Hi, thanks for calling. I can help with a few quick questions and get you to the right next step.';
}

function uniqueSampleQuestions(values: string[]) {
  return Array.from(new Set(values.map((value) => getString(value)).filter(Boolean)));
}

function inferSampleQuestions(input: AssistantPromptInput) {
  const questions: string[] = [];
  const loweredFields = input.collectFields.map((field) => field.toLowerCase());

  questions.push('How can I help you today?');

  if (loweredFields.includes('full name')) {
    questions.push('What is your full name?');
  }

  if (loweredFields.includes('phone number')) {
    questions.push('What is the best phone number for follow-up?');
  }

  if (loweredFields.includes('email')) {
    questions.push('What email should we use to follow up with you?');
  }

  if (loweredFields.includes('inquiry type')) {
    questions.push('What is the main reason for your call today?');
  }

  if (loweredFields.includes('budget')) {
    questions.push('Do you have a target budget in mind?');
  }

  if (loweredFields.includes('location')) {
    questions.push('What location are you focused on?');
  }

  if (loweredFields.includes('timeline')) {
    questions.push('What is your timeline for moving forward?');
  }

  if (loweredFields.includes('preferred callback time')) {
    questions.push('When would you prefer a callback if a teammate follows up?');
  }

  if (questions.length < 3) {
    questions.push('Could you share a few details so I can route this correctly?');
  }

  return uniqueSampleQuestions(questions).slice(0, 5);
}

function buildFallbackSystemPrompt(input: AssistantPromptInput, workspaceCrmType?: string) {
  const businessContext = resolveBusinessContextLabel(input, workspaceCrmType);
  const callerContext = resolveCallerContext(input);
  const language = resolveLanguageLabel(input);
  const tone = input.tone || 'friendly';
  const restrictions = getDeterministicRestrictions(input);
  const fallbackBehavior = getDeterministicFallbackBehavior(input);
  const collectFields = input.collectFields.length > 0
    ? input.collectFields
    : ['Full name', 'Phone number', 'Inquiry type', 'Notes'];

  return [
    'ROLE',
    `You are a voice assistant for ${businessContext}. You handle inbound calls from ${callerContext}.`,
    '',
    'OBJECTIVE',
    `Your job is to ${input.primaryGoal}.`,
    '',
    'BUSINESS CONTEXT',
    '- Adapt your questions and language to the business context.',
    '- Stay aligned with the caller\'s likely reason for contacting the business.',
    '- Do not assume details that were not provided.',
    `- Respond in ${language} unless the caller clearly requires otherwise.`,
    '',
    'CALL FLOW',
    '1. Greet the caller briefly and naturally.',
    '2. Identify the caller\'s intent early.',
    '3. Ask one question at a time and collect the required details.',
    '4. Qualify, route, or escalate the caller based on the request.',
    '5. Confirm key details, explain next steps if appropriate, and end politely.',
    '',
    'DATA COLLECTION',
    'Collect:',
    ...collectFields.map((field) => `- ${field}`),
    '',
    'DATA QUALITY RULES',
    '- Confirm important details before moving on.',
    '- Repeat back phone numbers and email addresses when collected.',
    '- Avoid ambiguous or incomplete captured information.',
    '- Collect all required details when the caller is willing to provide them.',
    '',
    'CONVERSATION PRINCIPLES',
    '- Ask one question at a time.',
    '- Keep responses short and easy to understand over voice.',
    '- Avoid repeating questions unnecessarily.',
    '- Adapt follow-up questions based on previous answers.',
    '',
    'STATE HANDLING',
    '- If the caller is unclear, ask a short clarifying question.',
    '- If the caller seems rushed, prioritize the most important details first.',
    '- If the caller refuses to share information, politely offer transfer, callback, or message-taking if appropriate.',
    '- If enough information has been collected, move toward routing or closing efficiently.',
    '',
    'INTENT HANDLING',
    '- Quickly determine whether the caller needs information, support, scheduling, qualification, complaint handling, or escalation.',
    '- Adjust the conversation flow once the caller\'s intent is clear.',
    '- Avoid irrelevant questions.',
    '',
    'ESCALATION LOGIC',
    `- ${input.transferRule}`,
    '- Transfer if the caller explicitly asks for a human.',
    '- Prioritize transfer if the request is urgent, high-value, or cannot be handled confidently within scope.',
    '- Otherwise, collect the most important required details before escalation.',
    '',
    'BOUNDARIES',
    ...restrictions.map((restriction) => `- ${restriction}`),
    '- Do not guess or fabricate information.',
    '- Do not make commitments about outcomes, pricing, timing, availability, refunds, or policies unless confirmed.',
    '- Stay within your intake and routing role.',
    '',
    'ERROR HANDLING',
    '- If an answer is incomplete, ask a brief follow-up question.',
    '- If the conversation becomes confusing, restate your purpose simply and continue.',
    '- If the caller goes off-topic, gently guide them back to the main purpose of the call.',
    '',
    'VOICE GUIDELINES',
    `- Use a ${tone} tone.`,
    '- Use natural spoken language.',
    '- Keep sentences short and clear.',
    '- Sound calm, helpful, and professional.',
    '',
    'FALLBACK',
    `- ${fallbackBehavior}`,
    '',
    'CALL COMPLETION',
    '- Confirm the main captured details before ending.',
    '- Explain the next step if appropriate.',
    '- Ensure the caller knows whether they will be contacted or transferred.',
    '- End politely and clearly.',
  ].join('\n');
}

function buildFallbackContent(
  input: AssistantPromptInput,
  reason: string = 'Deterministic fallback content was used.',
  workspaceCrmType?: string,
): GeneratedAssistantContent {
  const fallback: GeneratedAssistantContent = {
    suggestedName: inferSuggestedName(input),
    description: inferDescription(input, workspaceCrmType),
    greeting: inferGreeting(input, workspaceCrmType),
    systemPrompt: buildFallbackSystemPrompt(input, workspaceCrmType),
    sampleQuestions: inferSampleQuestions(input),
    usedFallback: true,
    fallbackReason: reason,
  };

  const promptValidation = validateVoiceSystemPrompt(fallback.systemPrompt);
  fallback.systemPrompt = promptValidation.normalized;

  return fallback;
}

function normalizeGeneratedText(value: unknown, maxLength: number) {
  const normalized = getString(value).replace(/\s+/g, ' ').trim();
  return normalized ? truncate(normalized, maxLength) : '';
}

function parseGeneratedResponse(responseBody: unknown) {
  if (!isRecordLike(responseBody)) {
    throw new Error('Model response was not an object.');
  }

  const candidates = Array.isArray(responseBody.candidates) ? responseBody.candidates : [];
  const firstCandidate = candidates.find((entry) => isRecordLike(entry));
  const candidateContent = firstCandidate && isRecordLike(firstCandidate.content) ? firstCandidate.content : null;
  const parts = candidateContent && Array.isArray(candidateContent.parts) ? candidateContent.parts : [];
  const firstPart = parts.find((entry) => isRecordLike(entry));
  const rawText = firstPart ? getString(firstPart.text) : '';
  const content = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (!content) {
    throw new Error('Model response was empty.');
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Model response was not valid JSON.');
  }

  if (!isRecordLike(parsed)) {
    throw new Error('Model JSON body was not an object.');
  }

  return parsed;
}

function sanitizeGeneratedContent(
  parsed: Record<string, unknown>,
  fallback: GeneratedAssistantContent,
): GeneratedAssistantContent {
  const sampleQuestions = uniqueSampleQuestions(
    Array.isArray(parsed.sampleQuestions)
      ? parsed.sampleQuestions.map((entry) => getString(entry))
      : fallback.sampleQuestions,
  ).slice(0, 5);

  const promptCandidate = getString(parsed.systemPrompt) || fallback.systemPrompt;
  const promptValidation = validateVoiceSystemPrompt(promptCandidate);

  return {
    suggestedName: normalizeGeneratedText(parsed.suggestedName, 64) || fallback.suggestedName,
    description: normalizeGeneratedText(parsed.description, 220) || fallback.description,
    greeting: normalizeGeneratedText(parsed.greeting, 240) || fallback.greeting,
    systemPrompt: promptValidation.issue ? fallback.systemPrompt : promptValidation.normalized,
    sampleQuestions: sampleQuestions.length >= 3 ? sampleQuestions : fallback.sampleQuestions,
    usedFallback: false,
  };
}

function parseInput(payload: Record<string, unknown>): AssistantPromptInput {
  const input: AssistantPromptInput = {
    businessType: getString(payload.businessType) || undefined,
    assistantRole: getString(payload.assistantRole),
    callerTypes: normalizeStringList(payload.callerTypes),
    primaryGoal: getString(payload.primaryGoal),
    collectFields: normalizeStringList(payload.collectFields),
    tone: parseTone(payload.tone),
    language: getString(payload.language) || undefined,
    transferRule: getString(payload.transferRule),
    restrictions: normalizeStringList(payload.restrictions),
    fallbackBehavior: getString(payload.fallbackBehavior) || undefined,
  };

  if (!input.assistantRole) {
    throw new Error('assistantRole is required.');
  }

  if (!input.primaryGoal) {
    throw new Error('primaryGoal is required.');
  }

  if (input.collectFields.length === 0) {
    throw new Error('At least one collectField is required.');
  }

  if (!input.transferRule) {
    throw new Error('transferRule is required.');
  }

  return input;
}

function buildModelPrompt(params: {
  workspaceName: string;
  workspaceCrmType: string;
  input: AssistantPromptInput;
}) {
  const { input } = params;

  return [
    'Generate configuration text for a CRM voice assistant used in structured inbound call workflows.',
    'This is not a generic chatbot.',
    'The product supports multiple CRM modes, so do not assume a specific industry unless the provided business type or workspace context makes it clear.',
    'The assistant must support caller qualification, data capture, escalation rules, and safe operational scope.',
    'Keep the output concise, voice-friendly, realistic, and directly usable.',
    'Avoid guarantees, risky claims, legal or pricing commitments, or unsupported actions.',
    'Return JSON only with this exact shape:',
    '{',
    '  "suggestedName": "string",',
    '  "description": "string",',
    '  "greeting": "string",',
    '  "systemPrompt": "string",',
    '  "sampleQuestions": ["string", "string", "string"]',
    '}',
    'systemPrompt must include these sections in order:',
    'ROLE',
    'OBJECTIVE',
    'CALL FLOW',
    'DATA COLLECTION',
    'ESCALATION RULES',
    'RESTRICTIONS',
    'TONE',
    'FALLBACK',
    'CLOSING',
    'sampleQuestions must contain 3 to 5 realistic questions the assistant would ask.',
    '',
    'Workspace context:',
    `- Workspace name: ${params.workspaceName || 'Unknown workspace'}`,
    `- CRM type: ${params.workspaceCrmType || 'Unknown'}`,
    '',
    'Assistant setup input:',
    `- Business type: ${input.businessType ?? 'Not provided'}`,
    `- Assistant role: ${input.assistantRole}`,
    `- Caller types: ${joinList(input.callerTypes, 'General inbound callers')}`,
    `- Primary goal: ${input.primaryGoal}`,
    `- Collect fields: ${joinList(input.collectFields, 'Basic caller details')}`,
    `- Tone: ${input.tone}`,
    `- Language: ${input.language ?? 'Default workspace language'}`,
    `- Transfer rule: ${input.transferRule}`,
    `- Restrictions: ${joinList(input.restrictions ?? [], 'No extra restrictions provided')}`,
    `- Fallback behavior: ${input.fallbackBehavior ?? 'Ask a clarifying question and offer next steps'}`,
  ].join('\n');
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

    const workspace = await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);
    const input = parseInput(payload);
    const geminiApiKey = getString(Deno.env.get('GEMINI_API_KEY')) || getString(Deno.env.get('GOOGLE_API_KEY'));

    if (!geminiApiKey) {
      return jsonResponse({ error: 'AI assistant generation is not configured.' }, 500);
    }

    const model = getString(Deno.env.get('VOICE_ASSISTANT_CONFIG_MODEL')) || DEFAULT_MODEL;
    const baseUrl = getString(Deno.env.get('GEMINI_API_BASE_URL')) || DEFAULT_BASE_URL;
    const maxRetries = parseNonNegativeInt(
      Deno.env.get('VOICE_ASSISTANT_CONFIG_RETRY_MAX_RETRIES'),
      DEFAULT_RETRY_MAX_RETRIES,
    );
    const baseDelayMs = parsePositiveInt(
      Deno.env.get('VOICE_ASSISTANT_CONFIG_RETRY_BASE_DELAY_MS'),
      DEFAULT_RETRY_BASE_DELAY_MS,
    );
    const maxDelayMs = parsePositiveInt(
      Deno.env.get('VOICE_ASSISTANT_CONFIG_RETRY_MAX_DELAY_MS'),
      DEFAULT_RETRY_MAX_DELAY_MS,
    );

    const prompt = buildModelPrompt({
      workspaceName: getString(workspace.name),
      workspaceCrmType: getString(workspace.crm_type),
      input,
    });

    const requestBody = {
      systemInstruction: {
        parts: [{
          text:
            'You create safe, workflow-aware configuration text for CRM voice assistants. Output only valid JSON and do not include markdown.',
        }],
      },
      contents: [{
        role: 'user',
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    };

    const endpoint = `${baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent?key=${
      encodeURIComponent(geminiApiKey)
    }`;

    const deterministicFallback = (reason: string) => {
      console.warn('[generate-voice-assistant-config] generation failed, using fallback', {
        workspaceId,
        userId: authContext.user.id,
        reason,
      });

      return jsonResponse(buildFallbackContent(input, reason, getString(workspace.crm_type)));
    };

    try {
      const responseBody = await requestModelWithRetry({
        endpoint,
        requestBody,
        maxRetries,
        baseDelayMs,
        maxDelayMs,
        workspaceId,
        userId: authContext.user.id,
      });

      const parsed = parseGeneratedResponse(responseBody);
      const result = sanitizeGeneratedContent(
        parsed,
        buildFallbackContent(input, undefined, getString(workspace.crm_type)),
      );

      return jsonResponse({
        ...result,
        usedFallback: false,
        fallbackReason: undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown generation error.';
      return deterministicFallback(message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
