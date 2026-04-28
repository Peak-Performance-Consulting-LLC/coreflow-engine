import { useMemo, useState } from 'react';
import type { VoiceOpsArtifactRecord, VoiceOpsCallRecord } from '../../lib/voice-ops-service';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type TimelineRole = 'caller' | 'assistant' | 'system';
type ActiveTab = 'timeline' | 'crm' | 'artifacts';

interface TimelineMessage {
  id: string;
  role: TimelineRole;
  roleLabel: string;
  content: string;
  timestamp: string | null;
  raw: unknown;
}

interface MappingBadge {
  id: string;
  label: string;
  target: string;
  required: boolean;
}

interface VoiceCallArtifactsPanelProps {
  call: VoiceOpsCallRecord;
  artifacts: VoiceOpsArtifactRecord[];
  creatingTaskArtifactId: string | null;
  onCreateTaskFromRecommendation: (artifactId: string) => Promise<void> | void;
}

function getArtifactLabel(type: VoiceOpsArtifactRecord['artifact_type']) {
  if (type === 'summary') return 'Summary';
  if (type === 'disposition') return 'Outcome';
  if (type === 'follow_up_recommendation') return 'Follow-up Recommendation';
  if (type === 'transcript') return 'Transcript';
  return type;
}

function renderArtifactBody(artifact: VoiceOpsArtifactRecord) {
  if (artifact.artifact_type === 'summary') {
    const highlights = Array.isArray(artifact.content_json?.highlights)
      ? artifact.content_json.highlights.filter(
          (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
        )
      : [];

    const summaryText = artifact.content_text?.trim();

    if (summaryText) {
      if (highlights.length === 0) return summaryText;
      return `${summaryText}\n\nHighlights:\n${highlights.map((highlight) => `- ${highlight}`).join('\n')}`;
    }
  }

  if (artifact.content_text) return artifact.content_text;

  if (artifact.content_json && Object.keys(artifact.content_json).length > 0) {
    return JSON.stringify(artifact.content_json, null, 2);
  }

  if (artifact.status === 'failed') return artifact.error_text ?? 'Artifact generation failed.';
  if (artifact.status === 'processing') return 'Generating artifact...';

  return 'Artifact not generated yet.';
}

function ArtifactContent({ children }: { children: string }) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-inner">
      <div className="max-h-64 overflow-auto p-4">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-100">
          {children}
        </pre>
      </div>
    </div>
  );
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
        raw: entry,
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
      raw: entry,
    };
  });
}

function extractMappedBadges(snapshot: VoiceOpsCallRecord['assistant_mapping_snapshot']): MappingBadge[] {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.mappings)) return [];

  return snapshot.mappings
    .map((mapping, index) => {
      if (!isRecord(mapping)) return null;

      const sourceLabel = normalizeString(mapping.source_label) || normalizeString(mapping.source_key);
      const targetKey = normalizeString(mapping.target_key);

      if (!sourceLabel || !targetKey) return null;

      return {
        id: normalizeString(mapping.source_key) || `map-${index}`,
        label: sourceLabel,
        target: targetKey,
        required: Boolean(mapping.is_required),
      };
    })
    .filter((entry): entry is MappingBadge => Boolean(entry));
}

function extractGatherFieldBadges(gatherResult: VoiceOpsCallRecord['gather_result']) {
  if (!isRecord(gatherResult)) {
    return [] as Array<{ key: string; value: string }>;
  }

  return Object.entries(gatherResult)
    .map(([key, value]) => {
      if (value === null || value === undefined) return null;

      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? { key, value: trimmed } : null;
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        return { key, value: String(value) };
      }

      if (Array.isArray(value)) {
        const compact = value
          .map((entry) => textFromUnknown(entry))
          .filter(Boolean)
          .join(', ')
          .trim();

        return compact ? { key, value: compact } : null;
      }

      return null;
    })
    .filter((entry): entry is { key: string; value: string } => Boolean(entry));
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

