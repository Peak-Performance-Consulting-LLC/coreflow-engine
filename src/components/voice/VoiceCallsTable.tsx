import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { VoiceOpsCallRecord } from '../../lib/voice-ops-service';
import { Card } from '../ui/Card';

function formatDateTime(value: string | null) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function badgeClass(value: string | null) {
  if (value === 'lead_created') {
    return 'border-[#cde7d1] bg-[#edf9ee] text-[#4a9c5b]';
  }

  if (value === 'resolved') {
    return 'border-[#d6deec] bg-[#f4f6fb] text-[#6e778f]';
  }

  if (value === 'open' || value === 'review_needed' || value === 'gather_incomplete') {
    return 'border-[#f5dfb7] bg-[#fff8ea] text-[#b0792a]';
  }

  if (value === 'crm_failed' || value === 'mapping_failed' || value === 'ended_without_lead' || value === 'failed') {
    return 'border-[#f1c7cc] bg-[#fff2f3] text-[#b9505f]';
  }

  return 'border-[#d6deec] bg-[#f4f6fb] text-[#6e778f]';
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
  total,
  hasNextPage,
  hasPrevPage,
  onSelect,
  onPageChange,
}: VoiceCallsTableProps) {
  return (
    <Card className="overflow-hidden border border-[#d9deea] bg-white p-0 shadow-[0_8px_20px_-16px_rgba(34,45,74,0.2)]">
      <div className="border-b border-[#e4e8f1] px-5 py-4">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#000511]">Voice queue</div>
        <div className="mt-1 text-xs text-[#32353d]">Every inbound call is visible here, whether it created a lead or needs review.</div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-100 text-[#00030a]">
            <tr>
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em]">Caller</th>
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em]">Number</th>
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em]">Assistant</th>
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em]">Outcome</th>
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em]">Review</th>
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em]">Gather</th>
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em]">Created</th>
            </tr>
          </thead>
          <tbody>
            {calls.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-[#6f778d]">
                  {loading ? 'Loading calls...' : 'No voice calls match these filters yet.'}
                </td>
              </tr>
            ) : (
              calls.map((call) => (
                <tr
                  key={call.id}
                  onClick={() => onSelect(call.id)}
                  className={`cursor-pointer border-t border-[#eceff6] transition hover:bg-[#f7f8fc] ${
                    selectedCallId === call.id ? 'bg-[#f7f8fc]' : ''
                  }`}
                >
                  <td className="px-5 py-4 align-top">
                    <div className="font-semibold text-[#2f3a54]">{call.from_number_e164}</div>
                  </td>
                  <td className="px-5 py-4 align-top text-[#5f6780]">{call.phone_number_e164_label ?? call.to_number_e164}</td>
                  <td className="px-5 py-4 align-top text-[#5f6780]">{call.voice_agent_name ?? 'Phase 1 flow'}</td>
                  <td className="px-5 py-4 align-top">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badgeClass(call.outcome_status)}`}>
                      {call.outcome_status ?? 'pending'}
                    </span>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badgeClass(call.review_status)}`}>
                      {call.review_status}
                    </span>
                  </td>
                  <td className="px-5 py-4 align-top text-[#6f778d]">{call.gather_status}</td>
                  <td className="px-5 py-4 align-top text-[#5f6780]">{formatDateTime(call.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-[#e4e8f1] px-5 py-3 text-xs text-[#6f778d]">
        <div>Showing {calls.length} of {total} inbound calls</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={!hasPrevPage || loading}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#7a8297] transition hover:bg-[#f1f3f8] disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-[#eef1f7] px-2 text-[11px] font-semibold text-[#5f6780]">
            {page}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNextPage || loading}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#7a8297] transition hover:bg-[#f1f3f8] disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}
