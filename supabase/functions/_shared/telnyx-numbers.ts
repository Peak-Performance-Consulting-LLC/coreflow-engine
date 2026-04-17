import {
  TelnyxApiError,
  TelnyxClientConfigError,
  TelnyxNetworkError,
  TelnyxTimeoutError,
} from './telnyx-client.ts';

export interface TelnyxNumbersClientConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface SearchAvailablePhoneNumbersParams extends TelnyxNumbersClientConfig {
  countryCode?: string | null;
  locality?: string | null;
  administrativeArea?: string | null;
  npa?: string | null;
  limit?: number | null;
  phoneNumberType?: string | null;
}

export type SearchAvailableUsPhoneNumbersParams = SearchAvailablePhoneNumbersParams;

export interface TelnyxAvailablePhoneNumber {
  phoneNumber: string;
  phoneNumberType: string | null;
  locality: string | null;
  administrativeArea: string | null;
  countryCode: string | null;
  bestEffort: boolean;
  quickship: boolean;
  features: string[];
  monthlyCost: string | null;
  upfrontCost: string | null;
}

export interface PurchaseManagedPhoneNumberParams extends TelnyxNumbersClientConfig {
  phoneNumber: string;
  connectionId?: string | null;
  customerReference?: string | null;
}

export interface TelnyxManagedNumberOrder {
  id: string | null;
  status: string | null;
  phoneNumbers: string[];
  connectionId: string | null;
  customerReference: string | null;
  requirementsMet: boolean | null;
  raw: Record<string, unknown> | null;
}

export interface TelnyxOwnedPhoneNumber {
  id: string | null;
  phoneNumber: string;
  connectionId: string | null;
  status: string | null;
  recordType: string | null;
  purchasedAt: string | null;
  customerReference: string | null;
  raw: Record<string, unknown> | null;
}

export interface TelnyxProvisionedPhoneNumber {
  order: TelnyxManagedNumberOrder | null;
  phoneNumber: TelnyxOwnedPhoneNumber | null;
  webhookReady: boolean;
  connectionId: string | null;
  provisioningStatus: 'pending' | 'active' | 'failed';
  webhookStatus: 'pending' | 'ready' | 'failed';
  isActive: boolean;
  statusMessage: string | null;
}

type RequestMethod = 'GET' | 'POST' | 'PATCH';

const DEFAULT_BASE_URL = 'https://api.telnyx.com/v2';
const DEFAULT_TIMEOUT_MS = 10000;
const E164_REGEX = /^\+[1-9][0-9]{1,14}$/;
const RETRY_DELAY_MS = 500;
const RETRY_ATTEMPTS = 3;
const ORDER_POLL_ATTEMPTS = 4;
const ORDER_POLL_DELAY_MS = 1000;
const US_PHONE_TYPES = new Set(['local', 'toll_free', 'toll-free']);
const ACTIVE_ORDER_STATUSES = new Set(['success', 'completed', 'complete']);
const FAILED_ORDER_STATUSES = new Set(['failed', 'failure', 'error', 'errored', 'canceled', 'cancelled']);
const ACTIVE_PHONE_NUMBER_STATUSES = new Set(['active']);
const FAILED_PHONE_NUMBER_STATUSES = new Set(['failed', 'error', 'deleted', 'released']);

export class TelnyxNumberProvisioningError extends Error {
  order: TelnyxManagedNumberOrder | null;
  phoneNumber: TelnyxOwnedPhoneNumber | null;
  webhookReady: boolean;
  connectionId: string | null;
  cause?: unknown;

  constructor(
    message: string,
    context: {
      order?: TelnyxManagedNumberOrder | null;
      phoneNumber?: TelnyxOwnedPhoneNumber | null;
      webhookReady?: boolean;
      connectionId?: string | null;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = 'TelnyxNumberProvisioningError';
    this.order = context.order ?? null;
    this.phoneNumber = context.phoneNumber ?? null;
    this.webhookReady = context.webhookReady ?? false;
    this.connectionId = context.connectionId ?? null;
    this.cause = context.cause;
  }
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getNullableString(value: unknown) {
  const next = getString(value);
  return next.length > 0 ? next : null;
}

function normalizeStatus(value: unknown) {
  return getString(value).toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

function getBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : false;
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown) {
  return isRecord(value) ? value : null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function parseJsonSafeText(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function resolveClientConfig(config: TelnyxNumbersClientConfig) {
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

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    timeoutMs: Math.max(1000, timeoutMs),
  };
}

async function telnyxRequest(
  config: TelnyxNumbersClientConfig,
  method: RequestMethod,
  path: string,
  options: {
    body?: Record<string, unknown>;
    query?: Record<string, string | number | boolean | Array<string | number | boolean>>;
  } = {},
) {
  const { apiKey, baseUrl, timeoutMs } = resolveClientConfig(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL(`${baseUrl}${path}`);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === '' || value === null || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === '' || item === null || item === undefined) {
          continue;
        }

        url.searchParams.append(key, String(item));
      }

      continue;
    }

    url.searchParams.set(key, String(value));
  }

