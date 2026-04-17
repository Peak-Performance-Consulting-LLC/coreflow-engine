export interface TelnyxClientConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  logContext?: Record<string, unknown>;
}

export interface TelnyxCommandResult<TData = Record<string, unknown>> {
  accepted: true;
  status: number;
  commandId: string | null;
  data: TData | null;
  raw: Record<string, unknown> | null;
}

export interface AnswerCallParams extends TelnyxClientConfig {
  callControlId: string;
  commandId?: string;
  clientState?: string;
}

export interface StartGatherUsingAiParams extends TelnyxClientConfig {
  callControlId: string;
  commandId?: string;
  greeting?: string;
  parametersSchema: Record<string, unknown>;
  assistant?: Record<string, unknown>;
  messageHistory?: unknown[];
  sendMessageHistoryUpdates?: boolean;
  sendPartialResults?: boolean;
  transcription?: Record<string, unknown>;
  userResponseTimeoutMs?: number;
  gatherEndedSpeech?: string;
  voice?: string;
  voiceSettings?: Record<string, unknown>;
  language?: string;
  clientState?: string;
  interruptionSettings?: Record<string, unknown>;
}

export interface StartAIAssistantParams extends TelnyxClientConfig {
  callControlId: string;
  commandId?: string;
  clientState?: string;
  assistantId: string;
  assistantConfig?: Record<string, unknown>;
  participants?: Array<{
    id: string;
    role: 'user' | 'assistant';
    name?: string;
    on_hangup?: 'continue_conversation' | 'end_conversation';
  }>;
  messageHistory?: unknown[];
  sendMessageHistoryUpdates?: boolean;
  interruptionSettings?: Record<string, unknown>;
}

export interface HangupCallParams extends TelnyxClientConfig {
  callControlId: string;
  commandId?: string;
}

export interface StartNoiseSuppressionParams extends TelnyxClientConfig {
  callControlId: string;
  commandId?: string;
  clientState?: string;
  direction?: 'inbound' | 'outbound' | 'both';
  noiseSuppressionEngine?: 'Denoiser' | 'DeepFilterNet' | 'Krisp';
}

export interface StartRecordingParams extends TelnyxClientConfig {
  callControlId: string;
  commandId?: string;
  clientState?: string;
  format?: 'wav' | 'mp3';
  channels?: 'single' | 'dual';
  playBeep?: boolean;
}

export class TelnyxClientError extends Error {}

export class TelnyxClientConfigError extends TelnyxClientError {}

export class TelnyxNetworkError extends TelnyxClientError {}

export class TelnyxTimeoutError extends TelnyxClientError {}

export class TelnyxApiError extends TelnyxClientError {
  status: number;
  responseBody: unknown;
  requestBody: Record<string, unknown> | null;
  requestPath: string;

  constructor(
    message: string,
    status: number,
    responseBody: unknown,
    requestBody: Record<string, unknown> | null,
    requestPath: string,
  ) {
    super(message);
    this.status = status;
    this.responseBody = responseBody;
    this.requestBody = requestBody;
    this.requestPath = requestPath;
  }
}

const DEFAULT_BASE_URL = 'https://api.telnyx.com/v2';
const DEFAULT_TIMEOUT_MS = 10000;

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizePayloadValue(value: unknown): unknown | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(value)) {
    const sanitizedItems = value
      .map((entry) => sanitizePayloadValue(entry))
      .filter((entry) => entry !== undefined);
    return sanitizedItems;
  }

  if (isRecord(value)) {
    const sanitizedRecord: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      const sanitizedEntry = sanitizePayloadValue(entry);

      if (sanitizedEntry !== undefined) {
        sanitizedRecord[key] = sanitizedEntry;
      }
    }

    return Object.keys(sanitizedRecord).length > 0 ? sanitizedRecord : undefined;
  }

  return value;
}

export function sanitizeTelnyxPayload(payload: Record<string, unknown>) {
  const sanitized = sanitizePayloadValue(payload);
  return isRecord(sanitized) ? sanitized : {};
}

