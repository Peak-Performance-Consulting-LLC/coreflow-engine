import type { EdgeClient } from './server.ts';
import { createLeadFromVoiceCall, ensureInboundCallSource, type CreateLeadFromVoiceCallResult } from './voice-lead-create.ts';
import { buildLeadTitle, mapGatherResultToLeadInput, type LeadCreateInput } from './voice-lead-mapper.ts';
import {
  findVoiceCallById,
  type VoiceCallRow,
} from './voice-repository.ts';
import {
  mapVoiceAgentGatherResultToLeadInput,
  parseVoiceAgentCallSnapshot,
} from './voice-agent-mapper.ts';
import { revalidateVoiceAgentSnapshotTargets } from './voice-agent-validator.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function ensureNonEmpty(value: unknown, field: string) {
  const normalized = normalizeString(value);

  if (!normalized) {
    throw new Error(`${field} is required.`);
  }

  return normalized;
}

function toGatherObject(value: unknown) {
  return isRecord(value) ? value : null;
}

interface ActiveRecordCustomField {
  field_key: string;
  label: string;
  field_type: string;
  is_required: boolean;
  options: unknown;
}

interface TranscriptMessage {
  role: string;
  content: string;
}

interface TranscriptSignals {
  fullName: string | null;
  email: string | null;
  propertyType: string | null;
  preferredLocation: string | null;
  budget: number | null;
  financingRequired: boolean | null;
}

const LIGHT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CRORE_REGEX = /\b(?:crore|crores|karoor|karoor|croor)\b/;
const LAKH_REGEX = /\b(?:lakh|lakhs)\b/;
const RECAP_LABEL_REGEX = /\b(?:name|email|inquiry|preferred location|property type|budget|timeline|financing needed)\s*:/i;
const RECAP_LABEL_SPLIT_REGEX = /\s+(?:name|email|inquiry|preferred location|property type|budget|timeline|financing needed)\s*:/i;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function cleanupExtractedText(value: string | null) {
  if (!value) {
    return null;
  }

  const cleaned = normalizeWhitespace(value.replace(/^[\s:,-]+|[\s.,;:!?-]+$/g, ''));
  return cleaned || null;
}

function normalizeEmailCandidate(value: string | null) {
  if (!value) {
    return null;
  }

  const lowered = value
    .toLowerCase()
    .replace(/\s+(?:at)\s+/g, '@')
    .replace(/\s+(?:dot)\s+/g, '.')
    .replace(/\s+(?:underscore)\s+/g, '_')
    .replace(/\s+(?:dash|hyphen)\s+/g, '-')
    .replace(/\s+/g, '');

  if (!LIGHT_EMAIL_REGEX.test(lowered)) {
    return null;
  }

  return lowered;
}

function extractEmailFromText(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = normalizeEmailCandidate(value);

  if (normalized) {
    return normalized;
  }

  const directMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return normalizeEmailCandidate(directMatch?.[0] ?? null);
}

function toTranscriptMessages(value: unknown): TranscriptMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const role = normalizeString(item.role);
      const content = cleanupExtractedText(normalizeString(item.content));

      if (!role || !content) {
        return null;
      }

      return { role, content };
    })
    .filter((item): item is TranscriptMessage => Boolean(item));
}

function getRoleMessages(messages: TranscriptMessage[], role: string) {
  return messages.filter((message) => message.role === role);
}

function getJoinedTranscript(messages: TranscriptMessage[], role?: string) {
  const filtered = role ? messages.filter((message) => message.role === role) : messages;
  return filtered.map((message) => message.content).join('\n');
}

function extractLabeledValue(text: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `${escapedLabel}\\s*:\\s*([\\s\\S]*?)(?=\\s+(?:name|email|inquiry|preferred location|property type|budget|timeline|financing needed)\\s*:|$)`,
    'i',
  ));
  return cleanupExtractedText(match?.[1] ?? null);
}

