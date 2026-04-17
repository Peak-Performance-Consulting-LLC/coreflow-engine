import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceOwner, type EdgeClient } from '../_shared/server.ts';
import {
  TelnyxNumberProvisioningError,
  findAvailableUsPhoneNumber,
  normalizePhase1UsPhoneNumber,
  purchaseManagedPhoneNumber,
  reconcileManagedPhoneNumber,
  resolveManagedVoiceConnectionId,
} from '../_shared/telnyx-numbers.ts';
import {
  claimWorkspacePhoneNumberProvisioning,
  findWorkspacePhoneNumberByE164AnyStatus,
  isWorkspacePhoneNumberRoutable,
  releaseWorkspacePhoneNumberProvisioning,
  saveWorkspacePhoneNumber,
  toWorkspacePhoneNumberView,
  type WorkspacePhoneNumberRow,
} from '../_shared/voice-repository.ts';

function normalizeLabel(value: unknown) {
  return typeof value === 'string' ? value.trim() : null;
}

function normalizeVoiceMode(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return 'ai_lead_capture';
  }

  if (typeof value !== 'string' || value.trim() !== 'ai_lead_capture') {
    throw new Error('voice_mode must be "ai_lead_capture" in phase 1.');
  }

  return 'ai_lead_capture';
}

