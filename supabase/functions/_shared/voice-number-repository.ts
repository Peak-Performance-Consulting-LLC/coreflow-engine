import type { EdgeClient } from './server.ts';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type VoiceProvider = 'telnyx';
export type WorkspacePhoneProvisioningStatus = 'pending' | 'active' | 'failed' | 'released';
export type WorkspacePhoneWebhookStatus = 'pending' | 'ready' | 'failed';

export interface WorkspacePhoneNumberRow {
  id: string;
  workspace_id: string;
  provider: VoiceProvider;
  phone_number_e164: string;
  label: string | null;
  provisioning_status: WorkspacePhoneProvisioningStatus;
  webhook_status: WorkspacePhoneWebhookStatus;
  last_provisioning_error: string | null;
  telnyx_connection_id: string | null;
  provider_order_id: string | null;
  telnyx_metadata: JsonValue;
  provider_phone_number_id: string | null;
  is_active: boolean;
  voice_mode: string;
  purchased_at: string | null;
  released_at: string | null;
  provisioning_locked_at: string | null;
  last_webhook_observed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspacePhoneNumberView {
  id: string;
  phone_number_e164: string;
  label: string | null;
  provisioning_status: WorkspacePhoneProvisioningStatus;
  webhook_status: WorkspacePhoneWebhookStatus;
  last_provisioning_error: string | null;
  is_active: boolean;
  voice_mode: string;
  purchased_at: string | null;
  released_at: string | null;
  created_at: string;
  updated_at: string;
}

export class VoiceRepositoryError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'VoiceRepositoryError';
    this.cause = cause;
  }
}

export class VoiceRepositoryDbError extends VoiceRepositoryError {
  operation: string;

  constructor(operation: string, message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'VoiceRepositoryDbError';
    this.operation = operation;
  }
}

export class VoiceRepositoryValidationError extends VoiceRepositoryError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'VoiceRepositoryValidationError';
  }
}

export class VoiceRepositoryNotFoundError extends VoiceRepositoryError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'VoiceRepositoryNotFoundError';
  }
}

export class VoiceRepositoryWorkspaceMismatchError extends VoiceRepositoryError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'VoiceRepositoryWorkspaceMismatchError';
  }
}

export interface ListWorkspacePhoneNumbersParams {
  workspaceId: string;
  includeInactive?: boolean;
}

export interface SaveWorkspacePhoneNumberParams {
  workspaceId: string;
  phoneNumberE164: string;
  label?: string | null;
  provider?: VoiceProvider;
  providerPhoneNumberId?: string | null;
  providerOrderId?: string | null;
  provisioningStatus?: WorkspacePhoneProvisioningStatus;
  webhookStatus?: WorkspacePhoneWebhookStatus;
  lastProvisioningError?: string | null;
  telnyxConnectionId?: string | null;
  telnyxMetadata?: JsonValue;
  isActive?: boolean;
  voiceMode?: string | null;
  purchasedAt?: string | null;
  releasedAt?: string | null;
  provisioningLockedAt?: string | null;
}

export interface UpdateWorkspacePhoneNumberParams {
  workspaceId: string;
  voiceNumberId: string;
  label?: string | null;
  providerPhoneNumberId?: string | null;
  providerOrderId?: string | null;
  provisioningStatus?: WorkspacePhoneProvisioningStatus;
  webhookStatus?: WorkspacePhoneWebhookStatus;
  lastProvisioningError?: string | null;
  telnyxConnectionId?: string | null;
  telnyxMetadata?: JsonValue;
  isActive?: boolean;
  voiceMode?: string | null;
  purchasedAt?: string | null;
  releasedAt?: string | null;
  provisioningLockedAt?: string | null;
}

export interface ClaimWorkspacePhoneNumberProvisioningParams {
  workspaceId: string;
  voiceNumberId: string;
  staleAfterSeconds?: number;
}

export interface ClaimWorkspacePhoneNumberProvisioningResult {
  claimed: boolean;
  number: WorkspacePhoneNumberRow;
}

