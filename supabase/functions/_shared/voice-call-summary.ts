import type { EdgeClient } from './server.ts';
import {
  listVoiceCallArtifactsByVoiceCallId,
  saveVoiceCallArtifact,
  type VoiceCallArtifactRow,
  type VoiceCallRow,
} from './voice-repository.ts';

interface TranscriptMessage {
  role: string;
  content: string;
}

interface VoiceCallSummaryResult {
  summary: string;
  highlights: string[];
  outcome: string;
  follow_up_recommendation: string;
}

const DEFAULT_SUMMARY_MODEL = 'gemini-1.5-flash';
const DEFAULT_MAX_TRANSCRIPT_CHARS = 6000;
const MIN_TRANSCRIPT_MESSAGE_COUNT = 3;
const MIN_TRANSCRIPT_CHARS = 80;
const DEFAULT_RETRY_MAX_RETRIES = 1;
const DEFAULT_RETRY_BASE_DELAY_MS = 3000;
const DEFAULT_RETRY_MAX_DELAY_MS = 15000;
const DEFAULT_THROTTLE_MS = 2000;
const SUMMARY_ARTIFACT_TYPES = ['summary', 'disposition', 'follow_up_recommendation'] as const;

function nowIso() {
  return new Date().toISOString();
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateForLog(value: string, maxLength = 2000) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function toLoggableBody(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return truncateForLog(value);
  }

  try {
    return truncateForLog(JSON.stringify(value));
  } catch {
    return '[unserializable response body]';
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableSummaryStatus(status: number) {
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

  if (!Number.isFinite(asDate)) {
    return null;
  }

  return Math.max(0, asDate - Date.now());
}

function computeRetryDelayMs(params: {
  attemptIndex: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryAfterMs: number | null;
}) {
  const exponential = Math.min(
    params.maxDelayMs,
    params.baseDelayMs * (2 ** params.attemptIndex),
  );
  const jitter = Math.floor(Math.random() * 250);
  const candidate = exponential + jitter;

  if (!params.retryAfterMs || params.retryAfterMs <= 0) {
    return candidate;
  }

  return Math.min(params.maxDelayMs, Math.max(candidate, params.retryAfterMs));
}

async function requestGeminiSummaryWithRetry(params: {
  endpoint: string;
  requestBody: unknown;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  workspaceId: string;
  voiceCallId: string;
  model: string;
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

      const status = response.status;
      const responseBodyForLog = toLoggableBody(responseBody);
      const canRetry = isRetryableSummaryStatus(status) && attempt + 1 < maxAttempts;

      console.warn('[voice-call-summary] Gemini summary request returned non-OK status', {
        workspaceId: params.workspaceId,
        voiceCallId: params.voiceCallId,
        model: params.model,
        status,
        attempt: attempt + 1,
        maxAttempts,
        responseBody: responseBodyForLog,
      });

      if (!canRetry) {
        throw new Error(`AI summary request failed with status ${status}.`);
      }

      const retryAfterMs = extractRetryAfterMs(response);
      const delayMs = computeRetryDelayMs({
        attemptIndex: attempt,
        baseDelayMs: params.baseDelayMs,
        maxDelayMs: params.maxDelayMs,
        retryAfterMs,
      });

      console.warn('[voice-call-summary] retrying Gemini summary request', {
        workspaceId: params.workspaceId,
        voiceCallId: params.voiceCallId,
        model: params.model,
        status,
        attempt: attempt + 1,
        maxAttempts,
        delayMs,
        retryAfterMs,
        responseBody: responseBodyForLog,
      });

      attempt += 1;
      await sleep(delayMs);
      continue;
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

      console.warn('[voice-call-summary] retrying Gemini summary request after fetch error', {
        workspaceId: params.workspaceId,
        voiceCallId: params.voiceCallId,
        model: params.model,
        attempt: attempt + 1,
        maxAttempts,
        delayMs,
        message: error instanceof Error ? error.message : 'Unknown fetch error',
      });

      attempt += 1;
      await sleep(delayMs);
    }
  }

  throw new Error('AI summary request failed after retry attempts.');
}

function isRelevantSummaryArtifact(artifact: VoiceCallArtifactRow) {
  return SUMMARY_ARTIFACT_TYPES.includes(artifact.artifact_type as (typeof SUMMARY_ARTIFACT_TYPES)[number]);
}

async function listRelevantSummaryArtifacts(params: {
  db: EdgeClient;
  workspaceId: string;
  voiceCallId: string;
}) {
  const existing = await listVoiceCallArtifactsByVoiceCallId(params.db, params.workspaceId, params.voiceCallId);
  return existing.filter((artifact) => isRelevantSummaryArtifact(artifact));
}

async function shouldSkipGeneration(params: {
  db: EdgeClient;
  workspaceId: string;
  voiceCallId: string;
}) {
  const relevant = await listRelevantSummaryArtifacts(params);

  if (relevant.length === 0) {
    return { skip: false, reason: 'no_artifacts' as const };
  }

  if (relevant.some((artifact) => artifact.status === 'processing' || artifact.status === 'ready')) {
    return { skip: true, reason: 'already_processing_or_ready' as const };
  }

  if (relevant.length === SUMMARY_ARTIFACT_TYPES.length && relevant.every((artifact) => artifact.status === 'failed')) {
    return { skip: false, reason: 'retry_failed_artifacts' as const };
  }

  if (relevant.every((artifact) => artifact.status === 'pending')) {
    return { skip: false, reason: 'pending_placeholders' as const };
  }

  return { skip: true, reason: 'mixed_artifact_state' as const };
}

async function reserveProcessingArtifacts(params: {
  db: EdgeClient;
  workspaceId: string;
  voiceCallId: string;
}) {
  const generatedAt = nowIso();

  for (const artifactType of SUMMARY_ARTIFACT_TYPES) {
    await saveVoiceCallArtifact(params.db, {
      workspaceId: params.workspaceId,
      voiceCallId: params.voiceCallId,
      artifactType,
      status: 'processing',
      source: 'ai_summary_v1',
      contentText: null,
      contentJson: {},
      model: null,
      errorText: null,
      generatedAt,
    });
  }

  const relevant = await listRelevantSummaryArtifacts(params);
  const claimed = relevant.length === SUMMARY_ARTIFACT_TYPES.length &&
    relevant.every((artifact) =>
      artifact.status === 'processing' &&
      artifact.generated_at === generatedAt &&
      artifact.source === 'ai_summary_v1'
    );

  return {
    claimed,
    generatedAt,
    relevant,
  };
}

function toTranscriptMessages(messageHistory: unknown): TranscriptMessage[] {
  if (!Array.isArray(messageHistory)) {
    return [];
  }

  return messageHistory
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const role = getString(entry.role).toLowerCase();
      const content = normalizeWhitespace(getString(entry.content));

      if (!role || !content) {
        return null;
      }

      return { role, content };
    })
    .filter((entry): entry is TranscriptMessage => Boolean(entry));
}

