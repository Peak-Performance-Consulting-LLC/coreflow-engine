import {
  TelnyxApiError,
  TelnyxClientConfigError,
  TelnyxNetworkError,
  TelnyxTimeoutError,
  type TelnyxClientConfig,
} from './telnyx-client.ts';

export interface TelnyxAssistantPayload {
  name: string;
  model: string;
  instructions: string;
  description?: string;
  greeting?: string;
  enabled_features?: string[];
  voice_settings?: Record<string, unknown>;
  transcription?: Record<string, unknown>;
  dynamic_variables?: Record<string, unknown>;
}

export interface TelnyxAssistantRecord {
  id: string;
  name: string | null;
  model: string | null;
  description: string | null;
  instructions: string | null;
  greeting: string | null;
  created_at: string | null;
  updated_at: string | null;
  raw: Record<string, unknown> | null;
}

const DEFAULT_BASE_URL = 'https://api.telnyx.com/v2';
const DEFAULT_TIMEOUT_MS = 10000;

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function extractData(parsedBody: unknown) {
  if (isRecord(parsedBody) && isRecord(parsedBody.data)) {
    return parsedBody.data;
  }

  return isRecord(parsedBody) ? parsedBody : null;
}

function mapAssistantRecord(value: unknown): TelnyxAssistantRecord {
  const record = isRecord(value) ? value : {};

  return {
    id: getString(record.id),
    name: getString(record.name) || null,
    model: getString(record.model) || null,
    description: getString(record.description) || null,
    instructions: getString(record.instructions) || null,
    greeting: getString(record.greeting) || null,
    created_at: getString(record.created_at) || null,
    updated_at: getString(record.updated_at) || null,
    raw: isRecord(value) ? value : null,
  };
}

async function requestTelnyxAssistantApi(
  config: TelnyxClientConfig,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
) {
  const { apiKey, baseUrl, timeoutMs } = resolveClientConfig(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${baseUrl}${path}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const parsedBody = await parseJsonSafe(response);

    if (!response.ok) {
      throw new TelnyxApiError(
        `Telnyx assistant request failed with status ${response.status}.`,
        response.status,
        parsedBody,
      );
    }

    return extractData(parsedBody);
  } catch (error) {
    if (error instanceof TelnyxApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TelnyxTimeoutError('Telnyx assistant request timed out.');
    }

    const message = error instanceof Error ? error.message : 'Telnyx network error.';
    throw new TelnyxNetworkError(message);
  } finally {
    clearTimeout(timeout);
  }
}

export async function createTelnyxAssistant(
  params: TelnyxClientConfig & { payload: TelnyxAssistantPayload },
): Promise<TelnyxAssistantRecord> {
  const data = await requestTelnyxAssistantApi(params, 'POST', '/ai/assistants', params.payload);
  const assistant = mapAssistantRecord(data);

  if (!assistant.id) {
    throw new TelnyxClientConfigError('Telnyx assistant create response did not include an assistant id.');
  }

  return assistant;
}

export async function updateTelnyxAssistant(
  params: TelnyxClientConfig & { assistantId: string; payload: TelnyxAssistantPayload },
): Promise<TelnyxAssistantRecord> {
  const assistantId = getString(params.assistantId);

  if (!assistantId) {
    throw new TelnyxClientConfigError('assistantId is required.');
  }

  const data = await requestTelnyxAssistantApi(params, 'PATCH', `/ai/assistants/${assistantId}`, params.payload);
  const assistant = mapAssistantRecord(data);

  if (!assistant.id) {
    throw new TelnyxClientConfigError('Telnyx assistant update response did not include an assistant id.');
  }

  return assistant;
}

export async function deleteTelnyxAssistant(
  params: TelnyxClientConfig & { assistantId: string },
): Promise<void> {
  const assistantId = getString(params.assistantId);

  if (!assistantId) {
    throw new TelnyxClientConfigError('assistantId is required.');
  }

  await requestTelnyxAssistantApi(params, 'DELETE', `/ai/assistants/${assistantId}`);
}
