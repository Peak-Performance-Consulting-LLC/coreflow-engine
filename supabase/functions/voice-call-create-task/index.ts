import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createTaskForRecord } from '../_shared/records.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';
import {
  findVoiceCallById,
  listVoiceCallArtifactsByVoiceCallId,
  saveVoiceCallArtifact,
} from '../_shared/voice-repository.ts';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRecommendationText(artifact: {
  content_text: string | null;
  content_json: unknown;
}) {
  const contentText = normalizeString(artifact.content_text);

  if (contentText.length > 0) {
    return contentText;
  }

  if (isRecord(artifact.content_json)) {
    const fromJson = normalizeString(artifact.content_json.follow_up_recommendation);

    if (fromJson.length > 0) {
      return fromJson;
    }
  }

  return '';
}

function buildTaskTitle(recommendation: string) {
  const compact = recommendation.replace(/\s+/g, ' ').trim();

  if (compact.length <= 110) {
    return compact;
  }

  return `${compact.slice(0, 107)}...`;
}

function nowIso() {
  return new Date().toISOString();
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authContext = await authenticateRequest(request);

    if (authContext instanceof Response) {
      return authContext;
    }

    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const workspaceId = normalizeString(payload.workspace_id);
    const voiceCallId = normalizeString(payload.voice_call_id);
    const artifactId = normalizeString(payload.artifact_id);

    if (!workspaceId || !voiceCallId || !artifactId) {
      return jsonResponse({ error: 'workspace_id, voice_call_id, and artifact_id are required.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);
    const call = await findVoiceCallById(authContext.serviceClient, workspaceId, voiceCallId);

    if (!call.record_id) {
      return jsonResponse({ error: 'This call is not linked to a CRM record yet.' }, 400);
    }

    const artifacts = await listVoiceCallArtifactsByVoiceCallId(authContext.serviceClient, workspaceId, voiceCallId);
    const artifact = artifacts.find((entry) => entry.id === artifactId);

    if (!artifact) {
      return jsonResponse({ error: 'Artifact not found for this call.' }, 404);
    }

    if (artifact.artifact_type !== 'follow_up_recommendation') {
      return jsonResponse({ error: 'Only follow-up recommendation artifacts can create tasks.' }, 400);
    }

    if (artifact.status !== 'ready') {
      return jsonResponse({ error: 'Recommendation is not ready yet.' }, 400);
    }

    const existingTaskId = isRecord(artifact.content_json)
      ? normalizeString(artifact.content_json.created_task_id)
      : '';

    if (existingTaskId) {
      return jsonResponse(
        { error: 'A task was already created from this recommendation.', task_id: existingTaskId, duplicate: true },
        409,
      );
    }

    const recommendation = getRecommendationText(artifact);

    if (recommendation.length < 2) {
      return jsonResponse({ error: 'Recommendation text is missing.' }, 400);
    }

    const taskTitle = buildTaskTitle(recommendation);
    const taskDescription = [
      recommendation,
      '',
      `Source: Voice call ${voiceCallId}`,
      `Generated from artifact ${artifact.id}`,
    ].join('\n');

    const task = await createTaskForRecord(authContext.serviceClient, authContext.user.id, workspaceId, call.record_id, {
      title: taskTitle,
      description: taskDescription,
      priority: 'medium',
    });

    const nextContentJson = isRecord(artifact.content_json)
      ? { ...artifact.content_json }
      : {};

    nextContentJson.created_task_id = task.id;
    nextContentJson.created_task_at = nowIso();

    await saveVoiceCallArtifact(authContext.serviceClient, {
      workspaceId,
      voiceCallId,
      artifactType: 'follow_up_recommendation',
      status: 'ready',
      source: artifact.source,
      contentText: artifact.content_text,
      contentJson: nextContentJson,
      model: artifact.model,
      errorText: null,
      generatedAt: artifact.generated_at,
    });

    return jsonResponse({ task }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