function serializeTranscript(messages: TranscriptMessage[], maxChars: number) {
  if (messages.length === 0) {
    return '';
  }

  const chunks: string[] = [];
  let total = 0;

  for (const message of messages) {
    const line = `${message.role}: ${message.content}`;
    const projected = total + line.length + 1;

    if (projected > maxChars) {
      break;
    }

    chunks.push(line);
    total = projected;
  }

  return chunks.join('\n');
}

function parseSummaryResponse(responseBody: unknown): VoiceCallSummaryResult {
  if (!isRecord(responseBody)) {
    throw new Error('AI summary response was not an object.');
  }

  const candidates = Array.isArray(responseBody.candidates) ? responseBody.candidates : [];
  const firstCandidate = candidates.find((entry) => isRecord(entry));
  const candidateContent = firstCandidate && isRecord(firstCandidate.content) ? firstCandidate.content : null;
  const parts = candidateContent && Array.isArray(candidateContent.parts) ? candidateContent.parts : [];
  const firstPart = parts.find((entry) => isRecord(entry));
  const rawContent = firstPart ? getString(firstPart.text) : '';
  const content = rawContent
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (!content) {
    throw new Error('AI summary response was empty.');
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('AI summary response was not valid JSON.');
  }

  if (!isRecord(parsed)) {
    throw new Error('AI summary JSON body was not an object.');
  }

  const summary = normalizeWhitespace(getString(parsed.summary));
  const outcome = normalizeWhitespace(getString(parsed.outcome));
  const followUp = normalizeWhitespace(getString(parsed.follow_up_recommendation));
  const highlightsRaw = Array.isArray(parsed.highlights) ? parsed.highlights : [];
  const highlights = highlightsRaw
    .map((entry) => normalizeWhitespace(getString(entry)))
    .filter(Boolean)
    .slice(0, 5);

  if (!summary || !outcome || !followUp || highlights.length === 0) {
    throw new Error('AI summary JSON was missing required fields.');
  }

  return {
    summary,
    highlights,
    outcome,
    follow_up_recommendation: followUp,
  };
}