const WORKSPACE_PHONE_NUMBER_COLUMNS =
  'id, workspace_id, provider, phone_number_e164, label, provisioning_status, webhook_status, last_provisioning_error, telnyx_connection_id, provider_order_id, telnyx_metadata, provider_phone_number_id, is_active, voice_mode, purchased_at, released_at, provisioning_locked_at, last_webhook_observed_at, created_at, updated_at';
const E164_REGEX = /^\+[1-9][0-9]{1,14}$/;
const NOW = () => new Date().toISOString();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableString(value: unknown) {
  const next = normalizeString(value);
  return next.length > 0 ? next : null;
}

function ensureNonEmpty(value: unknown, field: string) {
  const next = normalizeString(value);

  if (!next) {
    throw new VoiceRepositoryValidationError(`${field} is required.`);
  }

  return next;
}

function ensureE164(value: unknown, field: string) {
  const next = ensureNonEmpty(value, field);

  if (!E164_REGEX.test(next)) {
    throw new VoiceRepositoryValidationError(`${field} must be a valid E.164 number.`);
  }

  return next;
}

function ensureIsoTimestamp(value: unknown, field: string) {
  const next = ensureNonEmpty(value, field);
  const parsed = new Date(next);

  if (Number.isNaN(parsed.getTime())) {
    throw new VoiceRepositoryValidationError(`${field} must be a valid ISO timestamp.`);
  }

  return parsed.toISOString();
}

function isWorkspacePhoneNumberReadyState(
  provisioningStatus: WorkspacePhoneProvisioningStatus,
  webhookStatus: WorkspacePhoneWebhookStatus,
  releasedAt: string | null,
) {
  return provisioningStatus === 'active' && webhookStatus === 'ready' && releasedAt === null;
}

function resolveWorkspacePhoneNumberRuntimeState(params: {
  current?: WorkspacePhoneNumberRow | null;
  provisioningStatus?: WorkspacePhoneProvisioningStatus;
  webhookStatus?: WorkspacePhoneWebhookStatus;
  isActive?: boolean;
  releasedAt?: string | null;
}) {
  const current = params.current ?? null;
  const provisioningStatus = params.provisioningStatus ?? current?.provisioning_status ?? 'pending';
  const webhookStatus = params.webhookStatus ?? current?.webhook_status ?? 'pending';
  const releasedAt = params.releasedAt !== undefined
    ? params.releasedAt
    : current?.released_at ?? null;
  const requestedIsActive = typeof params.isActive === 'boolean'
    ? params.isActive
    : current?.is_active ?? false;

  return {
    provisioningStatus,
    webhookStatus,
    releasedAt,
    isActive: requestedIsActive && isWorkspacePhoneNumberReadyState(provisioningStatus, webhookStatus, releasedAt),
  };
}

function isUniqueViolation(error: unknown) {
  if (!isRecord(error)) return false;
  const code = normalizeString(error.code);
  const message = normalizeString(error.message).toLowerCase();
  return code === '23505' || message.includes('duplicate key');
}

function formatDbError(error: unknown) {
  if (!isRecord(error)) return 'Unknown database error.';
  const message = normalizeString(error.message);
  const code = normalizeString(error.code);
  const details = normalizeString(error.details);
  return [message, code ? `(code ${code})` : '', details ? `- ${details}` : ''].filter(Boolean).join(' ').trim();
}

function throwDbError(operation: string, error: unknown): never {
  throw new VoiceRepositoryDbError(operation, formatDbError(error), error);
}

export function isWorkspacePhoneNumberRoutable(row: Pick<
  WorkspacePhoneNumberRow,
  'provisioning_status' | 'webhook_status' | 'released_at' | 'is_active'
>) {
  return row.is_active && isWorkspacePhoneNumberReadyState(row.provisioning_status, row.webhook_status, row.released_at);
}