export function VoiceCallArtifactsPanel({
  call,
  artifacts,
  creatingTaskArtifactId,
  onCreateTaskFromRecommendation,
}: VoiceCallArtifactsPanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('timeline');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | TimelineRole>('all');

  const timelineMessages = useMemo(() => parseTimelineMessages(call.message_history), [call.message_history]);

  const mappedBadges = useMemo(
    () => extractMappedBadges(call.assistant_mapping_snapshot),
    [call.assistant_mapping_snapshot],
  );

  const gatherFieldBadges = useMemo(() => extractGatherFieldBadges(call.gather_result), [call.gather_result]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredMessages = useMemo(
    () =>
      timelineMessages.filter((message) => {
        if (roleFilter !== 'all' && message.role !== roleFilter) return false;
        if (!normalizedSearch) return true;

        return `${message.roleLabel} ${message.content}`.toLowerCase().includes(normalizedSearch);
      }),
    [timelineMessages, roleFilter, normalizedSearch],
  );

  const durationLabel = formatDuration(call.answered_at ?? call.created_at, call.ended_at);
  const crmCount = gatherFieldBadges.length + mappedBadges.length;

  return (
    <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accent-blue">
              Artifacts
            </div>
            <h3 className="mt-1 text-base font-semibold text-slate-950">Conversation workspace</h3>
            <p className="mt-1 text-sm text-slate-500">
              Review the call timeline, extracted CRM data, and generated artifacts.
            </p>
          </div>

          <div className="flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            {[
              { id: 'timeline', label: `Timeline ${timelineMessages.length ? `(${timelineMessages.length})` : ''}` },
              { id: 'crm', label: `CRM Data ${crmCount ? `(${crmCount})` : ''}` },
              { id: 'artifacts', label: `Artifacts (${artifacts.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as ActiveTab)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

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
        {activeTab === 'timeline' ? (
          <section className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search message history"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200/70"
              />

              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'caller', label: 'Caller' },
                  { id: 'assistant', label: 'Assistant' },
                  { id: 'system', label: 'System' },
                ].map((filterOption) => (
                  <Button
                    key={filterOption.id}
                    type="button"
                    size="sm"
                    variant={roleFilter === filterOption.id ? 'secondary' : 'ghost'}
                    onClick={() => setRoleFilter(filterOption.id as 'all' | TimelineRole)}
                  >
                    {filterOption.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="max-h-[min(58vh,620px)] overflow-y-auto rounded-3xl border border-slate-200 bg-slate-50/60 p-4">
              {filteredMessages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-600">
                  No message history available for this call yet.
                </div>
              ) : (
                <div className="relative space-y-4">
                  <div className="absolute bottom-4 left-4 top-4 hidden w-px bg-slate-200 md:block" />

                  {filteredMessages.map((message) => {
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

                            <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                              {message.content}
                            </div>

                            <details className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                Raw details
                              </summary>
                              <ArtifactContent>{JSON.stringify(message.raw, null, 2)}</ArtifactContent>
                            </details>
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
                            isCaller
                              ? 'border-emerald-200 bg-emerald-50/80'
                              : 'border-indigo-200 bg-indigo-50/80'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <MessageRoleTag role={message.role} label={message.roleLabel} />
                            {message.timestamp ? (
                              <div className="text-xs text-slate-500">{formatDateTime(message.timestamp)}</div>
                            ) : null}
                          </div>

                          <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                            {message.content}
                          </div>

                          <details className="mt-3 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2">
                            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Raw details
                            </summary>
                            <ArtifactContent>{JSON.stringify(message.raw, null, 2)}</ArtifactContent>
                          </details>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === 'crm' ? (
          <section className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
              <h4 className="text-sm font-semibold text-slate-950">Extracted CRM fields</h4>

              {gatherFieldBadges.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600">
                  No extracted CRM fields were captured for this call.
                </div>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {gatherFieldBadges.map((field) => (
                    <div key={field.key} className="rounded-2xl border border-emerald-100 bg-white p-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600">
                        {startCase(field.key)}
                      </div>
                      <div className="mt-1 break-words text-sm font-semibold text-slate-950">{field.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
              <h4 className="text-sm font-semibold text-slate-950">CRM mapping snapshot</h4>

              {mappedBadges.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600">
                  No CRM mapping snapshot is available for this call.
                </div>
              ) : (
                <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-3 border-b border-slate-100 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    <div>Source</div>
                    <div>CRM target</div>
                    <div>Required</div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {mappedBadges.map((mapping) => (
                      <div
                        key={mapping.id}
                        className="grid grid-cols-[1fr_1fr_auto] items-center gap-3 px-4 py-3 text-sm"
                      >
                        <div className="font-medium text-slate-900">{mapping.label}</div>
                        <div className="text-slate-600">{mapping.target}</div>
                        <div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              mapping.required
                                ? 'bg-indigo-50 text-indigo-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {mapping.required ? 'Yes' : 'No'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === 'artifacts' ? (
          <section className="max-h-[min(58vh,620px)] overflow-y-auto rounded-3xl border border-slate-200 bg-slate-50/60 p-4">
            {artifacts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-600">
                No generated artifacts are available for this call yet.
              </div>
            ) : (
              <div className="space-y-3">
                {artifacts.map((artifact) => (
                  <div key={artifact.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-950">{getArtifactLabel(artifact.artifact_type)}</div>
                        <div className="mt-0.5 text-xs uppercase tracking-[0.14em] text-slate-500">
                          {artifact.status}
                        </div>
                      </div>

                      {artifact.artifact_type === 'follow_up_recommendation' ? (
                        typeof artifact.content_json?.created_task_id === 'string' &&
                        artifact.content_json.created_task_id.trim() ? (
                          <Button type="button" size="sm" variant="secondary" disabled>
                            Task created
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            loading={creatingTaskArtifactId === artifact.id}
                            disabled={artifact.status !== 'ready' || !call.record_id}
                            onClick={() => void onCreateTaskFromRecommendation(artifact.id)}
                          >
                            Create task
                          </Button>
                        )
                      ) : null}
                    </div>

                    <ArtifactContent>{renderArtifactBody(artifact)}</ArtifactContent>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </Card>
  );
}