async function markSummaryArtifactsFailed(params: {
  db: EdgeClient;
  workspaceId: string;
  voiceCallId: string;
  errorText: string;
}) {
  for (const artifactType of ['summary', 'disposition', 'follow_up_recommendation'] as const) {
    await saveVoiceCallArtifact(params.db, {
      workspaceId: params.workspaceId,
      voiceCallId: params.voiceCallId,
      artifactType,
      status: 'failed',
      source: 'ai_summary_v1',
      errorText: params.errorText,
      generatedAt: nowIso(),
    });
  }
}

async function saveSummaryArtifacts(params: {
  db: EdgeClient;
  workspaceId: string;
  voiceCallId: string;
  result: VoiceCallSummaryResult;
  model: string;
}) {
  const generatedAt = nowIso();

  await saveVoiceCallArtifact(params.db, {
    workspaceId: params.workspaceId,
    voiceCallId: params.voiceCallId,
    artifactType: 'summary',
    status: 'ready',
    source: 'ai_summary_v1',
    contentText: params.result.summary,
    contentJson: { highlights: params.result.highlights },
    model: params.model,
    errorText: null,
    generatedAt,
  });

  await saveVoiceCallArtifact(params.db, {
    workspaceId: params.workspaceId,
    voiceCallId: params.voiceCallId,
    artifactType: 'disposition',
    status: 'ready',
    source: 'ai_summary_v1',
    contentText: params.result.outcome,
    contentJson: { outcome: params.result.outcome },
    model: params.model,
    errorText: null,
    generatedAt,
  });

  await saveVoiceCallArtifact(params.db, {
    workspaceId: params.workspaceId,
    voiceCallId: params.voiceCallId,
    artifactType: 'follow_up_recommendation',
    status: 'ready',
    source: 'ai_summary_v1',
    contentText: params.result.follow_up_recommendation,
    contentJson: { follow_up_recommendation: params.result.follow_up_recommendation },
    model: params.model,
    errorText: null,
    generatedAt,
  });
}