export async function findWorkspacePhoneNumberById(
  db: EdgeClient,
  workspaceId: string,
  voiceNumberId: string,
) {
  const nextWorkspaceId = ensureNonEmpty(workspaceId, 'workspaceId');
  const nextVoiceNumberId = ensureNonEmpty(voiceNumberId, 'voiceNumberId');
  const { data, error } = await db
    .from('workspace_phone_numbers')
    .select(WORKSPACE_PHONE_NUMBER_COLUMNS)
    .eq('workspace_id', nextWorkspaceId)
    .eq('id', nextVoiceNumberId)
    .maybeSingle();

  if (error) {
    throwDbError('findWorkspacePhoneNumberById', error);
  }

  if (!data) {
    throw new VoiceRepositoryNotFoundError('Workspace phone number not found.');
  }

  return data as WorkspacePhoneNumberRow;
}

export async function findWorkspacePhoneNumberByE164AnyStatus(
  db: EdgeClient,
  phoneNumber: string,
) {
  const normalizedPhoneNumber = ensureE164(phoneNumber, 'phoneNumber');
  const { data, error } = await db
    .from('workspace_phone_numbers')
    .select(WORKSPACE_PHONE_NUMBER_COLUMNS)
    .eq('provider', 'telnyx')
    .eq('phone_number_e164', normalizedPhoneNumber)
    .maybeSingle();

  if (error) {
    throwDbError('findWorkspacePhoneNumberByE164AnyStatus', error);
  }

  return (data ?? null) as WorkspacePhoneNumberRow | null;
}

export function toWorkspacePhoneNumberView(row: WorkspacePhoneNumberRow): WorkspacePhoneNumberView {
  return {
    id: row.id,
    phone_number_e164: row.phone_number_e164,
    label: row.label,
    provisioning_status: row.provisioning_status,
    webhook_status: row.webhook_status,
    last_provisioning_error: row.last_provisioning_error,
    is_active: row.is_active,
    voice_mode: row.voice_mode,
    purchased_at: row.purchased_at,
    released_at: row.released_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listWorkspacePhoneNumbers(
  db: EdgeClient,
  params: ListWorkspacePhoneNumbersParams,
) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  let query = db
    .from('workspace_phone_numbers')
    .select(WORKSPACE_PHONE_NUMBER_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (!params.includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    throwDbError('listWorkspacePhoneNumbers', error);
  }

  return (data ?? []) as WorkspacePhoneNumberRow[];
}

export async function saveWorkspacePhoneNumber(
  db: EdgeClient,
  params: SaveWorkspacePhoneNumberParams,
) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const phoneNumber = ensureE164(params.phoneNumberE164, 'phoneNumberE164');
  const existing = await findWorkspacePhoneNumberByE164AnyStatus(db, phoneNumber);
  const voiceMode = normalizeNullableString(params.voiceMode) ?? existing?.voice_mode ?? 'ai_lead_capture';
  const telnyxMetadata = params.telnyxMetadata !== undefined
    ? isRecord(params.telnyxMetadata) || Array.isArray(params.telnyxMetadata)
      ? params.telnyxMetadata
      : {}
    : existing?.telnyx_metadata ?? {};
  const purchasedAt = params.purchasedAt !== undefined
    ? params.purchasedAt
      ? ensureIsoTimestamp(params.purchasedAt, 'purchasedAt')
      : null
    : existing?.purchased_at ?? null;
  const releasedAt = params.releasedAt !== undefined
    ? params.releasedAt
      ? ensureIsoTimestamp(params.releasedAt, 'releasedAt')
      : null
    : existing?.released_at ?? null;
  const provisioningLockedAt = params.provisioningLockedAt !== undefined
    ? params.provisioningLockedAt
      ? ensureIsoTimestamp(params.provisioningLockedAt, 'provisioningLockedAt')
      : null
    : existing?.provisioning_locked_at ?? null;
  const runtimeState = resolveWorkspacePhoneNumberRuntimeState({
    current: existing,
    provisioningStatus: params.provisioningStatus,
    webhookStatus: params.webhookStatus,
    isActive: params.isActive,
    releasedAt,
  });

  const payload = {
    label: params.label !== undefined ? normalizeNullableString(params.label) : existing?.label ?? null,
    provisioning_status: runtimeState.provisioningStatus,
    webhook_status: runtimeState.webhookStatus,
    last_provisioning_error: params.lastProvisioningError !== undefined
      ? normalizeNullableString(params.lastProvisioningError)
      : existing?.last_provisioning_error ?? null,
    telnyx_connection_id: params.telnyxConnectionId !== undefined
      ? normalizeNullableString(params.telnyxConnectionId)
      : existing?.telnyx_connection_id ?? null,
    provider_order_id: params.providerOrderId !== undefined
      ? normalizeNullableString(params.providerOrderId)
      : existing?.provider_order_id ?? null,
    telnyx_metadata: telnyxMetadata,
    provider_phone_number_id: params.providerPhoneNumberId !== undefined
      ? normalizeNullableString(params.providerPhoneNumberId)
      : existing?.provider_phone_number_id ?? null,
    is_active: runtimeState.isActive,
    voice_mode: voiceMode,
    purchased_at: purchasedAt,
    released_at: runtimeState.releasedAt,
    provisioning_locked_at: provisioningLockedAt,
  };

  if (existing && existing.workspace_id !== workspaceId) {
    throw new VoiceRepositoryWorkspaceMismatchError(
      'This phone number is already assigned to another workspace.',
    );
  }

  if (existing) {
    const { data, error } = await db
      .from('workspace_phone_numbers')
      .update(payload)
      .eq('workspace_id', existing.workspace_id)
      .eq('id', existing.id)
      .select(WORKSPACE_PHONE_NUMBER_COLUMNS)
      .single();

    if (error) {
      throwDbError('saveWorkspacePhoneNumber.updateExisting', error);
    }

    return data as WorkspacePhoneNumberRow;
  }

  const { data, error } = await db
    .from('workspace_phone_numbers')
    .insert({
      workspace_id: workspaceId,
      provider: params.provider ?? 'telnyx',
      phone_number_e164: phoneNumber,
      ...payload,
    })
    .select(WORKSPACE_PHONE_NUMBER_COLUMNS)
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const conflict = await findWorkspacePhoneNumberByE164AnyStatus(db, phoneNumber);

      if (conflict && conflict.workspace_id !== workspaceId) {
        throw new VoiceRepositoryWorkspaceMismatchError(
          'This phone number is already assigned to another workspace.',
        );
      }

      if (conflict) {
        return saveWorkspacePhoneNumber(db, params);
      }
    }

    throwDbError('saveWorkspacePhoneNumber', error);
  }

  return data as WorkspacePhoneNumberRow;
}

