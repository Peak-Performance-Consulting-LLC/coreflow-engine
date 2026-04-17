import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceOwner, type EdgeClient } from '../_shared/server.ts';
import {
  reconcileManagedPhoneNumber,
  resolveManagedVoiceConnectionId,
} from '../_shared/telnyx-numbers.ts';
import {
  claimWorkspacePhoneNumberProvisioning,
  findWorkspacePhoneNumberById,
  isWorkspacePhoneNumberRoutable,
  releaseWorkspacePhoneNumberProvisioning,
  saveWorkspacePhoneNumber,
  toWorkspacePhoneNumberView,
  type WorkspacePhoneNumberRow,
} from '../_shared/voice-repository.ts';

function buildCustomerReference(workspaceId: string) {
  return `coreflow:workspace:${workspaceId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeTelnyxMetadata(
  current: WorkspacePhoneNumberRow,
  patch: Record<string, unknown>,
) {
  const base = isRecord(current.telnyx_metadata) ? current.telnyx_metadata : {};
  return {
    ...base,
    ...patch,
  };
}

function resolvePersistedActiveState(current: WorkspacePhoneNumberRow, providerSuggestedActive: boolean) {
  const wasManuallyPaused = current.provisioning_status === 'active' && current.webhook_status === 'ready' && !current.is_active;
  return wasManuallyPaused ? false : providerSuggestedActive;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let workspaceId = '';
  let claimedNumber: WorkspacePhoneNumberRow | null = null;
  let serviceClient: EdgeClient | null = null;

  try {
    const authContext = await authenticateRequest(request);

    if (authContext instanceof Response) {
      return authContext;
    }

    serviceClient = authContext.serviceClient;

    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    workspaceId = typeof payload.workspace_id === 'string' ? payload.workspace_id : '';
    const voiceNumberId = typeof payload.voice_number_id === 'string' ? payload.voice_number_id : '';

    if (!workspaceId || !voiceNumberId) {
      return jsonResponse({ error: 'workspace_id and voice_number_id are required.' }, 400);
    }

    await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);
    const current = await findWorkspacePhoneNumberById(authContext.serviceClient, workspaceId, voiceNumberId);

    if (current.provisioning_status === 'released') {
      return jsonResponse({
        number: toWorkspacePhoneNumberView(current),
        webhookReady: false,
      });
    }

    const claim = await claimWorkspacePhoneNumberProvisioning(authContext.serviceClient, {
      workspaceId,
      voiceNumberId: current.id,
    });

    if (!claim.claimed) {
      return jsonResponse(
        {
          number: toWorkspacePhoneNumberView(claim.number),
          webhookReady: isWorkspacePhoneNumberRoutable(claim.number),
          provisioningInProgress: true,
        },
        202,
      );
    }

    claimedNumber = claim.number;
    const reconciled = await reconcileManagedPhoneNumber({
      phoneNumber: claimedNumber.phone_number_e164,
      connectionId: resolveManagedVoiceConnectionId(),
      customerReference: buildCustomerReference(workspaceId),
      orderId: claimedNumber.provider_order_id,
    });
    const hasProviderArtifacts = Boolean(
      claimedNumber.provider_order_id ||
      claimedNumber.provider_phone_number_id ||
      reconciled.order?.id ||
      reconciled.phoneNumber?.id
    );

    const number = await saveWorkspacePhoneNumber(authContext.serviceClient, {
      workspaceId,
      phoneNumberE164: claimedNumber.phone_number_e164,
      label: claimedNumber.label,
      voiceMode: claimedNumber.voice_mode,
      providerPhoneNumberId: reconciled.phoneNumber?.id ?? claimedNumber.provider_phone_number_id,
      providerOrderId: reconciled.order?.id ?? claimedNumber.provider_order_id,
      provisioningStatus: hasProviderArtifacts ? reconciled.provisioningStatus : 'pending',
      webhookStatus: hasProviderArtifacts ? reconciled.webhookStatus : 'pending',
      lastProvisioningError: hasProviderArtifacts
        ? reconciled.statusMessage
        : 'Provider ownership is not confirmed yet. Try refreshing again shortly.',
      telnyxConnectionId: reconciled.connectionId ?? claimedNumber.telnyx_connection_id,
      telnyxMetadata: mergeTelnyxMetadata(claimedNumber, {
        order: reconciled.order?.raw ?? null,
        phone_number: reconciled.phoneNumber?.raw ?? null,
        last_reconcile_source: 'manual_reconcile',
      }),
      isActive: resolvePersistedActiveState(claimedNumber, reconciled.isActive),
      purchasedAt: reconciled.phoneNumber?.purchasedAt ?? claimedNumber.purchased_at,
      provisioningLockedAt: null,
    });
    claimedNumber = number;

    return jsonResponse({
      number: toWorkspacePhoneNumberView(number),
      webhookReady: reconciled.webhookReady,
      reconciled: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  } finally {
    if (serviceClient && claimedNumber && workspaceId) {
      try {
        await releaseWorkspacePhoneNumberProvisioning(serviceClient, workspaceId, claimedNumber.id);
      } catch {
        // Best effort lock cleanup; stale-lock claiming handles crash recovery.
      }
    }
  }
});