export async function generateVoiceCallSummaryArtifacts(params: {
  db: EdgeClient;
  workspaceId: string;
  call: VoiceCallRow;
}) {
  const workspaceId = getString(params.workspaceId);
  const voiceCallId = getString(params.call.id);

  if (!workspaceId || !voiceCallId) {
    return;
  }

  const skipCheck = await shouldSkipGeneration({ db: params.db, workspaceId, voiceCallId });

  if (skipCheck.skip) {
    console.log('[voice-call-summary] skipped summary generation', {
      workspaceId,
      voiceCallId,
      reason: skipCheck.reason,
    });
    return;
  }

  const messages = toTranscriptMessages(params.call.message_history);
  const transcript = serializeTranscript(
    messages,
    parsePositiveInt(Deno.env.get('VOICE_CALL_SUMMARY_MAX_TRANSCRIPT_CHARS'), DEFAULT_MAX_TRANSCRIPT_CHARS),
  );

  if (messages.length < MIN_TRANSCRIPT_MESSAGE_COUNT || transcript.length < MIN_TRANSCRIPT_CHARS) {
    await markSummaryArtifactsFailed({
      db: params.db,
      workspaceId,
      voiceCallId,
      errorText: 'Insufficient transcript data to generate AI summary.',
    });
    throw new Error('Insufficient transcript data to generate AI summary.');
  }

  const geminiApiKey = getString(Deno.env.get('GEMINI_API_KEY')) || getString(Deno.env.get('GOOGLE_API_KEY'));

  if (!geminiApiKey) {
    await markSummaryArtifactsFailed({
      db: params.db,
      workspaceId,
      voiceCallId,
      errorText: 'Gemini summary generation is not configured.',
    });
    throw new Error('Gemini summary generation is not configured.');
  }

  const model = getString(Deno.env.get('VOICE_CALL_SUMMARY_MODEL')) || DEFAULT_SUMMARY_MODEL;
  const baseUrl = getString(Deno.env.get('GEMINI_API_BASE_URL')) || 'https://generativelanguage.googleapis.com/v1beta';
  const maxRetries = parseNonNegativeInt(
    Deno.env.get('VOICE_CALL_SUMMARY_RETRY_MAX_RETRIES'),
    DEFAULT_RETRY_MAX_RETRIES,
  );
  const baseDelayMs = parsePositiveInt(
    Deno.env.get('VOICE_CALL_SUMMARY_RETRY_BASE_DELAY_MS'),
    DEFAULT_RETRY_BASE_DELAY_MS,
  );
  const maxDelayMs = parsePositiveInt(
    Deno.env.get('VOICE_CALL_SUMMARY_RETRY_MAX_DELAY_MS'),
    DEFAULT_RETRY_MAX_DELAY_MS,
  );
  const throttleMs = parseNonNegativeInt(
    Deno.env.get('VOICE_CALL_SUMMARY_THROTTLE_MS'),
    DEFAULT_THROTTLE_MS,
  );

  const reservation = await reserveProcessingArtifacts({
    db: params.db,
    workspaceId,
    voiceCallId,
  });

  if (!reservation.claimed) {
    console.log('[voice-call-summary] skipped Gemini request after concurrent reservation', {
      workspaceId,
      voiceCallId,
      claimGeneratedAt: reservation.generatedAt,
      artifactStates: reservation.relevant.map((artifact) => ({
        artifactType: artifact.artifact_type,
        status: artifact.status,
        generatedAt: artifact.generated_at,
      })),
    });
    return;
  }

  const summaryPrompt = [
    'Summarize this inbound call transcript for CRM operators.',
    'Use only the provided conversation.',
    'Return strict JSON with keys:',
    '- summary (string)',
    '- highlights (string array)',
    '- outcome (string)',
    '- follow_up_recommendation (string)',
    'Keep summary concise, highlights factual, and avoid hallucinating.',
    '',
    'Transcript:',
    transcript,
  ].join('\n');
  const summaryRequest = {
    systemInstruction: {
      parts: [{
        text:
          'You are a CRM call summarizer. Output only valid JSON with the requested keys.',
      }],
    },
    contents: [{
      role: 'user',
      parts: [{ text: summaryPrompt }],
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  };

  try {
    if (throttleMs > 0) {
      console.log('[voice-call-summary] throttling before Gemini summary request', {
        workspaceId,
        voiceCallId,
        model,
        throttleMs,
      });
      await sleep(throttleMs);
    }

    const endpoint = `${baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent?key=${
      encodeURIComponent(geminiApiKey)
    }`;

    const responseBody = await requestGeminiSummaryWithRetry({
      endpoint,
      requestBody: summaryRequest,
      maxRetries,
      baseDelayMs,
      maxDelayMs,
      workspaceId,
      voiceCallId,
      model,
    });

    const result = parseSummaryResponse(responseBody);
    await saveSummaryArtifacts({
      db: params.db,
      workspaceId,
      voiceCallId,
      result,
      model,
    });

    console.log('[voice-call-summary] summary artifacts generated', {
      workspaceId,
      voiceCallId,
      model,
      transcriptMessageCount: messages.length,
      transcriptChars: transcript.length,
      retryConfig: {
        maxRetries,
        baseDelayMs,
        maxDelayMs,
      },
      throttleMs,
    });
  } catch (error) {
    const errorText = error instanceof Error ? error.message : 'Unknown summary generation error.';

    await markSummaryArtifactsFailed({
      db: params.db,
      workspaceId,
      voiceCallId,
      errorText,
    });

    console.warn('[voice-call-summary] summary generation failed', {
      workspaceId,
      voiceCallId,
      model,
      message: errorText,
      transcriptMessageCount: messages.length,
      transcriptChars: transcript.length,
      throttleMs,
    });
  }
}
