import { useMemo } from 'react';
import type { VoiceOpsCallRecord } from '../../lib/voice-ops-service';
import { Card } from '../ui/Card';

type TimelineRole = 'caller' | 'assistant' | 'system';

interface TimelineMessage {
  id: string;
  role: TimelineRole;
  roleLabel: string;
  content: string;
  timestamp: string | null;
}

interface VoiceCallArtifactsPanelProps {
  call: VoiceOpsCallRecord;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function startCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value: string | null) {
  if (!value) return null;

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(parsed));
}

function formatDuration(startValue: string | null, endValue: string | null) {
  if (!startValue || !endValue) return null;

  const startMs = Date.parse(startValue);
  const endMs = Date.parse(endValue);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }

  const totalSeconds = Math.floor((endMs - startMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function textFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    return value
      .map((entry) => textFromUnknown(entry))
      .filter((entry) => entry.length > 0)
      .join('\n')
      .trim();
  }

  if (!isRecord(value)) return '';

  const preferredKeys = ['content', 'text', 'message', 'utterance', 'transcript', 'response', 'output', 'value'];

  for (const key of preferredKeys) {
    if (!(key in value)) continue;

    const extracted = textFromUnknown(value[key]);
    if (extracted) return extracted;
  }

  return '';
}

function resolveMessageArray(rawHistory: VoiceOpsCallRecord['message_history']): unknown[] {
  if (Array.isArray(rawHistory)) return rawHistory;
  if (!isRecord(rawHistory)) return [];

  const candidateKeys = ['message_history', 'messages', 'history', 'items'];

  for (const key of candidateKeys) {
    const candidate = rawHistory[key];
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function resolveTimelineRole(roleValue: string) {
  const normalized = roleValue.toLowerCase();

  if (
    normalized.includes('assistant') ||
    normalized.includes('agent') ||
    normalized.includes('ai') ||
    normalized.includes('bot')
  ) {
    return 'assistant' as const;
  }

  if (
    normalized.includes('user') ||
    normalized.includes('caller') ||
    normalized.includes('customer') ||
    normalized.includes('human')
  ) {
    return 'caller' as const;
  }

  return 'system' as const;
}

function parseTimelineMessages(rawHistory: VoiceOpsCallRecord['message_history']): TimelineMessage[] {
  const entries = resolveMessageArray(rawHistory);

  return entries.map((entry, index) => {
    if (!isRecord(entry)) {
      return {
        id: `message-${index}`,
        role: 'system',
        roleLabel: 'System',
        content: textFromUnknown(entry) || 'System event',
        timestamp: null,
      };
    }

    const nestedMessage = isRecord(entry.message) ? entry.message : null;
    const roleRaw =
      normalizeString(entry.role) ||
      normalizeString(entry.speaker) ||
      normalizeString(entry.author) ||
      normalizeString(nestedMessage?.role) ||
      normalizeString(entry.type) ||
      normalizeString(entry.source);

    const role = resolveTimelineRole(roleRaw || 'system');
    const roleLabel =
      roleRaw ? startCase(roleRaw) : role === 'caller' ? 'Caller' : role === 'assistant' ? 'Assistant' : 'System';

    const content =
      textFromUnknown(entry.content) ||
      textFromUnknown(entry.text) ||
      textFromUnknown(nestedMessage?.content) ||
      textFromUnknown(nestedMessage?.text) ||
      textFromUnknown(entry.payload) ||
      (role === 'system' ? normalizeString(entry.event_type) : '') ||
      'No message text available.';

    const timestampRaw =
      normalizeString(entry.timestamp) ||
      normalizeString(entry.time) ||
      normalizeString(entry.created_at) ||
      normalizeString(entry.occurred_at) ||
      normalizeString(nestedMessage?.timestamp) ||
      normalizeString(nestedMessage?.created_at) ||
      null;

    const timestamp = timestampRaw && Number.isFinite(Date.parse(timestampRaw)) ? timestampRaw : null;

    return {
      id: normalizeString(entry.id) || `message-${index}`,
      role,
      roleLabel,
      content,
      timestamp,
    };
  });
}

function MessageRoleTag({ role, label }: { role: TimelineRole; label: string }) {
  const tone =
    role === 'caller'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : role === 'assistant'
        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
        : 'border-slate-200 bg-slate-100 text-slate-600';

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${tone}`}>
      {label}
    </span>
  );
}

function StatCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950">{value}</div>
      {subtext ? <div className="mt-0.5 text-xs text-slate-500">{subtext}</div> : null}
    </div>
  );
}

export function VoiceCallArtifactsPanel({ call }: VoiceCallArtifactsPanelProps) {
  const timelineMessages = useMemo(() => parseTimelineMessages(call.message_history), [call.message_history]);
  const durationLabel = formatDuration(call.answered_at ?? call.created_at, call.ended_at);

  return (
    <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accent-blue">Artifacts</div>
        <h3 className="mt-1 text-base font-semibold text-slate-950">Conversation timeline</h3>
        <p className="mt-1 text-sm text-slate-500">Review the call timeline and key session details.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Call status" value={call.status} />
          <StatCard label="Session status" value={call.gather_status} />
          <StatCard label="Duration" value={durationLabel ?? 'Not available'} />
          <StatCard
            label="Phone"
            value={call.from_number_e164}
            subtext={`To ${call.phone_number_e164_label ?? call.to_number_e164}`}
          />
        </div>
      </div>

      <div className="p-5">
        <div className="max-h-[min(58vh,620px)] overflow-y-auto rounded-3xl border border-slate-200 bg-slate-50/60 p-4">
          {timelineMessages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-600">
              No message history available for this call yet.
            </div>
          ) : (
            <div className="relative space-y-4">
              <div className="absolute bottom-4 left-4 top-4 hidden w-px bg-slate-200 md:block" />

              {timelineMessages.map((message) => {
                if (message.role === 'system') {
                  return (
                    <div key={message.id} className="relative md:pl-9">
                      <span className="absolute left-[11px] top-4 hidden h-3 w-3 rounded-full border-2 border-white bg-slate-400 shadow-sm md:block" />

                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <MessageRoleTag role={message.role} label={message.roleLabel} />
                          {message.timestamp ? (
                            <div className="text-xs text-slate-500">{formatDateTime(message.timestamp)}</div>
                          ) : null}
                        </div>

                        <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{message.content}</div>
                      </div>
                    </div>
                  );
                }

                const isCaller = message.role === 'caller';

                return (
                  <div
                    key={message.id}
                    className={`relative flex md:pl-9 ${isCaller ? 'justify-end' : 'justify-start'}`}
                  >
                    <span
                      className={`absolute left-[11px] top-4 hidden h-3 w-3 rounded-full border-2 border-white shadow-sm md:block ${
                        isCaller ? 'bg-emerald-400' : 'bg-indigo-400'
                      }`}
                    />

                    <div
                      className={`w-full max-w-[92%] rounded-3xl border px-4 py-3 shadow-sm sm:max-w-[82%] ${
                        isCaller ? 'border-emerald-200 bg-emerald-50/80' : 'border-indigo-200 bg-indigo-50/80'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <MessageRoleTag role={message.role} label={message.roleLabel} />
                        {message.timestamp ? (
                          <div className="text-xs text-slate-500">{formatDateTime(message.timestamp)}</div>
                        ) : null}
                      </div>

                      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{message.content}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