function isAcknowledgement(value: string) {
  const normalized = normalizeTranscriptUserContent(value).toLowerCase();
  return normalized === 'yes' ||
    normalized === 'yes yes' ||
    normalized === 'yeah' ||
    normalized === 'yeah yeah' ||
    normalized === 'yep' ||
    normalized === 'ok' ||
    normalized === 'okay' ||
    normalized === 'no' ||
    normalized === 'no no';
}

function normalizeTranscriptUserContent(value: string) {
  return normalizeString(value)
    .replace(/\[(?:long\s+)?silence\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBridgeAssistantLine(value: string, promptPattern: RegExp) {
  const normalized = normalizeString(value).toLowerCase();

  if (!normalized) {
    return true;
  }

  if (promptPattern.test(normalized)) {
    return true;
  }

  return /^(sure|okay|ok|alright|all right|thanks|thank you|great|got it|no problem|certainly)[!. ,]*$/.test(normalized);
}

function findLastUserResponse(messages: TranscriptMessage[], promptPattern: RegExp, allowAcknowledgement = false) {
  let lastResponse: string | null = null;

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];

    if (message.role !== 'assistant' || !promptPattern.test(message.content.toLowerCase())) {
      continue;
    }

    let candidate: string | null = null;
    let assistantTurnsSincePrompt = 0;

    for (let inner = index + 1; inner < messages.length; inner += 1) {
      const next = messages[inner];

      if (next.role === 'assistant') {
        assistantTurnsSincePrompt += 1;

        if (assistantTurnsSincePrompt > 3) {
          break;
        }

        if (isBridgeAssistantLine(next.content, promptPattern)) {
          continue;
        }

        break;
      }

      if (next.role !== 'user') {
        continue;
      }

      const normalizedUserContent = normalizeTranscriptUserContent(next.content);

      if (!normalizedUserContent) {
        continue;
      }

      if (!allowAcknowledgement && isAcknowledgement(normalizedUserContent)) {
        continue;
      }

      candidate = normalizedUserContent;
      break;
    }

    if (candidate) {
      lastResponse = candidate;
    }
  }

  return cleanupExtractedText(lastResponse);
}

function extractNameFromAssistantMessages(messages: TranscriptMessage[]) {
  for (const message of [...getRoleMessages(messages, 'assistant')].reverse()) {
    const labeled = extractLabeledValue(message.content, 'Name');

    if (labeled) {
      return labeled;
    }

    const correctMatch = message.content.match(/\b([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3})\.\s+Is that correct\?/);

    if (correctMatch?.[1]) {
      return cleanupExtractedText(correctMatch[1]);
    }

    const thatsMatch = message.content.match(/\b(?:that'?s|thats)\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3})/i);

    if (thatsMatch?.[1]) {
      return cleanupExtractedText(thatsMatch[1]);
    }
  }

  return null;
}

function extractEmailFromMessages(messages: TranscriptMessage[]) {
  for (const message of [...getRoleMessages(messages, 'assistant')].reverse()) {
    const labeled = extractLabeledValue(message.content, 'Email');
    const fromLabeled = extractEmailFromText(labeled);

    if (fromLabeled) {
      return fromLabeled;
    }
  }

  // Prioritize caller utterances over assistant recap text to avoid
  // extracting accidental prompt boilerplate as an email.
  for (const message of [...getRoleMessages(messages, 'user')].reverse()) {
    const fromMessage = extractEmailFromText(message.content);

    if (fromMessage) {
      return fromMessage;
    }
  }

  return null;
}

function parseWordsToNumber(value: string) {
  const units = new Map<string, number>([
    ['zero', 0],
    ['one', 1],
    ['two', 2],
    ['three', 3],
    ['four', 4],
    ['five', 5],
    ['six', 6],
    ['seven', 7],
    ['eight', 8],
    ['nine', 9],
    ['ten', 10],
    ['eleven', 11],
    ['twelve', 12],
    ['thirteen', 13],
    ['fourteen', 14],
    ['fifteen', 15],
    ['sixteen', 16],
    ['seventeen', 17],
    ['eighteen', 18],
    ['nineteen', 19],
    ['twenty', 20],
    ['thirty', 30],
    ['forty', 40],
    ['fifty', 50],
    ['sixty', 60],
    ['seventy', 70],
    ['eighty', 80],
    ['ninety', 90],
  ]);

  const tokens = value
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
    .filter((token) => token !== 'and');

  if (tokens.length === 0) {
    return null;
  }

  let total = 0;
  let current = 0;

  for (const token of tokens) {
    if (units.has(token)) {
      current += units.get(token) ?? 0;
      continue;
    }

    if (token === 'hundred') {
      current = Math.max(1, current) * 100;
      continue;
    }

    if (token === 'thousand') {
      total += Math.max(1, current) * 1000;
      current = 0;
      continue;
    }

    if (token === 'million') {
      total += Math.max(1, current) * 1000000;
      current = 0;
      continue;
    }

    return null;
  }

  return total + current;
}

function parseAmount(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/rs\.?/g, '')
    .replace(/rupees?/g, '')
    .trim();

  if (!normalized) {
    return null;
  }

  const directNumber = normalized.match(/-?\d+(?:\.\d+)?/);
  const numericBase = directNumber ? Number(directNumber[0]) : parseWordsToNumber(normalized);

  if (numericBase === null || Number.isNaN(numericBase)) {
    return null;
  }

  if (CRORE_REGEX.test(normalized)) {
    return numericBase * 10000000;
  }

  if (LAKH_REGEX.test(normalized)) {
    return numericBase * 100000;
  }

  if (/\bmillion\b/.test(normalized)) {
    return numericBase * 1000000;
  }

  if (/\bbillion\b/.test(normalized)) {
    return numericBase * 1000000000;
  }

  if (/\bthousand\b/.test(normalized)) {
    return numericBase * 1000;
  }

  return numericBase;
}

function getSelectOptions(field: ActiveRecordCustomField) {
  if (Array.isArray(field.options)) {
    return field.options.map((option) => normalizeString(option)).filter(Boolean);
  }

  if (isRecord(field.options) && Array.isArray(field.options.values)) {
    return field.options.values.map((option) => normalizeString(option)).filter(Boolean);
  }

  return [];
}

function findFieldBySemantic(
  fields: ActiveRecordCustomField[],
  semantic: 'property_type' | 'preferred_location' | 'budget' | 'financing_required',
) {
  const exact = fields.find((field) => field.field_key === semantic);

  if (exact) {
    return exact;
  }

  if (semantic === 'property_type') {
    return fields.find((field) => /property/i.test(field.label) && /type/i.test(field.label)) ?? null;
  }

  if (semantic === 'preferred_location') {
    return fields.find((field) => /location|area/i.test(field.field_key) || /location|area/i.test(field.label)) ?? null;
  }

  if (semantic === 'budget') {
    return fields.find((field) => /budget/i.test(field.field_key) || /budget/i.test(field.label)) ?? null;
  }

  if (semantic === 'financing_required') {
    return fields.find((field) => /financ/i.test(field.field_key) || /financ/i.test(field.label)) ?? null;
  }

  return null;
}

function matchSelectOption(field: ActiveRecordCustomField, value: string | null) {
  const normalized = cleanupExtractedText(value);

  if (!normalized) {
    return null;
  }

  const options = getSelectOptions(field);

  if (options.length === 0) {
    return normalized;
  }

  const lowered = normalized.toLowerCase();
  const exact = options.find((option) => option.toLowerCase() === lowered);

  if (exact) {
    return exact;
  }

  const contains = options.find((option) => lowered.includes(option.toLowerCase()) || option.toLowerCase().includes(lowered));
  if (contains) {
    return contains;
  }

  const isPropertyTypeField = /property/i.test(field.field_key) ||
    (/property/i.test(field.label) && /type/i.test(field.label));

  if (!isPropertyTypeField) {
    return null;
  }

  const semanticMatch = (
    keywords: string[],
    optionTokens: string[],
  ) => {
    if (!keywords.some((keyword) => lowered.includes(keyword))) {
      return null;
    }

    return options.find((option) => {
      const optionLower = option.toLowerCase();
      return optionTokens.some((token) => optionLower.includes(token));
    }) ?? null;
  };

  return semanticMatch(
    ['commercial', 'office', 'shop', 'retail'],
    ['commercial', 'office', 'shop', 'retail'],
  ) ??
    semanticMatch(
      ['plot', 'land', 'site'],
      ['plot', 'land', 'site'],
    ) ??
    semanticMatch(
      ['villa', 'bungalow', 'independent house', 'independent'],
      ['villa', 'bungalow', 'independent'],
    ) ??
    semanticMatch(
      ['apartment', 'flat', 'residential', 'home', 'house'],
      ['apartment', 'flat', 'residential', 'home', 'house'],
    );
}

function normalizeCustomFieldValue(field: ActiveRecordCustomField, value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (field.field_type === 'number') {
    const numeric = typeof value === 'number' ? value : parseAmount(normalizeString(value));
    return typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : null;
  }

  if (field.field_type === 'boolean') {
    if (typeof value === 'boolean') {
      return value;
    }

    const normalized = normalizeString(value).toLowerCase();

    if (!normalized) {
      return null;
    }

    if (['true', 'yes', 'y', '1', 'needed', 'required'].includes(normalized)) {
      return true;
    }

    if (['false', 'no', 'n', '0', 'not needed'].includes(normalized)) {
      return false;
    }

    if (/no financ/i.test(normalized)) {
      return false;
    }

    if (/need financ|financing required|with financ/i.test(normalized)) {
      return true;
    }

    return null;
  }

  if (field.field_type === 'select') {
    return matchSelectOption(field, normalizeString(value));
  }

  if (field.field_type === 'multi_select') {
    return Array.isArray(value)
      ? value.map((item) => normalizeString(item)).filter(Boolean)
      : null;
  }

  const normalized = cleanupExtractedText(normalizeString(value));
  return normalized ?? null;
}

function filterLeadCreateInputToActiveFields(
  input: LeadCreateInput,
  fields: ActiveRecordCustomField[],
) {
  const fieldByKey = new Map(fields.map((field) => [field.field_key, field]));
  const custom: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input.custom)) {
    const field = fieldByKey.get(key);

    if (!field) {
      continue;
    }

    const normalized = normalizeCustomFieldValue(field, value);

    if (normalized !== null) {
      custom[key] = normalized;
    }
  }

  return {
    core: input.core,
    custom,
  } satisfies LeadCreateInput;
}