  try {

    console.log('[Telnyx request]', {
    method,
    path,
    url: url.toString(),
    query: options.query ?? null,
    hasBody: Boolean(options.body),
  });

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const parsedBody = parseJsonSafeText(await response.text());

    console.log('[Telnyx response]', {
    method,
    path,
    url: url.toString(),
    status: response.status,
    body: parsedBody,
  });

    if (!response.ok) {
      throw new TelnyxApiError(
        `Telnyx request failed with status ${response.status}.`,
        response.status,
        parsedBody,
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

function normalizeMonthlyCost(value: Record<string, unknown> | null) {
  if (!value) {
    return null;
  }

  return getNullableString(value.monthly_cost) ??
    getNullableString(value.recurring_cost) ??
    (getNumber(value.monthly_cost) !== null ? String(value.monthly_cost) : null);
}

function normalizeUpfrontCost(value: Record<string, unknown> | null) {
  if (!value) {
    return null;
  }

  return getNullableString(value.upfront_cost) ??
    getNullableString(value.setup_cost) ??
    (getNumber(value.upfront_cost) !== null ? String(value.upfront_cost) : null);
}

function extractRegionInformation(raw: Record<string, unknown>) {
  return asArray(raw.region_information)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function getRegionName(raw: Record<string, unknown>, regionType: string) {
  return extractRegionInformation(raw)
    .find((entry) => normalizeStatus(entry.region_type) === normalizeStatus(regionType))
    ?.region_name as string | undefined;
}

function extractAdministrativeArea(raw: Record<string, unknown>) {
  return getNullableString(raw.administrative_area) ??
    getNullableString(asRecord(raw.region_information)?.administrative_area) ??
    getNullableString(asRecord(raw.region_information)?.region_name) ??
    getNullableString(getRegionName(raw, 'state'));
}

function extractLocality(raw: Record<string, unknown>) {
  return getNullableString(raw.locality) ??
    getNullableString(raw.city) ??
    getNullableString(asRecord(raw.region_information)?.locality) ??
    getNullableString(asRecord(raw.region_information)?.city) ??
    getNullableString(getRegionName(raw, 'rate_center'));
}

function normalizeSearchResult(rawValue: unknown): TelnyxAvailablePhoneNumber | null {
  const raw = asRecord(rawValue);

  if (!raw) {
    return null;
  }

  const phoneNumber = getString(raw.phone_number);

  if (!phoneNumber || !E164_REGEX.test(phoneNumber)) {
    return null;
  }

  const costInfo = asRecord(raw.cost_information);
  const features = asArray(raw.features)
    .map((feature) => {
      if (typeof feature === 'string') {
        return feature.trim();
      }

      return getString(asRecord(feature)?.name) || getString(asRecord(feature)?.type);
    })
    .filter(Boolean);

  return {
    phoneNumber,
    phoneNumberType: getNullableString(raw.phone_number_type),
    locality: extractLocality(raw),
    administrativeArea: extractAdministrativeArea(raw),
    countryCode: getNullableString(raw.country_code) ?? getNullableString(getRegionName(raw, 'country_code')),
    bestEffort: getBoolean(raw.best_effort),
    quickship: getBoolean(raw.quickship),
    features,
    monthlyCost: normalizeMonthlyCost(costInfo),
    upfrontCost: normalizeUpfrontCost(costInfo),
  };
}

function normalizeOrder(rawValue: unknown): TelnyxManagedNumberOrder | null {
  const raw = asRecord(rawValue);

  if (!raw) {
    return null;
  }

  const phoneNumbers = asArray(raw.phone_numbers)
    .map((item) => getString(asRecord(item)?.phone_number))
    .filter(Boolean);

  return {
    id: getNullableString(raw.id),
    status: getNullableString(raw.status),
    phoneNumbers,
    connectionId: getNullableString(raw.connection_id),
    customerReference: getNullableString(raw.customer_reference),
    requirementsMet: typeof raw.requirements_met === 'boolean' ? raw.requirements_met : null,
    raw,
  };
}

function normalizeOwnedPhoneNumber(rawValue: unknown): TelnyxOwnedPhoneNumber | null {
  const raw = asRecord(rawValue);

  if (!raw) {
    return null;
  }

  const phoneNumber = getString(raw.phone_number);

  if (!phoneNumber || !E164_REGEX.test(phoneNumber)) {
    return null;
  }

  return {
    id: getNullableString(raw.id),
    phoneNumber,
    connectionId: getNullableString(raw.connection_id),
    status: getNullableString(raw.status),
    recordType: getNullableString(raw.record_type),
    purchasedAt: getNullableString(raw.purchased_at) ?? getNullableString(raw.created_at),
    customerReference: getNullableString(raw.customer_reference),
    raw,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeE164Number(value: unknown, fieldName: string) {
  const phoneNumber = getString(value);

  if (!phoneNumber) {
    throw new Error(`${fieldName} is required.`);
  }

  if (!E164_REGEX.test(phoneNumber)) {
    throw new Error(`${fieldName} must be a valid E.164 phone number.`);
  }

  return phoneNumber;
}

export function normalizePhase1UsPhoneNumber(value: unknown, fieldName: string) {
  const phoneNumber = normalizeE164Number(value, fieldName);

  if (!/^\+1[2-9][0-9]{9}$/.test(phoneNumber)) {
    throw new Error(`${fieldName} must be a US phone number in +1 E.164 format for phase 1.`);
  }

  return phoneNumber;
}

export function resolveManagedVoiceConnectionId() {
  return getNullableString(Deno.env.get('TELNYX_VOICE_CONNECTION_ID'));
}

export async function searchAvailableUsPhoneNumbers(params: SearchAvailableUsPhoneNumbersParams) {
  const npa = getNullableString(params.npa);
  const phoneNumberType = getNullableString(params.phoneNumberType);

  if (npa && !/^[0-9]{3}$/.test(npa)) {
    throw new Error('npa must be a 3-digit US area code.');
  }

  if (phoneNumberType && !US_PHONE_TYPES.has(phoneNumberType)) {
    throw new Error('phone_number_type must be either "local" or "toll_free".');
  }

  return searchAvailablePhoneNumbers({
    ...params,
    countryCode: 'US',
    npa,
    phoneNumberType,
  });
}

export async function searchAvailablePhoneNumbers(params: SearchAvailablePhoneNumbersParams) {
  const limit = Number.isFinite(params.limit) ? Math.min(Math.max(1, Number(params.limit)), 20) : 10;
  const countryCode = getNullableString(params.countryCode)?.toUpperCase() ?? null;
  const locality = getNullableString(params.locality);
  const administrativeArea = getNullableString(params.administrativeArea);
  const npa = getNullableString(params.npa);
  const phoneNumberType = getNullableString(params.phoneNumberType);

  if (!countryCode) {
    throw new Error('country_code is required and must be a valid 2-letter ISO country code.');
  }

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error('country_code must be a valid 2-letter ISO country code.');
  }

  if (npa && !/^[0-9]{1,6}$/.test(npa)) {
    throw new Error('npa must be a numeric national destination code with 1 to 6 digits.');
  }

  const normalizedPhoneNumberType = phoneNumberType === 'toll_free' ? 'toll-free' : phoneNumberType;

  const response = await telnyxRequest(params, 'GET', '/available_phone_numbers', {
    query: {
      'filter[country_code]': countryCode,
      ...(locality ? { 'filter[locality]': locality } : {}),
      ...(administrativeArea ? { 'filter[administrative_area]': administrativeArea } : {}),
      ...(npa ? { 'filter[national_destination_code]': npa } : {}),
      ...(normalizedPhoneNumberType ? { 'filter[phone_number_type]': normalizedPhoneNumberType } : {}),
      'filter[features]': 'voice',
      'filter[limit]': limit,
    },
  });

  return asArray(asRecord(response)?.data)
    .map(normalizeSearchResult)
    .filter((item): item is TelnyxAvailablePhoneNumber => Boolean(item));
}

export async function findAvailableUsPhoneNumber(params: TelnyxNumbersClientConfig & { phoneNumber: string }) {
  const phoneNumber = normalizePhase1UsPhoneNumber(params.phoneNumber, 'phone_number');
  const response = await telnyxRequest(params, 'GET', '/available_phone_numbers', {
    query: {
      'filter[country_code]': 'US',
      'filter[phone_number]': phoneNumber,
      'filter[features]': 'voice',
      'filter[limit]': 1,
    },
  });

  return normalizeSearchResult(asArray(asRecord(response)?.data)[0] ?? null);
}

async function getOwnedPhoneNumberByE164(
  config: TelnyxNumbersClientConfig,
  phoneNumber: string,
) {
  const response = await telnyxRequest(config, 'GET', '/phone_numbers', {
    query: {
      'filter[phone_number]': phoneNumber,
      'page[size]': 1,
    },
  });

  return normalizeOwnedPhoneNumber(asArray(asRecord(response)?.data)[0] ?? null);
}

async function findOwnedPhoneNumberWithRetry(
  config: TelnyxNumbersClientConfig,
  phoneNumber: string,
) {
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt += 1) {
    const ownedPhoneNumber = await getOwnedPhoneNumberByE164(config, phoneNumber);

    if (ownedPhoneNumber) {
      return ownedPhoneNumber;
    }

    if (attempt < RETRY_ATTEMPTS - 1) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  return null;
}

async function getNumberOrderById(
  config: TelnyxNumbersClientConfig,
  orderId: string,
) {
  const response = await telnyxRequest(config, 'GET', `/number_orders/${orderId}`);
  return normalizeOrder(asRecord(response)?.data ?? null);
}

function isActiveOrder(order: TelnyxManagedNumberOrder | null) {
  const status = normalizeStatus(order?.status);
  return Boolean(status) && ACTIVE_ORDER_STATUSES.has(status);
}

function isFailedOrder(order: TelnyxManagedNumberOrder | null) {
  const status = normalizeStatus(order?.status);
  return Boolean(status) && FAILED_ORDER_STATUSES.has(status);
}

function isActivePhoneNumber(phoneNumber: TelnyxOwnedPhoneNumber | null) {
  const status = normalizeStatus(phoneNumber?.status);
  return Boolean(status) && ACTIVE_PHONE_NUMBER_STATUSES.has(status);
}

function isFailedPhoneNumber(phoneNumber: TelnyxOwnedPhoneNumber | null) {
  const status = normalizeStatus(phoneNumber?.status);
  return Boolean(status) && FAILED_PHONE_NUMBER_STATUSES.has(status);
}

function deriveProvisionedState(
  order: TelnyxManagedNumberOrder | null,
  ownedPhoneNumber: TelnyxOwnedPhoneNumber | null,
  connectionId: string | null,
) {
  const connectionAttached = Boolean(connectionId && ownedPhoneNumber?.connectionId === connectionId);
  const numberActive = isActivePhoneNumber(ownedPhoneNumber);
  const orderActive = !order || isActiveOrder(order);
  const orderFailed = isFailedOrder(order);
  const numberFailed = isFailedPhoneNumber(ownedPhoneNumber);

  if (orderFailed || numberFailed) {
    return {
      provisioningStatus: 'failed' as const,
      webhookStatus: 'failed' as const,
      isActive: false,
      webhookReady: false,
      statusMessage: 'Provider provisioning failed or returned a non-routable number state.',
    };
  }

  if (numberActive && orderActive) {
    if (connectionAttached) {
      return {
        provisioningStatus: 'active' as const,
        webhookStatus: 'ready' as const,
        isActive: true,
        webhookReady: true,
        statusMessage: null,
      };
    }

    return {
      provisioningStatus: 'active' as const,
      webhookStatus: 'pending' as const,
      isActive: false,
      webhookReady: false,
      statusMessage: connectionId
        ? 'The number is active at the provider, but the managed voice connection is not confirmed yet.'
        : 'TELNYX_VOICE_CONNECTION_ID is not configured, so webhook routing remains pending.',
    };
  }

  return {
    provisioningStatus: 'pending' as const,
    webhookStatus: 'pending' as const,
    isActive: false,
    webhookReady: false,
    statusMessage: order
      ? 'Provider provisioning is still pending.'
      : 'Provider provisioning could not be fully verified yet.',
  };
}

async function pollNumberOrder(
  config: TelnyxNumbersClientConfig,
  orderId: string | null,
) {
  if (!orderId) {
    return null;
  }

  let latestOrder = await getNumberOrderById(config, orderId);

  for (let attempt = 1; attempt < ORDER_POLL_ATTEMPTS; attempt += 1) {
    if (!latestOrder || isActiveOrder(latestOrder) || isFailedOrder(latestOrder)) {
      return latestOrder;
    }

    await sleep(ORDER_POLL_DELAY_MS);
    latestOrder = await getNumberOrderById(config, orderId);
  }

  return latestOrder;
}

async function updateOwnedPhoneNumberConnection(
  config: TelnyxNumbersClientConfig,
  phoneNumberId: string,
  connectionId: string,
  customerReference: string | null,
) {
  const response = await telnyxRequest(config, 'PATCH', `/phone_numbers/${phoneNumberId}`, {
    body: {
      connection_id: connectionId,
      ...(customerReference ? { customer_reference: customerReference } : {}),
    },
  });

  return normalizeOwnedPhoneNumber(asRecord(response)?.data ?? null);
}

export async function reconcileManagedPhoneNumber(
  params: PurchaseManagedPhoneNumberParams & { orderId?: string | null },
): Promise<TelnyxProvisionedPhoneNumber> {
  const phoneNumber = normalizePhase1UsPhoneNumber(params.phoneNumber, 'phone_number');
  const connectionId = getNullableString(params.connectionId);
  const customerReference = getNullableString(params.customerReference);
  const orderId = getNullableString(params.orderId);

  let order = orderId ? await pollNumberOrder(params, orderId) : null;
  let ownedPhoneNumber = await findOwnedPhoneNumberWithRetry(params, phoneNumber);
  let connectionUpdateError: string | null = null;

  if (ownedPhoneNumber && connectionId && ownedPhoneNumber.id && ownedPhoneNumber.connectionId !== connectionId) {
    try {
      ownedPhoneNumber = await updateOwnedPhoneNumberConnection(
        params,
        ownedPhoneNumber.id,
        connectionId,
        customerReference,
      );
    } catch (error) {
      connectionUpdateError = error instanceof Error ? error.message : 'Unable to update provider connection.';
    }
  }

  if (!order && ownedPhoneNumber?.id) {
    order = null;
  }

  const state = deriveProvisionedState(order, ownedPhoneNumber, connectionId);

  return {
    order,
    phoneNumber: ownedPhoneNumber,
    connectionId,
    provisioningStatus: state.provisioningStatus,
    webhookStatus: state.webhookStatus,
    isActive: state.isActive,
    webhookReady: state.webhookReady,
    statusMessage: connectionUpdateError ?? state.statusMessage,
  };
}

export async function purchaseManagedPhoneNumber(params: PurchaseManagedPhoneNumberParams): Promise<TelnyxProvisionedPhoneNumber> {
  const phoneNumber = normalizePhase1UsPhoneNumber(params.phoneNumber, 'phone_number');
  const connectionId = getNullableString(params.connectionId);
  const customerReference = getNullableString(params.customerReference);

  let order: TelnyxManagedNumberOrder | null = null;

  try {
    const orderResponse = await telnyxRequest(params, 'POST', '/number_orders', {
      body: {
        phone_numbers: [{ phone_number: phoneNumber }],
        ...(connectionId ? { connection_id: connectionId } : {}),
        ...(customerReference ? { customer_reference: customerReference } : {}),
      },
    });

    order = normalizeOrder(asRecord(orderResponse)?.data ?? null);
    return reconcileManagedPhoneNumber({
      ...params,
      phoneNumber,
      connectionId,
      customerReference,
      orderId: order?.id,
    });
  } catch (error) {
    if (error instanceof TelnyxNumberProvisioningError) {
      throw error;
    }

    throw new TelnyxNumberProvisioningError(
      error instanceof Error ? error.message : 'Unable to provision Telnyx phone number.',
      {
        order,
        phoneNumber: null,
        webhookReady: false,
        connectionId,
        cause: error,
      },
    );
  }
}
