

## Two-part plan

The build is currently broken (15+ TS errors across `_shared/email-automation.ts`, `_shared/email-sender-adapters.ts`, `_shared/records.ts`, etc.). All errors trace to one root cause: `EdgeClient = ReturnType<typeof createClient>` resolves to a Supabase client without a `Database` generic, so every `.insert()`/`.update()`/`.rpc()` call infers its argument as `never`.

I'll fix the build first, then deliver the email automation upgrade.

---

### Part 1 — Fix the build (small, surgical)

**File:** `supabase/functions/_shared/server.ts`

Change `EdgeClient` from the strict inferred type to a permissive one so existing function code compiles unchanged:

```ts
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
export type EdgeClient = SupabaseClient<any, any, any>;
```

This single change resolves all `never` errors in `email-automation.ts`, `email-sender-adapters.ts`, `records.ts`, and the rest. No edge function logic changes.

---

### Part 2 — Email Automation Intelligence

Goal: turn the current single-sequence/3-step setup into a full automation studio: branded HTML templates with logo, dynamic attachments, a pre-made template library, multi-sequence campaigns, audience selection (which leads), and per-client schedules.

#### New data model (one migration: `202604200003_email_automation_studio.sql`)

| Table | Purpose |
|---|---|
| `workspace_email_brand` | per-workspace logo URL, primary color, signature, footer address — injected into every template render |
| `email_template_library` | system-seeded pre-made templates (Welcome, Subscription, Trial follow-up, Re-engagement, Meeting follow-up, Invoice reminder, Renewal). Read-only. |
| `workspace_email_templates` | user's saved templates (subject, html_body, design_json from the visual editor, category). Can be cloned from library. |
| `workspace_email_campaigns` | a named multi-step sequence: name, trigger (manual / on_record_create / on_stage_change), audience filter (JSON: stage, tag, custom field match), is_active, timezone, send_window (start_hour, end_hour, weekdays only) |
| `workspace_email_campaign_steps` | replaces flat `sequence_steps`: campaign_id, step_order, delay_hours, template_id, attachment_ids[] |
| `workspace_email_attachments` | uploaded files in Supabase Storage bucket `email-attachments` (private). Columns: filename, storage_path, mime, size_bytes |
| `record_email_campaign_enrollments` | which records are enrolled in which campaigns (replaces single `record_email_followups` 1:1 model) |

The existing `record_email_followups` / `record_email_followup_steps` / `email_delivery_events` stay; new tables sit alongside, and the dispatcher gains a path to read from campaign steps.

A new private storage bucket `email-attachments` with RLS scoped to workspace members.

#### New edge functions

- `email-template-library-list` — returns seeded templates (filterable by category)
- `email-template-save` — upsert a workspace template (subject, html, design_json)
- `email-template-clone-from-library` — copy a library template into the workspace
- `email-attachment-upload-url` — returns signed upload URL for storage
- `email-campaign-upsert` — create/update campaign + steps in one call
- `email-campaign-list`, `email-campaign-get`, `email-campaign-delete`
- `email-campaign-enroll` — manually enroll selected records into a campaign
- `email-audience-preview` — given an audience filter, returns matching record count + sample

The existing `email-followup-dispatch` is extended to:
- pull steps from either old `workspace_email_sequence_steps` OR new `workspace_email_campaign_steps`
- inject brand (logo, color, signature) into the rendered HTML
- attach files from `workspace_email_attachments` to outbound mail (Gmail/Microsoft/SMTP adapters all support attachments)
- respect the campaign's `send_window` (skip sends outside business hours, reschedule to next open slot)

#### Frontend rewrite of `EmailPage.tsx`

New tab layout: **Brand · Templates · Campaigns · Audience · Sending Logs**

1. **Brand tab** — upload logo, pick primary color, edit signature & footer. Preview pane shows how every email will be wrapped.
2. **Templates tab**
   - Left: category sidebar (Welcome / Follow-up / Subscription / Re-engagement / Custom)
   - Center: gallery grid of pre-made templates (with thumbnails) + "Your templates"
   - Click → opens visual editor (`EmailDesigner.tsx`): drag blocks (Heading, Text, Button, Image, Divider, Logo, Spacer), edit inline, variable picker (`{{lead_first_name}}` etc.), attachment selector, live mobile/desktop preview
   - Save persists `design_json` + rendered `html_body`
3. **Campaigns tab** — list of campaigns; create new opens a 3-step wizard:
   - *Step 1 Trigger*: Manual / On new lead / On stage change → stage picker
   - *Step 2 Audience*: filter builder (stage, tags, custom fields) with live "X leads match" preview; or pick records manually from a searchable table
   - *Step 3 Sequence*: ordered list of steps (template + delay + optional attachments), drag to reorder, set send window & timezone
4. **Audience tab** — see all records, filter, multi-select, "Enroll in campaign" action
5. **Sending Logs tab** — table of `email_delivery_events` with filters (campaign, status, date), retry/cancel actions, open-rate placeholder

#### New frontend files

- `src/lib/email-automation-service.ts` — typed wrappers for all new edge functions
- `src/components/email/EmailDesigner.tsx` — block-based visual editor
- `src/components/email/BrandSettingsCard.tsx`
- `src/components/email/TemplateGallery.tsx`
- `src/components/email/CampaignWizard.tsx` (3-step modal)
- `src/components/email/AudienceFilterBuilder.tsx`
- `src/components/email/AttachmentPicker.tsx` (uploads to storage via signed URL)
- `src/components/email/SendingLogsTable.tsx`
- `EmailPage.tsx` rewritten around the new tabs (old code preserved as `EmailPageLegacy` until the new flow is verified)

#### Pre-seeded templates (inserted by migration)

Welcome • Trial Day 1 / Day 3 / Day 7 follow-up • Subscription confirmation • Subscription renewal reminder • Payment failed • Re-engagement (30/60/90 day inactive) • Meeting recap • Proposal follow-up • Holiday greeting

Each ships with branded HTML that auto-injects the workspace logo + color.

---

### Order of execution (when approved)

1. Patch `EdgeClient` type → unblock build (1 file)
2. Migration: new tables + storage bucket + seed library
3. Edge functions for templates, campaigns, attachments, audience
4. Extend `email-followup-dispatch` for branding, attachments, send windows
5. New service layer + components
6. Rewrite `EmailPage.tsx` with new tabs
7. Wire to dashboard sidebar (no change needed; route already exists)

---

### Question before I start

The plan is large. Want me to ship it all in one pass, or split into milestones (e.g. M1 = build fix + brand + template library + designer; M2 = campaigns + audience + attachments; M3 = logs + send windows)?

