import type { VoiceOpsArtifactRecord, VoiceOpsCallRecord } from '../../lib/voice-ops-service';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

function getArtifactLabel(type: VoiceOpsArtifactRecord['artifact_type']) {
  if (type === 'summary') {
    return 'Summary';
  }

  if (type === 'disposition') {
    return 'Outcome';
  }

  if (type === 'follow_up_recommendation') {
    return 'Follow-up Recommendation';
  }

  if (type === 'transcript') {
    return 'Transcript';
  }

  return type;
}

function renderArtifactBody(artifact: VoiceOpsArtifactRecord) {
  if (artifact.artifact_type === 'summary') {
    const highlights = Array.isArray(artifact.content_json?.highlights)
      ? artifact.content_json.highlights.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [];
    const summaryText = artifact.content_text?.trim();

    if (summaryText) {
      if (highlights.length === 0) {
        return summaryText;
      }

      return `${summaryText}\n\nHighlights:\n${highlights.map((highlight) => `- ${highlight}`).join('\n')}`;
    }
  }

  if (artifact.content_text) {
    return artifact.content_text;
  }

  if (artifact.content_json && Object.keys(artifact.content_json).length > 0) {
    return JSON.stringify(artifact.content_json, null, 2);
  }

  if (artifact.status === 'failed') {
    return artifact.error_text ?? 'Artifact generation failed.';
  }

  return 'Artifact not generated yet.';
}

interface VoiceCallArtifactsPanelProps {
  call: VoiceOpsCallRecord;
  artifacts: VoiceOpsArtifactRecord[];
  creatingTaskArtifactId: string | null;
  onCreateTaskFromRecommendation: (artifactId: string) => Promise<void> | void;
}

export function VoiceCallArtifactsPanel({
  call,
  artifacts,
  creatingTaskArtifactId,
  onCreateTaskFromRecommendation,
}: VoiceCallArtifactsPanelProps) {
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-[0.28em] text-accent-blue">Artifacts</div>
      <div className="mt-4 space-y-4">
        {artifacts.length === 0 ? (
          <div className="rounded-3xl border border-slate-300 bg-white p-4">
            <div className="text-sm text-slate-700">Raw message history</div>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-slate-600">
              {call.message_history ? JSON.stringify(call.message_history, null, 2) : 'No message history stored.'}
            </pre>
          </div>
        ) : artifacts.map((artifact) => (
          <div key={artifact.id} className="rounded-3xl border border-slate-300 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-slate-900">{getArtifactLabel(artifact.artifact_type)}</div>
              <div className="text-xs text-slate-500">{artifact.status}</div>
            </div>
            {artifact.artifact_type === 'follow_up_recommendation' ? (
              <div className="mt-3">
                {typeof artifact.content_json?.created_task_id === 'string' && artifact.content_json.created_task_id.trim() ? (
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
                )}
              </div>
            ) : null}
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-slate-600">
              {renderArtifactBody(artifact)}
            </pre>
          </div>
        ))}
      </div>
    </Card>
  );
}