export async function updateWorkspacePhoneNumber(
  db: EdgeClient,
  params: UpdateWorkspacePhoneNumberParams,
) {
  const current = await findWorkspacePhoneNumberById(db, params.workspaceId, params.voiceNumberId);
  const patch: Record<string, unknown> = {};

  if (params.label !== undefined) {
    patch.label = normalizeNullableString(params.label);
  }

  if (params.providerPhoneNumberId !== undefined) {
    patch.provider_phone_number_id = normalizeNullableString(params.providerPhoneNumberId);
  }

  if (params.providerOrderId !== undefined) {
    patch.provider_order_id = normalizeNullableString(params.providerOrderId);
  }

  if (params.provisioningStatus !== undefined) {
    patch.provisioning_status = params.provisioningStatus;
  }

  if (params.webhookStatus !== undefined) {
    patch.webhook_status = params.webhookStatus;
  }

  if (params.lastProvisioningError !== undefined) {
    patch.last_provisioning_error = normalizeNullableString(params.lastProvisioningError);
  }

  if (params.telnyxConnectionId !== undefined) {
    patch.telnyx_connection_id = normalizeNullableString(params.telnyxConnectionId);
  }

  if (params.telnyxMetadata !== undefined) {
    patch.telnyx_metadata =
      isRecord(params.telnyxMetadata) || Array.isArray(params.telnyxMetadata)
        ? params.telnyxMetadata
        : {};
  }

  if (typeof params.isActive === 'boolean') {
    patch.is_active = params.isActive;
  }

  if (params.voiceMode !== undefined) {
    patch.voice_mode = normalizeNullableString(params.voiceMode) ?? current.voice_mode;
  }

  if (params.purchasedAt !== undefined) {
    patch.purchased_at = params.purchasedAt ? ensureIsoTimestamp(params.purchasedAt, 'purchasedAt') : null;
  }

  if (params.releasedAt !== undefined) {
    patch.released_at = params.releasedAt ? ensureIsoTimestamp(params.releasedAt, 'releasedAt') : null;
  }

  if (params.provisioningLockedAt !== undefined) {
    patch.provisioning_locked_at = params.provisioningLockedAt
      ? ensureIsoTimestamp(params.provisioningLockedAt, 'provisioningLockedAt')
      : null;
  }

  if (Object.keys(patch).length === 0) {
    return current;
  }

  const runtimeState = resolveWorkspacePhoneNumberRuntimeState({
    current,
    provisioningStatus: patch.provisioning_status as WorkspacePhoneProvisioningStatus | undefined,
    webhookStatus: patch.webhook_status as WorkspacePhoneWebhookStatus | undefined,
    isActive: typeof patch.is_active === 'boolean' ? patch.is_active : undefined,
    releasedAt: Object.hasOwn(patch, 'released_at') ? (patch.released_at as string | null) : undefined,
  });

  patch.provisioning_status = runtimeState.provisioningStatus;
  patch.webhook_status = runtimeState.webhookStatus;
  patch.released_at = runtimeState.releasedAt;
  patch.is_active = runtimeState.isActive;

  const { data, error } = await db
    .from('workspace_phone_numbers')
    .update(patch)
    .eq('workspace_id', current.workspace_id)
    .eq('id', current.id)
    .select(WORKSPACE_PHONE_NUMBER_COLUMNS)
    .single();

  if (error) {
    throwDbError('updateWorkspacePhoneNumber', error);
  }

  return data as WorkspacePhoneNumberRow;
}