function assertRequiredCustomFieldsPresent(
  input: LeadCreateInput,
  fields: ActiveRecordCustomField[],
) {
  const missing = fields
    .filter((field) => field.is_required)
    .filter((field) => {
      const value = input.custom[field.field_key];

      if (value === null || value === undefined) {
        return true;
      }

      if (typeof value === 'string') {
        return normalizeString(value).length === 0;
      }

      if (Array.isArray(value)) {
        return value.length === 0;
      }

      return false;
    });

  if (missing.length > 0) {
    throw new Error(`Missing required CRM fields for lead creation: ${missing.map((field) => field.label).join(', ')}.`);
  }
}

function mergeLeadCreateInputs(primary: LeadCreateInput | null, fallback: LeadCreateInput | null) {
  if (primary && fallback) {
    return {
      core: {
        ...fallback.core,
        ...primary.core,
      },
      custom: {
        ...fallback.custom,
        ...primary.custom,
      },
    } satisfies LeadCreateInput;
  }

  return primary ?? fallback;
}

function extractTranscriptSignals(
  messages: TranscriptMessage[],
  fields: ActiveRecordCustomField[],
): TranscriptSignals {
  const assistantTranscript = getJoinedTranscript(messages, 'assistant');
  const entireTranscript = getJoinedTranscript(messages);
  const recapMessage = [...getRoleMessages(messages, 'assistant')]
    .reverse()
    .find((message) => RECAP_LABEL_REGEX.test(message.content))
    ?.content ?? null;
  const inquiryText = recapMessage ? extractLabeledValue(recapMessage, 'Inquiry') : null;
  const propertyField = findFieldBySemantic(fields, 'property_type');
  const propertyOptions = propertyField ? getSelectOptions(propertyField) : [];
  const propertyCandidateText = [inquiryText, assistantTranscript, entireTranscript].filter(Boolean).join('\n');
  const propertyType = propertyOptions
    .map((option) => ({
      option,
      matched: new RegExp(`\\b${option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(propertyCandidateText),
    }))
    .find((entry) => entry.matched)?.option ??
    matchSelectOption(propertyField ?? {
      field_key: 'property_type',
      label: 'Property Type',
      field_type: 'select',
      is_required: false,
      options: ['Apartment', 'Villa', 'Plot', 'Commercial'],
    }, findLastUserResponse(messages, /type of house|property type|looking to buy|villa|apartment|plot|commercial|house|home|residential|land|office|shop/i, true));

  const locationFromInquiry = cleanupExtractedText(
    inquiryText?.match(/\bin\s+([A-Za-z][A-Za-z' -]{1,80}?)(?:\s+with\b|,|\.|$)/i)?.[1] ?? null,
  );
  const locationFromAssistantRecap = cleanupExtractedText(
    [...getRoleMessages(messages, 'assistant')]
      .reverse()
      .map((entry) => entry.content.match(/\b(?:looking for|interested in|in)\s+([A-Za-z][A-Za-z' -]{1,80}?)(?:\s+with\b|,|\.|$)/i)?.[1] ?? null)
      .find((entry) => Boolean(entry)) ?? null,
  );
  const preferredLocation = locationFromInquiry ??
    locationFromAssistantRecap ??
    findLastUserResponse(messages, /preferred location|share the preferred location|location/i);
  const budgetText = inquiryText?.match(/\bbudget(?: range)?(?: of)?\s+([^,.\n]+)/i)?.[1] ??
    findLastUserResponse(messages, /\bbudget/i, true);
  const financingText = inquiryText ??
    findLastUserResponse(messages, /\bfinanc/i, true);
  const cleanName = (value: string | null) => {
    if (!value) {
      return null;
    }

    const primary = value.split(RECAP_LABEL_SPLIT_REGEX, 1)[0] ?? value;
    return cleanupExtractedText(primary);
  };
  const financingRequired = financingText
    ? (/no financ/i.test(financingText.toLowerCase())
      ? false
      : /need financ|financing required|yes/i.test(financingText.toLowerCase())
        ? true
        : null)
    : null;

  return {
    fullName: cleanName(
      extractNameFromAssistantMessages(messages) ??
      findLastUserResponse(messages, /full name|spell your name/i),
    ),
    email: extractEmailFromMessages(messages) ??
      extractEmailFromText(findLastUserResponse(messages, /\bemail\b/i, true)),
    propertyType,
    preferredLocation: cleanupExtractedText(preferredLocation),
    budget: parseAmount(budgetText ?? null),
    financingRequired,
  };
}

async function listActiveRecordCustomFields(
  db: EdgeClient,
  workspaceId: string,
): Promise<ActiveRecordCustomField[]> {
  const { data, error } = await db
    .from('custom_field_definitions')
    .select('field_key, label, field_type, is_required, options')
    .eq('workspace_id', workspaceId)
    .eq('entity_type', 'record')
    .eq('is_active', true);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ActiveRecordCustomField[];
}

async function buildTranscriptLeadCreateInput(params: {
  db: EdgeClient;
  workspaceId: string;
  call: VoiceCallRow;
  fromNumberE164: string;
  sourceId: string | null;
  fields: ActiveRecordCustomField[];
}): Promise<LeadCreateInput | null> {
  const messages = toTranscriptMessages(params.call.message_history);

  if (messages.length === 0) {
    return null;
  }

  const signals = extractTranscriptSignals(messages, params.fields);
  const core: LeadCreateInput['core'] = {
    title: buildLeadTitle({
      fullName: signals.fullName,
      phoneNumberE164: params.fromNumberE164,
    }),
    phone: params.fromNumberE164,
    ...(signals.fullName ? { full_name: signals.fullName } : {}),
    ...(signals.email ? { email: signals.email } : {}),
    ...(params.sourceId ? { source_id: params.sourceId } : {}),
  };

  const custom: Record<string, unknown> = {};
  const propertyField = findFieldBySemantic(params.fields, 'property_type');
  const locationField = findFieldBySemantic(params.fields, 'preferred_location');
  const budgetField = findFieldBySemantic(params.fields, 'budget');
  const financingField = findFieldBySemantic(params.fields, 'financing_required');

  if (propertyField && signals.propertyType) {
    custom[propertyField.field_key] = signals.propertyType;
  }

  if (locationField && signals.preferredLocation) {
    custom[locationField.field_key] = signals.preferredLocation;
  }

  if (budgetField && signals.budget !== null) {
    custom[budgetField.field_key] = signals.budget;
  }

  if (financingField && signals.financingRequired !== null) {
    custom[financingField.field_key] = signals.financingRequired;
  }

  return {
    core,
    custom,
  };
}

export async function buildLeadCreateInputFromVoiceCall(params: {
  db: EdgeClient;
  workspaceId: string;
  call: VoiceCallRow;
}): Promise<LeadCreateInput> {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const fromNumberE164 = ensureNonEmpty(params.call.from_number_e164, 'from_number_e164');
  const gatherResult = toGatherObject(params.call.gather_result);
  const inboundSource = await ensureInboundCallSource(params.db, workspaceId);
  const snapshot = parseVoiceAgentCallSnapshot(params.call.assistant_mapping_snapshot);
  const activeFields = await listActiveRecordCustomFields(params.db, workspaceId);
  const fallbackSourceId = snapshot?.source_id ?? inboundSource.sourceId;
  const transcriptFallback = await buildTranscriptLeadCreateInput({
    db: params.db,
    workspaceId,
    call: params.call,
    fromNumberE164,
    sourceId: fallbackSourceId,
    fields: activeFields,
  });

  let mappedInput: LeadCreateInput | null = null;

  if (gatherResult && Object.keys(gatherResult).length > 0) {
    if (snapshot) {
      await revalidateVoiceAgentSnapshotTargets(params.db, workspaceId, snapshot.mappings);

      mappedInput = mapVoiceAgentGatherResultToLeadInput({
        fromNumberE164,
        gatherResult,
        snapshot,
        fallbackSourceId: inboundSource.sourceId,
      });
    } else {
      mappedInput = mapGatherResultToLeadInput({
        workspaceId,
        fromNumberE164,
        gatherResult,
        sourceId: fallbackSourceId,
      });
    }
  }

  const combined = mergeLeadCreateInputs(mappedInput, transcriptFallback);

  if (!combined) {
    if (params.call.assistant_mapping_snapshot !== null && !snapshot) {
      throw new Error('Voice assistant snapshot is missing or invalid for this call.');
    }

    throw new Error('This call does not have a usable gather result or transcript.');
  }

  const filtered = filterLeadCreateInputToActiveFields(combined, activeFields);
  assertRequiredCustomFieldsPresent(filtered, activeFields);
  return filtered;
}

export async function retryLeadCreationForVoiceCall(params: {
  db: EdgeClient;
  workspaceId: string;
  voiceCallId: string;
  actorUserId: string;
}): Promise<{
  call: VoiceCallRow;
  mappedInput: LeadCreateInput;
  created: CreateLeadFromVoiceCallResult;
}> {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const voiceCallId = ensureNonEmpty(params.voiceCallId, 'voiceCallId');
  const actorUserId = ensureNonEmpty(params.actorUserId, 'actorUserId');
  const call = await findVoiceCallById(params.db, workspaceId, voiceCallId);
  const mappedInput = await buildLeadCreateInputFromVoiceCall({
    db: params.db,
    workspaceId,
    call,
  });

  const created = await createLeadFromVoiceCall({
    db: params.db,
    workspaceId,
    actorUserId,
    mappedInput,
  });

  return {
    call,
    mappedInput,
    created,
  };
}
