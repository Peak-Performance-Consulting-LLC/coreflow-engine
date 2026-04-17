import type { EdgeClient } from './server.ts';
import { createRecordForWorkspace } from './records.ts';
import type { LeadCreateInput } from './voice-lead-mapper.ts';

type CreatedLeadDetail = Awaited<ReturnType<typeof createRecordForWorkspace>>;

interface RecordSourceRow {
  id: string;
  name: string;
  source_type: string | null;
  is_active: boolean;
}

export interface EnsureInboundCallSourceResult {
  sourceId: string;
}

export interface CreateLeadFromVoiceCallParams {
  db: EdgeClient;
  workspaceId: string;
  actorUserId: string;
  mappedInput: VoiceLeadCreateInput;
}

export interface CreateLeadFromVoiceCallResult {
  recordId: string;
  recordDetail: CreatedLeadDetail;
}

export class VoiceLeadCreateError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'VoiceLeadCreateError';
    this.cause = cause;
  }
}

export class VoiceLeadCreateValidationError extends VoiceLeadCreateError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'VoiceLeadCreateValidationError';
  }
}

export class InboundCallSourceError extends VoiceLeadCreateError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'InboundCallSourceError';
  }
}

export class VoiceLeadCreateFailedError extends VoiceLeadCreateError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'VoiceLeadCreateFailedError';
  }
}

export type VoiceLeadCreateInput = LeadCreateInput;

const INBOUND_CALL_SOURCE_NAME = 'Inbound Call';
const INBOUND_CALL_SOURCE_TYPE = 'inbound_call';
const E164_REGEX = /^\+[1-9][0-9]{1,14}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
    throw new VoiceLeadCreateValidationError(`${field} is required.`);
  }

  return normalized;
}

function ensureE164(value: unknown, field: string) {
  const normalized = ensureNonEmpty(value, field);

  if (!E164_REGEX.test(normalized)) {
    throw new VoiceLeadCreateValidationError(`${field} must be a valid E.164 phone number.`);
  }

  return normalized;
}

function isUniqueViolation(error: unknown) {
  if (!isRecord(error)) return false;
  const code = normalizeString(error.code);
  return code === '23505';
}

function formatDbError(error: unknown) {
  if (!isRecord(error)) {
    return 'Unknown database error.';
  }

  const message = normalizeString(error.message);
  const code = normalizeString(error.code);
  const details = normalizeString(error.details);

  return [message, code ? `(code ${code})` : '', details ? `- ${details}` : ''].filter(Boolean).join(' ').trim();
}

async function findSourceByName(db: EdgeClient, workspaceId: string, name: string) {
  const { data, error } = await db
    .from('record_sources')
    .select('id, name, source_type, is_active')
    .eq('workspace_id', workspaceId)
    .eq('name', name)
    .maybeSingle();

  if (error) {
    throw new InboundCallSourceError(`Unable to query record source by name: ${formatDbError(error)}`, error);
  }

  return (data ?? null) as RecordSourceRow | null;
}

async function findActiveSourceByType(db: EdgeClient, workspaceId: string, sourceType: string) {
  const { data, error } = await db
    .from('record_sources')
    .select('id, name, source_type, is_active')
    .eq('workspace_id', workspaceId)
    .eq('source_type', sourceType)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new InboundCallSourceError(`Unable to query record source by type: ${formatDbError(error)}`, error);
  }

  return (data ?? null) as RecordSourceRow | null;
}

async function reactivateSource(db: EdgeClient, workspaceId: string, sourceId: string) {
  const { data, error } = await db
    .from('record_sources')
    .update({
      is_active: true,
      source_type: INBOUND_CALL_SOURCE_TYPE,
    })
    .eq('workspace_id', workspaceId)
    .eq('id', sourceId)
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new InboundCallSourceError(
      `Unable to reactivate inbound call source: ${formatDbError(error)}`,
      error,
    );
  }

  return data.id as string;
}