function buildCustomerReference(workspaceId: string) {
  return `coreflow:workspace:${workspaceId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeTelnyxMetadata(
  current: WorkspacePhoneNumberRow | null,
  patch: Record<string, unknown>,
) {
  const base = isRecord(current?.telnyx_metadata) ? current.telnyx_metadata : {};
  return {
    ...base,
    ...patch,
  };
}

function resolvePersistedActiveState(current: WorkspacePhoneNumberRow | null, providerSuggestedActive: boolean) {
  const wasManuallyPaused = Boolean(
    current &&
    current.provisioning_status === 'active' &&
    current.webhook_status === 'ready' &&
    !current.is_active
  );

  return wasManuallyPaused ? false : providerSuggestedActive;
}

async function persistProvisionedNumber(
  db: EdgeClient,
  params: {
    current: WorkspacePhoneNumberRow | null;
    workspaceId: string;
    phoneNumber: string;
    label: string | null;
    voiceMode: string;
    provisioningStatus: 'pending' | 'active' | 'failed';
    webhookStatus: 'pending' | 'ready' | 'failed';
    lastProvisioningError: string | null;
    providerPhoneNumberId?: string | null;
    providerOrderId?: string | null;
    telnyxConnectionId?: string | null;
    telnyxMetadataPatch: Record<string, unknown>;
    providerSuggestedActive: boolean;
    purchasedAt?: string | null;
  },
) {
  return saveWorkspacePhoneNumber(db, {
    workspaceId: params.workspaceId,
    phoneNumberE164: params.phoneNumber,
    label: params.label ?? params.current?.label ?? null,
    voiceMode: params.voiceMode,
    providerPhoneNumberId: params.providerPhoneNumberId ?? params.current?.provider_phone_number_id ?? null,
    providerOrderId: params.providerOrderId ?? params.current?.provider_order_id ?? null,
    provisioningStatus: params.provisioningStatus,
    webhookStatus: params.webhookStatus,
    lastProvisioningError: params.lastProvisioningError,
    telnyxConnectionId: params.telnyxConnectionId ?? params.current?.telnyx_connection_id ?? null,
    telnyxMetadata: mergeTelnyxMetadata(params.current, params.telnyxMetadataPatch),
    isActive: resolvePersistedActiveState(params.current, params.providerSuggestedActive),
    purchasedAt: params.purchasedAt ?? params.current?.purchased_at ?? null,
    provisioningLockedAt: null,
  });
}

function normalizeProvisioningFailureStatus(orderStatus: string | null | undefined) {
  const normalizedStatus = (orderStatus ?? '').trim().toLowerCase();

  if (['failed', 'failure', 'error', 'errored', 'canceled', 'cancelled'].includes(normalizedStatus)) {
    return {
      provisioningStatus: 'failed' as const,
      webhookStatus: 'failed' as const,
    };
  }

  return {
    provisioningStatus: 'pending' as const,
    webhookStatus: 'pending' as const,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let serviceClient: EdgeClient | null = null;
  let workspaceId = '';
  let label: string | null = null;
  let voiceMode = 'ai_lead_capture';
  let phoneNumber = '';
  let claimedNumber: WorkspacePhoneNumberRow | null = null;

  try {
    const authContext = await authenticateRequest(request);

    if (authContext instanceof Response) {
      return authContext;
    }

    serviceClient = authContext.serviceClient;
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    workspaceId = typeof payload.workspace_id === 'string' ? payload.workspace_id : '';
    label = normalizeLabel(payload.label);
    voiceMode = normalizeVoiceMode(payload.voice_mode);

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    phoneNumber = normalizePhase1UsPhoneNumber(payload.phone_number, 'phone_number');
    await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);

    const connectionId = resolveManagedVoiceConnectionId();
    const customerReference = buildCustomerReference(workspaceId);
    let existing = await findWorkspacePhoneNumberByE164AnyStatus(authContext.serviceClient, phoneNumber);

    if (existing && existing.workspace_id !== workspaceId) {
      return jsonResponse({ error: 'This phone number is already assigned to another workspace.' }, 409);
    }

    if (!existing) {
      const purchasableNumber = await findAvailableUsPhoneNumber({ phoneNumber });

      if (!purchasableNumber) {
        return jsonResponse(
          { error: 'This number is not currently available for US voice provisioning.' },
          400,
        );
      }

      existing = await saveWorkspacePhoneNumber(authContext.serviceClient, {
        workspaceId,
        phoneNumberE164: phoneNumber,
        label,
        voiceMode,
        provisioningStatus: 'pending',
        webhookStatus: 'pending',
        lastProvisioningError: null,
        telnyxConnectionId: connectionId,
        telnyxMetadata: {
          searched_number: purchasableNumber.phoneNumber,
        },
        isActive: false,
        provisioningLockedAt: null,
      });
    }

    const claim = await claimWorkspacePhoneNumberProvisioning(authContext.serviceClient, {
      workspaceId,
      voiceNumberId: existing.id,
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
      phoneNumber,
      connectionId,
      customerReference,
      orderId: claimedNumber.provider_order_id,
    });
    const hasProviderArtifacts = Boolean(
      claimedNumber.provider_order_id ||
      claimedNumber.provider_phone_number_id ||
      reconciled.order?.id ||
      reconciled.phoneNumber?.id
    );

    if (hasProviderArtifacts) {
      const number = await persistProvisionedNumber(authContext.serviceClient, {
        current: claimedNumber,
        workspaceId,
        phoneNumber,
        label,
        voiceMode,
        providerPhoneNumberId: reconciled.phoneNumber?.id ?? claimedNumber.provider_phone_number_id,
        providerOrderId: reconciled.order?.id ?? claimedNumber.provider_order_id,
        provisioningStatus: reconciled.provisioningStatus,
        webhookStatus: reconciled.webhookStatus,
        lastProvisioningError: reconciled.statusMessage,
        telnyxConnectionId: reconciled.connectionId ?? claimedNumber.telnyx_connection_id,
        telnyxMetadataPatch: {
          order: reconciled.order?.raw ?? null,
          phone_number: reconciled.phoneNumber?.raw ?? null,
          last_reconcile_source: 'purchase',
        },
        providerSuggestedActive: reconciled.isActive,
        purchasedAt: reconciled.phoneNumber?.purchasedAt ?? claimedNumber.purchased_at,
      });

      claimedNumber = number;
      return jsonResponse({
        number: toWorkspacePhoneNumberView(number),
        webhookReady: reconciled.webhookReady,
      });
    }

    const purchasableNumber = await findAvailableUsPhoneNumber({ phoneNumber });

    if (!purchasableNumber) {
      const number = await persistProvisionedNumber(authContext.serviceClient, {
        current: claimedNumber,
        workspaceId,
        phoneNumber,
        label,
        voiceMode,
        provisioningStatus: 'pending',
        webhookStatus: 'pending',
        lastProvisioningError:
          'Provider ownership could not be confirmed yet and the number is no longer listed as available. Retry reconciliation shortly.',
        telnyxConnectionId: connectionId,
        telnyxMetadataPatch: {
          last_reconcile_source: 'purchase',
          availability_confirmed: false,
        },
        providerSuggestedActive: false,
        purchasedAt: claimedNumber.purchased_at,
      });

      claimedNumber = number;
      return jsonResponse(
        {
          number: toWorkspacePhoneNumberView(number),
          webhookReady: false,
        },
        202,
      );
    }

    const provisioned = await purchaseManagedPhoneNumber({
      phoneNumber,
      connectionId,
      customerReference,
    });

    const number = await persistProvisionedNumber(authContext.serviceClient, {
      current: claimedNumber,
      workspaceId,
      phoneNumber,
      label,
      voiceMode,
      providerPhoneNumberId: provisioned.phoneNumber?.id ?? null,
      providerOrderId: provisioned.order?.id ?? null,
      provisioningStatus: provisioned.provisioningStatus,
      webhookStatus: provisioned.webhookStatus,
      lastProvisioningError: provisioned.statusMessage,
      telnyxConnectionId: provisioned.connectionId,
      telnyxMetadataPatch: {
        order: provisioned.order?.raw ?? null,
        phone_number: provisioned.phoneNumber?.raw ?? null,
        searched_number: purchasableNumber.phoneNumber,
        last_reconcile_source: 'purchase',
        availability_confirmed: true,
      },
      providerSuggestedActive: provisioned.isActive,
      purchasedAt: provisioned.phoneNumber?.purchasedAt ?? new Date().toISOString(),
    });
    claimedNumber = number;

    return jsonResponse(
      {
        number: toWorkspacePhoneNumberView(number),
        webhookReady: provisioned.webhookReady,
      },
      201,
    );
  } catch (error) {
    if (error instanceof TelnyxNumberProvisioningError) {
      if (serviceClient && workspaceId && phoneNumber && claimedNumber) {
        const failureState = normalizeProvisioningFailureStatus(error.order?.status);
        const number = await persistProvisionedNumber(serviceClient, {
          current: claimedNumber,
          workspaceId,
          phoneNumber,
          label,
          voiceMode,
          providerPhoneNumberId: error.phoneNumber?.id ?? claimedNumber.provider_phone_number_id,
          providerOrderId: error.order?.id ?? claimedNumber.provider_order_id,
          provisioningStatus: failureState.provisioningStatus,
          webhookStatus: failureState.webhookStatus,
          lastProvisioningError: error.message,
          telnyxConnectionId: resolveManagedVoiceConnectionId() ?? claimedNumber.telnyx_connection_id,
          telnyxMetadataPatch: {
            order: error.order?.raw ?? null,
            phone_number: error.phoneNumber?.raw ?? null,
            last_reconcile_source: 'purchase_error',
          },
          providerSuggestedActive: false,
          purchasedAt: error.phoneNumber?.purchasedAt ?? claimedNumber.purchased_at ?? null,
        });
        claimedNumber = number;

        return jsonResponse(
          {
            number: toWorkspacePhoneNumberView(number),
            webhookReady: false,
          },
          202,
        );
      }
    }

    const message = error instanceof Error ? error.message : 'Unexpected error.';
    const status = message.includes('another workspace') ? 409 : 400;
    return jsonResponse({ error: message }, status);
  } finally {
    if (serviceClient && workspaceId && claimedNumber?.id) {
      try {
        await releaseWorkspacePhoneNumberProvisioning(serviceClient, workspaceId, claimedNumber.id);
      } catch {
        // Best effort lock cleanup; stale-lock claiming handles crash recovery.
      }
    }
  }
});
