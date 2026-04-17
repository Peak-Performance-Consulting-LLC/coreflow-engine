export type TelnyxPhase1EventType =
  | 'call.initiated'
  | 'call.answered'
  | 'call.ai_gather.ended'
  | 'call.gather.ended'
  | 'call.conversation.ended'
  | 'call.analyzed'
  | 'call.hangup';

export interface NormalizedTelnyxEvent {
  provider: 'telnyx';
  providerEventId: string | null;
  eventType: string;
  occurredAt: string | null;
  callControlId: string | null;
  callLegId: string | null;
  callSessionId: string | null;
  connectionId: string | null;
  fromNumberE164: string | null;
  toNumberE164: string | null;
  gatherResult: Record<string, unknown> | null;
  gatherStatus: string | null;
  messageHistory: unknown[] | null;
  rawPayload: Record<string, unknown>;
}

export interface GatherExtraction {
  result: Record<string, unknown> | null;
  messageHistory: unknown[] | null;
  status: string | null;
}

export class TelnyxNormalizeError extends Error {}

export class MalformedTelnyxWebhookError extends TelnyxNormalizeError {}

export class MissingGatherPayloadError extends TelnyxNormalizeError {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getNestedRecord(parent: Record<string, unknown>, key: string) {
  const value = parent[key];
  return isRecord(value) ? value : null;
}

function findStringInUnknown(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const fromArray = findStringInUnknown(item);

      if (fromArray) {
        return fromArray;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const preferredKeys = [
    'e164',
    'phone_number_e164',
    'phone_number',
    'number',
    'uri',
    'value',
    'id',
  ];

  for (const key of preferredKeys) {
    if (!(key in value)) {
      continue;
    }

    const fromPreferredKey = findStringInUnknown(value[key]);

    if (fromPreferredKey) {
      return fromPreferredKey;
    }
  }

  for (const candidate of Object.values(value)) {
    const nested = findStringInUnknown(candidate);

    if (nested) {
      return nested;
    }
  }

  return null;
}

function normalizeE164FromCandidate(value: string | null) {
  if (!value) {
    return null;
  }

  const cleanedValue = value.trim();

  if (!cleanedValue) {
    return null;
  }

  const angleMatch = cleanedValue.match(/<([^>]+)>/);
  const coreValue = (angleMatch?.[1] ?? cleanedValue)
    .trim()
    .replace(/^tel:/i, '')
    .replace(/^sip:/i, '');
  const userPart = coreValue.split('@')[0]?.split(';')[0]?.trim() ?? '';

  if (!userPart) {
    return null;
  }

  const compact = userPart.replace(/[\s().-]+/g, '');

  if (/^\+[1-9][0-9]{1,14}$/.test(compact)) {
    return compact;
  }

  const embedded = compact.match(/\+[1-9][0-9]{1,14}/);
  return embedded?.[0] ?? null;
}

function pickE164(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (!(key in record)) {
      continue;
    }

    const rawCandidate = findStringInUnknown(record[key]);
    const normalized = normalizeE164FromCandidate(rawCandidate);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getString(record[key]);

    if (value) {
      return value;
    }
  }

  return '';
}

function pickArray(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

export function isPhase1HandledEvent(eventType: string): eventType is TelnyxPhase1EventType {
  return (
    eventType === 'call.initiated' ||
    eventType === 'call.answered' ||
    eventType === 'call.ai_gather.ended' ||
    eventType === 'call.gather.ended' ||
    eventType === 'call.conversation.ended' ||
    eventType === 'call.analyzed' ||
    eventType === 'call.hangup'
  );
}

export function parseTelnyxWebhook(rawJson: unknown): NormalizedTelnyxEvent {
  if (!isRecord(rawJson)) {
    throw new MalformedTelnyxWebhookError('Webhook body must be a JSON object.');
  }

  const data = getNestedRecord(rawJson, 'data') ?? rawJson;
  const payload = getNestedRecord(data, 'payload') ?? getNestedRecord(rawJson, 'payload') ?? {};
  const eventType =
    pickString(data, ['event_type', 'type']) ||
    pickString(rawJson, ['event_type', 'type']) ||
    pickString(payload, ['event_type', 'type']) ||
    'unknown';
  const providerEventId = pickString(data, ['id']) || pickString(rawJson, ['id']) || null;
  const occurredAt =
    pickString(data, ['occurred_at', 'created_at']) ||
    pickString(rawJson, ['occurred_at', 'created_at']) ||
    pickString(payload, ['occurred_at']) ||
    null;
  const callControlId = pickString(payload, ['call_control_id', 'callControlId']) || null;
  const callSessionId = pickString(payload, ['call_session_id']) || null;

  if (isPhase1HandledEvent(eventType)) {
    if (!providerEventId) {
      throw new MalformedTelnyxWebhookError(`Missing Telnyx event id for handled event ${eventType}.`);
    }

    if (!occurredAt) {
      throw new MalformedTelnyxWebhookError(`Missing occurred_at for handled event ${eventType}.`);
    }

    if (!callControlId && !callSessionId) {
      throw new MalformedTelnyxWebhookError(
        `Missing both call_control_id and call_session_id for handled event ${eventType}.`,
      );
    }
  }

  const gatherResult = isRecord(payload.result) ? payload.result : null;
  const gatherStatus =
    getString(payload.status) ||
    getString(payload.reason) ||
    (gatherResult ? getString(gatherResult.status) : '');
  const messageHistory = pickArray(payload, ['message_history', 'messages']);

  return {
    provider: 'telnyx',
    providerEventId,
    eventType,
    occurredAt,
    callControlId,
    callLegId: pickString(payload, ['call_leg_id']) || null,
    callSessionId: pickString(payload, ['call_session_id']) || null,
    connectionId: pickString(payload, ['connection_id']) || null,
    fromNumberE164: pickE164(payload, ['from_number_e164', 'from_number', 'from', 'ani']) ||
      pickE164(data, ['from_number_e164', 'from_number', 'from', 'ani']) ||
      null,
    toNumberE164: pickE164(payload, ['to_number_e164', 'to_number', 'to', 'destination', 'dnis']) ||
      pickE164(data, ['to_number_e164', 'to_number', 'to', 'destination', 'dnis']) ||
      null,
    gatherResult,
    gatherStatus: gatherStatus || null,
    messageHistory,
    rawPayload: rawJson,
  };
}

export function extractGatherResult(event: NormalizedTelnyxEvent): GatherExtraction {
  if (
    event.eventType !== 'call.ai_gather.ended' &&
    event.eventType !== 'call.gather.ended' &&
    event.eventType !== 'call.conversation.ended' &&
    event.eventType !== 'call.analyzed'
  ) {
    throw new MissingGatherPayloadError(
      'Gather extraction is only valid for call.ai_gather.ended, call.gather.ended, call.conversation.ended, or call.analyzed.',
    );
  }

  return {
    result: event.gatherResult,
    messageHistory: event.messageHistory,
    status: event.gatherStatus,
  };
}
