import {
  TelnyxApiError,
  TelnyxClientConfigError,
  TelnyxNetworkError,
  TelnyxTimeoutError,
  type TelnyxClientConfig,
} from './telnyx-client.ts';

export interface TelnyxModelRecord {
  id: string;
  object: string | null;
  owned_by: string | null;
  created: number | null;
  raw: Record<string, unknown> | null;
}

export interface TelnyxVoiceRecord {
  provider: string | null;
  name: string | null;
  voice_id: string | null;
  language: string | null;
  gender: string | null;
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

async function requestTelnyxApi(
  config: TelnyxClientConfig,
  path: string,
) {
  const { apiKey, baseUrl, timeoutMs } = resolveClientConfig(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    const parsedBody = await parseJsonSafe(response);

    if (!response.ok) {
      throw new TelnyxApiError(
        `Telnyx request failed with status ${response.status}.`,
        response.status,
        parsedBody,
        null,
        path,
      );
    }

    return parsedBody;
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

export async function listTelnyxAiModels(config: TelnyxClientConfig): Promise<TelnyxModelRecord[]> {
  const payload = await requestTelnyxApi(config, '/ai/models');

  const rows = isRecord(payload) && Array.isArray(payload.data)
    ? payload.data
    : [];

  return rows
    .filter((row): row is Record<string, unknown> => isRecord(row))
    .map((row) => {
      const createdValue = row.created;
      const created = typeof createdValue === 'number'
        ? createdValue
        : typeof createdValue === 'string'
          ? Number.parseInt(createdValue, 10)
          : null;

      return {
        id: getString(row.id),
        object: getString(row.object) || null,
        owned_by: getString(row.owned_by) || null,
        created: Number.isFinite(created) ? Number(created) : null,
        raw: row,
      };
    })
    .filter((row) => row.id.length > 0);
}

export async function listTelnyxVoices(
  config: TelnyxClientConfig & { provider?: string },
): Promise<TelnyxVoiceRecord[]> {
  const provider = getString(config.provider);
  const query = new URLSearchParams();

  if (provider) {
    query.set('provider', provider);
  }

  const payload = await requestTelnyxApi(config, `/text-to-speech/voices${query.size > 0 ? `?${query}` : ''}`);
  const rows = isRecord(payload) && Array.isArray(payload.voices)
    ? payload.voices
    : [];

  return rows
    .filter((row): row is Record<string, unknown> => isRecord(row))
    .map((row) => ({
      provider: getString(row.provider) || null,
      name: getString(row.name) || null,
      voice_id: getString(row.voice_id) || null,
      language: getString(row.language) || null,
      gender: getString(row.gender) || null,
      raw: row,
    }))
    .filter((row) => row.voice_id !== null);
}