export async function claimWorkspacePhoneNumberProvisioning(
  db: EdgeClient,
  params: ClaimWorkspacePhoneNumberProvisioningParams,
): Promise<ClaimWorkspacePhoneNumberProvisioningResult> {
  const current = await findWorkspacePhoneNumberById(db, params.workspaceId, params.voiceNumberId);
  const staleAfterSeconds = Number.isFinite(params.staleAfterSeconds)
    ? Math.max(30, Math.trunc(Number(params.staleAfterSeconds)))
    : 120;
  const staleBefore = new Date(Date.now() - staleAfterSeconds * 1000).toISOString();
  const currentLockedAt = current.provisioning_locked_at;
  const isStale = currentLockedAt ? currentLockedAt <= staleBefore : true;

  if (currentLockedAt && !isStale) {
    return { claimed: false, number: current };
  }

  let query = db
    .from('workspace_phone_numbers')
    .update({ provisioning_locked_at: NOW() })
    .eq('workspace_id', current.workspace_id)
    .eq('id', current.id)
    .select(WORKSPACE_PHONE_NUMBER_COLUMNS);

  query = currentLockedAt
    ? query.eq('provisioning_locked_at', currentLockedAt)
    : query.is('provisioning_locked_at', null);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throwDbError('claimWorkspacePhoneNumberProvisioning', error);
  }

  if (!data) {
    const fresh = await findWorkspacePhoneNumberById(db, params.workspaceId, params.voiceNumberId);
    return { claimed: false, number: fresh };
  }

  return {
    claimed: true,
    number: data as WorkspacePhoneNumberRow,
  };
}

export async function releaseWorkspacePhoneNumberProvisioning(
  db: EdgeClient,
  workspaceId: string,
  voiceNumberId: string,
) {
  const number = await findWorkspacePhoneNumberById(db, workspaceId, voiceNumberId);
  const { data, error } = await db
    .from('workspace_phone_numbers')
    .update({ provisioning_locked_at: null })
    .eq('workspace_id', number.workspace_id)
    .eq('id', number.id)
    .select(WORKSPACE_PHONE_NUMBER_COLUMNS)
    .single();

  if (error) {
    throwDbError('releaseWorkspacePhoneNumberProvisioning', error);
  }

  return data as WorkspacePhoneNumberRow;
}
