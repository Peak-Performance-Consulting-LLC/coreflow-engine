import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';
import type { EdgeClient } from '../_shared/server.ts';

interface EnumerateBody {
  workspace_id?: string;
  campaign_id?: string;
  segment_definition?: Record<string, unknown>;
  include_record_ids?: string[];
  exclude_record_ids?: string[];
  freeze_snapshot?: boolean;
}

interface RecordRow {
  id: string;
  email: string | null;
  title: string | null;
  full_name: string | null;
  status: string | null;
  source_id: string | null;
  stage_id: string | null;
  assignee_user_id: string | null;
  created_at: string;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value: unknown) {
  const next = normalizeString(value);
  if (!next || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
    return '';
  }
  return next.toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((entry) => normalizeString(entry))
    .filter((entry) => entry.length > 0);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

async function loadCampaign(serviceClient: EdgeClient, workspaceId: string, campaignId: string) {
  const { data, error } = await serviceClient
    .from('email_campaigns')
    .select('id, workspace_id, status, segment_definition, recipient_filter, manual_include_record_ids, manual_exclude_record_ids')
    .eq('workspace_id', workspaceId)
    .eq('id', campaignId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Campaign not found.');
  }

  return data as {
    id: string;
    workspace_id: string;
    status: string;
    segment_definition: Record<string, unknown> | null;
    recipient_filter: Record<string, unknown> | null;
    manual_include_record_ids: string[] | null;
    manual_exclude_record_ids: string[] | null;
  };
}

async function listRecordsByIds(serviceClient: EdgeClient, workspaceId: string, ids: string[]) {
  if (ids.length === 0) {
    return [] as RecordRow[];
  }

  const { data, error } = await serviceClient
    .from('records')
    .select('id, email, title, full_name, status, source_id, stage_id, assignee_user_id, created_at')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .in('id', ids);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as RecordRow[];
}

async function listSegmentRecords(
  serviceClient: EdgeClient,
  workspaceId: string,
  segment: Record<string, unknown>,
) {
  let query = serviceClient
    .from('records')
    .select('id, email, title, full_name, status, source_id, stage_id, assignee_user_id, created_at')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .not('email', 'is', null);

  const statusIn = uniqueStrings(parseStringArray(segment.statuses ?? segment.status));
  const sourceIn = uniqueStrings(parseStringArray(segment.source_ids ?? segment.source_id));
  const stageIn = uniqueStrings(parseStringArray(segment.stage_ids ?? segment.stage_id));
  const assigneeIn = uniqueStrings(parseStringArray(segment.assignee_ids ?? segment.assignee_user_id));

  if (statusIn.length > 0) {
    query = query.in('status', statusIn);
  }

  if (sourceIn.length > 0) {
    query = query.in('source_id', sourceIn);
  }

  if (stageIn.length > 0) {
    query = query.in('stage_id', stageIn);
  }

  if (assigneeIn.length > 0) {
    query = query.in('assignee_user_id', assigneeIn);
  }

  const search = normalizeString(segment.search);
  if (search) {
    const escaped = search.replace(/[%_,]/g, '\\$&');
    const pattern = `%${escaped}%`;
    query = query.or(`title.ilike.${pattern},full_name.ilike.${pattern},company_name.ilike.${pattern},email.ilike.${pattern}`);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as RecordRow[];
}

async function listSuppressedEmails(serviceClient: EdgeClient, workspaceId: string) {
  const { data, error } = await serviceClient
    .from('workspace_email_unsubscribes')
    .select('email, unsubscribed_at, resubscribed_at')
    .eq('workspace_id', workspaceId);

  if (error) {
    throw new Error(error.message);
  }

  const suppressed = new Set<string>();

  for (const row of data ?? []) {
    const email = normalizeEmail(row.email);
    if (!email) continue;

    if (!row.resubscribed_at) {
      suppressed.add(email);
      continue;
    }

    if (Date.parse(row.resubscribed_at) < Date.parse(row.unsubscribed_at)) {
      suppressed.add(email);
    }
  }

  return suppressed;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const authContext = await authenticateRequest(request);

    if (authContext instanceof Response) {
      return authContext;
    }

    const payload = (await request.json()) as EnumerateBody;
    const workspaceId = normalizeString(payload.workspace_id);
    const campaignId = normalizeString(payload.campaign_id);

    if (!workspaceId || !campaignId) {
      return jsonResponse({ error: 'workspace_id and campaign_id are required.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    const campaign = await loadCampaign(authContext.serviceClient, workspaceId, campaignId);

    const manualInclude = uniqueStrings([
      ...parseStringArray(campaign.manual_include_record_ids),
      ...parseStringArray(payload.include_record_ids),
    ]);

    const manualExclude = uniqueStrings([
      ...parseStringArray(campaign.manual_exclude_record_ids),
      ...parseStringArray(payload.exclude_record_ids),
    ]);

    const effectiveSegment = asRecord(payload.segment_definition);
    const campaignSegment = asRecord(campaign.segment_definition);
    const legacySegment = asRecord(campaign.recipient_filter);
    const segment = Object.keys(effectiveSegment).length > 0
      ? effectiveSegment
      : Object.keys(campaignSegment).length > 0
        ? campaignSegment
        : legacySegment;

    const [segmentRecords, includeRecords, suppressedEmails] = await Promise.all([
      listSegmentRecords(authContext.serviceClient, workspaceId, segment),
      listRecordsByIds(authContext.serviceClient, workspaceId, manualInclude),
      listSuppressedEmails(authContext.serviceClient, workspaceId),
    ]);

    const candidateMap = new Map<string, RecordRow>();
    for (const row of segmentRecords) {
      candidateMap.set(row.id, row);
    }
    for (const row of includeRecords) {
      candidateMap.set(row.id, row);
    }

    for (const recordId of manualExclude) {
      candidateMap.delete(recordId);
    }

    const recipients = Array.from(candidateMap.values())
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .map((row) => {
        const recipientEmail = normalizeEmail(row.email);
        const isSuppressed = recipientEmail.length > 0 && suppressedEmails.has(recipientEmail);

        return {
          record_id: row.id,
          recipient_email: recipientEmail,
          recipient_name: normalizeString(row.full_name) || normalizeString(row.title) || null,
          suppressed: isSuppressed,
          suppression_reason: isSuppressed ? 'workspace_unsubscribed' : null,
          status: isSuppressed ? 'unsubscribed' : 'pending',
        };
      })
      .filter((row) => row.recipient_email.length > 0);

    const activeRecipients = recipients.filter((row) => !row.suppressed);
    const suppressedRecipients = recipients.filter((row) => row.suppressed);

    if (payload.freeze_snapshot) {
      const now = new Date().toISOString();

      const { data: snapshot, error: snapshotError } = await authContext.serviceClient
        .from('email_campaign_recipient_snapshots')
        .upsert({
          workspace_id: workspaceId,
          campaign_id: campaignId,
          segment_definition: segment,
          include_record_ids: manualInclude,
          exclude_record_ids: manualExclude,
          total_candidates: candidateMap.size,
          total_included: recipients.length,
          frozen_at: now,
          frozen_by: authContext.user.id,
        }, { onConflict: 'campaign_id' })
        .select('id')
        .single();

      if (snapshotError || !snapshot) {
        throw new Error(snapshotError?.message || 'Unable to freeze recipient snapshot.');
      }

      const { error: deleteRecipientsError } = await authContext.serviceClient
        .from('email_campaign_recipients')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('workspace_id', workspaceId);

      if (deleteRecipientsError) {
        throw new Error(deleteRecipientsError.message);
      }

      if (recipients.length > 0) {
        const { error: insertRecipientsError } = await authContext.serviceClient
          .from('email_campaign_recipients')
          .insert(
            recipients.map((recipient) => ({
              workspace_id: workspaceId,
              campaign_id: campaignId,
              snapshot_id: snapshot.id,
              record_id: recipient.record_id,
              recipient_email: recipient.recipient_email,
              recipient_name: recipient.recipient_name,
              status: recipient.status,
              suppression_reason: recipient.suppression_reason,
            })),
          );

        if (insertRecipientsError) {
          throw new Error(insertRecipientsError.message);
        }
      }

      const { error: campaignUpdateError } = await authContext.serviceClient
        .from('email_campaigns')
        .update({
          segment_definition: segment,
          manual_include_record_ids: manualInclude,
          manual_exclude_record_ids: manualExclude,
          recipient_count: activeRecipients.length,
          snapshot_frozen_at: now,
          latest_snapshot_id: snapshot.id,
          updated_by: authContext.user.id,
          updated_at: now,
        })
        .eq('id', campaignId)
        .eq('workspace_id', workspaceId);

      if (campaignUpdateError) {
        throw new Error(campaignUpdateError.message);
      }

      const { error: statsError } = await authContext.serviceClient
        .from('email_campaign_stats')
        .upsert({
          workspace_id: workspaceId,
          campaign_id: campaignId,
          total_recipients: recipients.length,
          sent_count: 0,
          failed_count: 0,
          bounced_count: 0,
          unsubscribed_count: suppressedRecipients.length,
          open_count: 0,
          click_count: 0,
          reply_count: 0,
          last_updated_at: now,
          updated_at: now,
        }, { onConflict: 'campaign_id' });

      if (statsError) {
        throw new Error(statsError.message);
      }
    }

    return jsonResponse({
      campaign_id: campaignId,
      segment_definition: segment,
      include_record_ids: manualInclude,
      exclude_record_ids: manualExclude,
      counts: {
        total_candidates: candidateMap.size,
        included_with_email: recipients.length,
        active_recipients: activeRecipients.length,
        suppressed_recipients: suppressedRecipients.length,
      },
      preview: recipients.slice(0, 500),
      frozen: Boolean(payload.freeze_snapshot),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
