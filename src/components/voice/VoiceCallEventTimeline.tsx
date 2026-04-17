import type { VoiceOpsEventRecord } from '../../lib/voice-ops-service';
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

interface VoiceCallEventTimelineProps {
  events: VoiceOpsEventRecord[];
}

export function VoiceCallEventTimeline({ events }: VoiceCallEventTimelineProps) {
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-[0.28em] text-accent-blue">Webhook events</div>
      <div className="mt-4 space-y-3">
        {events.length === 0 ? (
          <div className="text-sm text-slate-600">No event history is available for this call yet.</div>
        ) : events.map((event) => (
          <div key={event.id} className="rounded-3xl border border-slate-300 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-slate-900">{event.event_type}</div>
              <div className="text-xs text-slate-500">{formatDateTime(event.occurred_at)}</div>
            </div>
            <div className="mt-2 text-xs text-slate-600">
              Processing: {event.processing_status}
              {event.processing_error ? ` • ${event.processing_error}` : ''}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