function resolveClientConfig(config: TelnyxClientConfig) {
  const apiKey = getString(config.apiKey) || getString(Deno.env.get('TELNYX_API_KEY'));
  const baseUrl = getString(config.baseUrl) || getString(Deno.env.get('TELNYX_API_BASE_URL')) || DEFAULT_BASE_URL;
  const timeoutFromEnv = Number.parseInt(getString(Deno.env.get('TELNYX_API_TIMEOUT_MS')), 10);
  const timeoutMs = Number.isFinite(config.timeoutMs)
    ? Number(config.timeoutMs)
    : Number.isFinite(timeoutFromEnv)
      ? timeoutFromEnv
      : DEFAULT_TIMEOUT_MS;

  if (!apiKey) {
    throw new TelnyxClientConfigError('Missing TELNYX_API_KEY.');
  }

  if (!baseUrl) {
    throw new TelnyxClientConfigError('Missing Telnyx API base URL.');
  }

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    timeoutMs: Math.max(1000, timeoutMs),
  };
}

async function parseJsonSafe(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function postTelnyxCommand<TData = Record<string, unknown>>(
  config: TelnyxClientConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<TelnyxCommandResult<TData>> {
  const { apiKey, baseUrl, timeoutMs } = resolveClientConfig(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${baseUrl}${path}`;
  const sanitizedBody = sanitizeTelnyxPayload(body);
  const logContext = isRecord(config.logContext) ? config.logContext : null;

  console.log('[telnyx-client] command request', {
    path,
    payload: sanitizedBody,
    context: logContext,
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sanitizedBody),
      signal: controller.signal,
    });
    const parsedBody = await parseJsonSafe(response);

    if (!response.ok) {
      console.warn('[telnyx-client] command failed', {
        path,
        status: response.status,
        responseBody: parsedBody,
        payload: sanitizedBody,
        context: logContext,
      });
      throw new TelnyxApiError(
        `Telnyx command failed with status ${response.status}.`,
        response.status,
        parsedBody,
        sanitizedBody,
        path,
      );
    }

    const data = isRecord(parsedBody) && isRecord(parsedBody.data)
      ? (parsedBody.data as TData)
      : null;
    const commandIdFromResponse = isRecord(data) ? getString(data.command_id) : '';
    const commandIdFromBody = getString(sanitizedBody.command_id);
    const resolvedCommandId = commandIdFromResponse || commandIdFromBody || null;

    console.log('[telnyx-client] command response', {
      path,
      status: response.status,
      commandId: resolvedCommandId,
      context: logContext,
    });

    return {
      accepted: true,
      status: response.status,
      commandId: resolvedCommandId,
      data,
      raw: isRecord(parsedBody) ? parsedBody : null,
    };
  } catch (error) {
    if (error instanceof TelnyxApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TelnyxTimeoutError('Telnyx request timed out.');
    }

    const message = error instanceof Error ? error.message : 'Telnyx network error.';
    throw new TelnyxNetworkError(message);
  } finally {
    clearTimeout(timeout);
  }
}

export async function answerCall(params: AnswerCallParams) {
  const commandId = getString(params.commandId);
  const clientState = getString(params.clientState);

  return postTelnyxCommand(params, `/calls/${params.callControlId}/actions/answer`, {
    ...(commandId ? { command_id: commandId } : {}),
    ...(clientState ? { client_state: clientState } : {}),
  });
}

export async function startGatherUsingAi(params: StartGatherUsingAiParams) {
  const commandId = getString(params.commandId);
  const greeting = getString(params.greeting);
  const voice = getString(params.voice);
  const language = getString(params.language);
  const clientState = getString(params.clientState);
  const gatherEndedSpeech = getString(params.gatherEndedSpeech);
  const userResponseTimeoutMs = Number.isFinite(params.userResponseTimeoutMs)
    ? Number(params.userResponseTimeoutMs)
    : null;

  return postTelnyxCommand(params, `/calls/${params.callControlId}/actions/gather_using_ai`, {
    ...(greeting ? { greeting } : {}),
    parameters: params.parametersSchema,
    ...(isRecord(params.assistant) ? { assistant: params.assistant } : {}),
    ...(Array.isArray(params.messageHistory) ? { message_history: params.messageHistory } : {}),
    ...(typeof params.sendMessageHistoryUpdates === 'boolean'
      ? { send_message_history_updates: params.sendMessageHistoryUpdates }
      : {}),
    ...(typeof params.sendPartialResults === 'boolean' ? { send_partial_results: params.sendPartialResults } : {}),
    ...(isRecord(params.transcription) ? { transcription: params.transcription } : {}),
    ...(userResponseTimeoutMs !== null ? { user_response_timeout_ms: userResponseTimeoutMs } : {}),
    ...(gatherEndedSpeech ? { gather_ended_speech: gatherEndedSpeech } : {}),
    ...(commandId ? { command_id: commandId } : {}),
    ...(voice ? { voice } : {}),
    ...(isRecord(params.voiceSettings) ? { voice_settings: params.voiceSettings } : {}),
    ...(language ? { language } : {}),
    ...(clientState ? { client_state: clientState } : {}),
    ...(isRecord(params.interruptionSettings) ? { interruption_settings: params.interruptionSettings } : {}),
  });
}

export async function startAIAssistant(params: StartAIAssistantParams) {
  const commandId = getString(params.commandId);
  const clientState = getString(params.clientState);
  const assistantId = getString(params.assistantId);

  if (!assistantId) {
    throw new TelnyxClientConfigError('assistantId is required.');
  }

  const assistantOverrides = isRecord(params.assistantOverrides) && Object.keys(params.assistantOverrides).length > 0
    ? params.assistantOverrides
    : undefined;

  return postTelnyxCommand(params, `/calls/${params.callControlId}/actions/ai_assistant_start`, {
    assistant_id: assistantId,
    ...(assistantOverrides ? { assistant: assistantOverrides } : {}),
    ...(Array.isArray(params.messageHistory) && params.messageHistory.length > 0
      ? { message_history: params.messageHistory }
      : {}),
    ...(typeof params.sendMessageHistoryUpdates === 'boolean'
      ? { send_message_history_updates: params.sendMessageHistoryUpdates }
      : {}),
    ...(isRecord(params.interruptionSettings) ? { interruption_settings: params.interruptionSettings } : {}),
    ...(commandId ? { command_id: commandId } : {}),
    ...(clientState ? { client_state: clientState } : {}),
  });
}

export async function hangupCall(params: HangupCallParams) {
  const commandId = getString(params.commandId);

  return postTelnyxCommand(params, `/calls/${params.callControlId}/actions/hangup`, {
    ...(commandId ? { command_id: commandId } : {}),
  });
}

export async function startNoiseSuppression(params: StartNoiseSuppressionParams) {
  const commandId = getString(params.commandId);
  const clientState = getString(params.clientState);
  const direction =
    params.direction === 'outbound' || params.direction === 'both'
      ? params.direction
      : 'inbound';
  const noiseSuppressionEngine =
    params.noiseSuppressionEngine === 'DeepFilterNet' || params.noiseSuppressionEngine === 'Krisp'
      ? params.noiseSuppressionEngine
      : 'Denoiser';

  return postTelnyxCommand(params, `/calls/${params.callControlId}/actions/suppression_start`, {
    direction,
    noise_suppression_engine: noiseSuppressionEngine,
    ...(commandId ? { command_id: commandId } : {}),
    ...(clientState ? { client_state: clientState } : {}),
  });
}

export async function startRecording(params: StartRecordingParams) {
  const commandId = getString(params.commandId);
  const clientState = getString(params.clientState);
  const format = params.format === 'mp3' ? 'mp3' : 'wav';
  const channels = params.channels === 'dual' ? 'dual' : 'single';

  return postTelnyxCommand(params, `/calls/${params.callControlId}/actions/record_start`, {
    format,
    channels,
    play_beep: typeof params.playBeep === 'boolean' ? params.playBeep : false,
    ...(commandId ? { command_id: commandId } : {}),
    ...(clientState ? { client_state: clientState } : {}),
  });
}