async function createInboundCallSource(db: EdgeClient, workspaceId: string) {
  const { data, error } = await db
    .from('record_sources')
    .insert({
      workspace_id: workspaceId,
      name: INBOUND_CALL_SOURCE_NAME,
      source_type: INBOUND_CALL_SOURCE_TYPE,
      is_active: true,
    })
    .select('id')
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const existing = await findSourceByName(db, workspaceId, INBOUND_CALL_SOURCE_NAME);

      if (!existing) {
        throw new InboundCallSourceError(
          'Inbound call source conflict occurred, but the source could not be re-fetched.',
          error,
        );
      }

      if (existing.is_active) {
        return existing.id;
      }

      return reactivateSource(db, workspaceId, existing.id);
    }

    throw new InboundCallSourceError(
      `Unable to create inbound call source: ${formatDbError(error)}`,
      error,
    );
  }

  if (!data?.id) {
    throw new InboundCallSourceError('Inbound call source create returned no id.');
  }

  return data.id as string;
}

export async function ensureInboundCallSource(
  db: EdgeClient,
  workspaceId: string,
): Promise<EnsureInboundCallSourceResult> {
  const normalizedWorkspaceId = ensureNonEmpty(workspaceId, 'workspaceId');

  const exactByName = await findSourceByName(db, normalizedWorkspaceId, INBOUND_CALL_SOURCE_NAME);

  if (exactByName?.is_active) {
    return { sourceId: exactByName.id };
  }

  if (exactByName && !exactByName.is_active) {
    const sourceId = await reactivateSource(db, normalizedWorkspaceId, exactByName.id);
    return { sourceId };
  }

  const byType = await findActiveSourceByType(db, normalizedWorkspaceId, INBOUND_CALL_SOURCE_TYPE);

  if (byType) {
    return { sourceId: byType.id };
  }

  const sourceId = await createInboundCallSource(db, normalizedWorkspaceId);
  return { sourceId };
}

export async function createLeadFromVoiceCall(
  params: CreateLeadFromVoiceCallParams,
): Promise<CreateLeadFromVoiceCallResult> {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const actorUserId = ensureNonEmpty(params.actorUserId, 'actorUserId');

  if (!isRecord(params.mappedInput) || !isRecord(params.mappedInput.core)) {
    throw new VoiceLeadCreateValidationError('mappedInput.core is required.');
  }

  const mappedCore = params.mappedInput.core;
  const mappedCustom = isRecord(params.mappedInput.custom) ? params.mappedInput.custom : {};

  const title = ensureNonEmpty(mappedCore.title, 'mappedInput.core.title');
  const phone = ensureE164(mappedCore.phone, 'mappedInput.core.phone');
  const fullName = normalizeNullableString(mappedCore.full_name);
  const email = normalizeNullableString(mappedCore.email);
  const companyName = normalizeNullableString(mappedCore.company_name);

  let sourceId = normalizeNullableString(mappedCore.source_id);

  if (!sourceId) {
    try {
      const ensuredSource = await ensureInboundCallSource(params.db, workspaceId);
      sourceId = ensuredSource.sourceId;
    } catch (error) {
      if (error instanceof InboundCallSourceError) {
        throw error;
      }

      throw new InboundCallSourceError('Failed to ensure inbound call source.', error);
    }
  }

  try {
    const recordDetail = await createRecordForWorkspace(params.db, actorUserId, {
      workspace_id: workspaceId,
      core: {
        title,
        phone,
        ...(fullName ? { full_name: fullName } : {}),
        ...(email ? { email } : {}),
        ...(companyName ? { company_name: companyName } : {}),
        ...(sourceId ? { source_id: sourceId } : {}),
      },
      custom: mappedCustom,
    });

    const recordId = normalizeString(recordDetail?.record?.id);

    if (!recordId) {
      throw new VoiceLeadCreateFailedError('Lead created but record id is missing in response.');
    }

    return {
      recordId,
      recordDetail,
    };
  } catch (error) {
    if (error instanceof VoiceLeadCreateError) {
      throw error;
    }

    throw new VoiceLeadCreateFailedError('Failed to create lead from voice call.', error);
  }
}
