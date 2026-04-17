type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface BuildLeadTitleParams {
  fullName?: string | null;
  companyName?: string | null;
  phoneNumberE164: string;
}

export interface MapGatherResultToLeadInputParams {
  workspaceId: string;
  fromNumberE164: string;
  gatherResult: Record<string, unknown> | null;
  sourceId?: string | null;
  fallbackTitle?: string | null;
}

export interface LeadCreateInput {
  core: {
    title: string;
    full_name?: string;
    email?: string;
    company_name?: string;
    phone: string;
    source_id?: string;
  };
  custom: Record<string, unknown>;
}

export class VoiceLeadMapperError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'VoiceLeadMapperError';
    this.cause = cause;
  }
}

export class VoiceLeadMapperValidationError extends VoiceLeadMapperError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'VoiceLeadMapperValidationError';
  }
}

const E164_REGEX = /^\+[1-9][0-9]{1,14}$/;
const LIGHT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableString(value: unknown) {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : null;
}

function ensureNonEmpty(value: unknown, field: string) {
  const normalized = normalizeString(value);

  if (!normalized) {
    throw new VoiceLeadMapperValidationError(`${field} is required.`);
  }

  return normalized;
}

function ensureE164(value: unknown, field: string) {
  const normalized = ensureNonEmpty(value, field);

  if (!E164_REGEX.test(normalized)) {
    throw new VoiceLeadMapperValidationError(`${field} must be a valid E.164 phone number.`);
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }

  if (isRecord(value)) {
    return Object.values(value).every((item) => isJsonValue(item));
  }

  return false;
}

function pickFirstNonEmpty(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = normalizeNullableString(record[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

function normalizeEmail(value: string | null) {
  if (!value) {
    return null;
  }

  const lowered = value.toLowerCase();

  if (!LIGHT_EMAIL_REGEX.test(lowered)) {
    return null;
  }

  return lowered;
}

export function buildLeadTitle(params: BuildLeadTitleParams) {
  const phoneNumberE164 = ensureE164(params.phoneNumberE164, 'phoneNumberE164');
  const fullName = normalizeNullableString(params.fullName);
  const companyName = normalizeNullableString(params.companyName);

  if (fullName) {
    return `Lead - ${fullName}`;
  }

  if (companyName) {
    return `Lead - ${companyName}`;
  }

  return `Lead - ${phoneNumberE164}`;
}

export function mapGatherResultToLeadInput(params: MapGatherResultToLeadInputParams): LeadCreateInput {
  const phone = ensureE164(params.fromNumberE164, 'fromNumberE164');

  if (params.gatherResult !== null && !isRecord(params.gatherResult)) {
    throw new VoiceLeadMapperValidationError('gatherResult must be an object when provided.');
  }

  const gather = params.gatherResult ?? {};
  const fullName = pickFirstNonEmpty(gather, ['full_name', 'name', 'fullName']);
  const companyName = pickFirstNonEmpty(gather, ['company_name', 'company', 'companyName']);
  const email = normalizeEmail(pickFirstNonEmpty(gather, ['email', 'email_address', 'mail']));
  const sourceId = normalizeNullableString(params.sourceId);
  const fallbackTitle = normalizeNullableString(params.fallbackTitle);

  const title = fullName || companyName
    ? buildLeadTitle({
      fullName,
      companyName,
      phoneNumberE164: phone,
    })
    : fallbackTitle ?? buildLeadTitle({ phoneNumberE164: phone });

  const core: LeadCreateInput['core'] = {
    title,
    phone,
    ...(fullName ? { full_name: fullName } : {}),
    ...(companyName ? { company_name: companyName } : {}),
    ...(email ? { email } : {}),
    ...(sourceId ? { source_id: sourceId } : {}),
  };

  const consumedKeys = new Set([
    'full_name',
    'name',
    'fullName',
    'company_name',
    'company',
    'companyName',
    'email',
    'email_address',
    'mail',
    'phone',
    'phone_number',
    'mobile',
  ]);

  const custom: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(gather)) {
    if (consumedKeys.has(key)) {
      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'string') {
      const normalized = normalizeString(value);

      if (!normalized) {
        continue;
      }

      custom[key] = normalized;
      continue;
    }

    if (isJsonValue(value)) {
      custom[key] = value;
    }
  }

  return { core, custom };
}
