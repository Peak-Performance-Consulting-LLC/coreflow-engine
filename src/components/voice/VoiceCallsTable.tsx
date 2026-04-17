import type { VoiceOpsCallRecord } from '../../lib/voice-ops-service';
import { Card } from '../ui/Card';

function formatDateTime(value: string | null) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function badgeClass(value: string | null) {
  if (value === 'lead_created' || value === 'resolved') {
    return 'border-indigo-300 bg-[#EEF2FF] text-slate-700';
  }

  if (value === 'open' || value === 'review_needed' || value === 'gather_incomplete') {
    return 'border-indigo-200 bg-[#EEF2FF] text-slate-700';
  }

  if (value === 'crm_failed' || value === 'mapping_failed' || value === 'ended_without_lead' || value === 'failed') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  return 'border-slate-300 bg-slate-50 text-slate-700';
}

interface VoiceCallsTableProps {
  calls: VoiceOpsCallRecord[];
  loading: boolean;
  selectedCallId: string | null;
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onSelect: (voiceCallId: string) => void;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
}

export function VoiceCallsTable({
  calls,
  loading,
  selectedCallId,
  page,
  pageSize,
  total,
  hasNextPage,
  hasPrevPage,
  onSelect,
  onPageChange,
  onPageSizeChange,
}: VoiceCallsTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(total, page * pageSize);

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-300 px-5 py-4">
        <div className="text-xs uppercase tracking-[0.28em] text-accent-blue">Voice queue</div>
        <div className="mt-2 text-sm text-slate-700">Every inbound call is visible here, whether it created a lead or needs review.</div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[14px]">
          <thead className="bg-white text-slate-700">
            <tr>
              <th className="px-5 py-3 font-semibold">Caller</th>
              <th className="px-5 py-3 font-semibold">Number</th>
              <th className="px-5 py-3 font-semibold">Assistant</th>
              <th className="px-5 py-3 font-semibold">Outcome</th>
              <th className="px-5 py-3 font-semibold">Review</th>
              <th className="px-5 py-3 font-semibold">Gather</th>
              <th className="px-5 py-3 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody>
            {calls.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-slate-600">
                  {loading ? 'Loading calls...' : 'No voice calls match these filters yet.'}
                </td>
              </tr>
            ) : calls.map((call) => (
              <tr
                key={call.id}
                onClick={() => onSelect(call.id)}
                className={`cursor-pointer border-t border-slate-300 transition hover:bg-white ${
                  selectedCallId === call.id ? 'bg-white' : ''
                }`}
              >
                <td className="px-5 py-4 align-top">
                  <div className="font-medium text-slate-900">{call.from_number_e164}</div>
                </td>
                <td className="px-5 py-4 align-top text-slate-700">{call.phone_number_e164_label ?? call.to_number_e164}</td>
                <td className="px-5 py-4 align-top text-slate-700">{call.voice_agent_name ?? 'Phase 1 flow'}</td>
                <td className="px-5 py-4 align-top">
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${badgeClass(call.outcome_status)}`}>
                    {call.outcome_status ?? 'pending'}
                  </span>
                </td>
                <td className="px-5 py-4 align-top">
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${badgeClass(call.review_status)}`}>
                    {call.review_status}
                  </span>
                </td>
                <td className="px-5 py-4 align-top text-slate-700">{call.gather_status}</td>
                <td className="px-5 py-4 align-top text-slate-600">{formatDateTime(call.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-300 px-5 py-4 text-sm text-slate-700 md:flex-row md:items-center md:justify-between">
        <div>
          Showing {start}-{end} of {total} calls
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-slate-600">Rows</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value) || 25)}
              className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-slate-900 outline-none"
              disabled={loading}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <div className="text-slate-600">Page {page} of {totalPages}</div>
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={!hasPrevPage || loading}
            className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNextPage || loading}
            className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </Card>
  );
}
