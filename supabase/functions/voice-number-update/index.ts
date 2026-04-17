import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceOwner } from '../_shared/server.ts';
import {
  findWorkspacePhoneNumberById,
  toWorkspacePhoneNumberView,
  updateWorkspacePhoneNumber,
} from '../_shared/voice-repository.ts';

function getOptionalLabel(payload: Record<string, unknown>) {
  if (!Object.hasOwn(payload, 'label')) {
    return undefined;
  }

  return typeof payload.label === 'string' ? payload.label.trim() : null;
}

function getOptionalVoiceMode(payload: Record<string, unknown>) {
  if (!Object.hasOwn(payload, 'voice_mode')) {
    return undefined;
  }

  if (payload.voice_mode === null || payload.voice_mode === '') {
    return 'ai_lead_capture';
  }

  if (typeof payload.voice_mode !== 'string' || payload.voice_mode.trim() !== 'ai_lead_capture') {
    throw new Error('voice_mode must be "ai_lead_capture" in phase 1.');
  }

  return 'ai_lead_capture';
}

function getOptionalIsActive(payload: Record<string, unknown>) {
  if (!Object.hasOwn(payload, 'is_active')) {
    return undefined;
  }

  if (typeof payload.is_active !== 'boolean') {
    throw new Error('is_active must be a boolean.');
  }

  return payload.is_active;
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
    const workspaceId = typeof payload.workspace_id === 'string' ? payload.workspace_id : '';
    const voiceNumberId = typeof payload.voice_number_id === 'string' ? payload.voice_number_id : '';
    const label = getOptionalLabel(payload);
    const isActive = getOptionalIsActive(payload);
    const voiceMode = getOptionalVoiceMode(payload);

    if (!workspaceId || !voiceNumberId) {
      return jsonResponse({ error: 'workspace_id and voice_number_id are required.' }, 400);
    }

    await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);
    const current = await findWorkspacePhoneNumberById(authContext.serviceClient, workspaceId, voiceNumberId);

    if (current.provisioning_status === 'released' && isActive) {
      return jsonResponse({ error: 'Released numbers cannot be re-activated.' }, 400);
    }

    if (isActive === true && (current.provisioning_status !== 'active' || current.webhook_status !== 'ready')) {
      return jsonResponse(
        { error: 'Only webhook-ready numbers can be activated for inbound routing.' },
        400,
      );
    }

    const number = await updateWorkspacePhoneNumber(authContext.serviceClient, {
      workspaceId,
      voiceNumberId,
      label,
      isActive,
      voiceMode,
      lastProvisioningError: current.last_provisioning_error,
    });

    return jsonResponse({ number: toWorkspacePhoneNumberView(number) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
