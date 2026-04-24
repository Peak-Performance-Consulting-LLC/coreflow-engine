-- Allow manual email sends to target external recipients not tied to CRM records.
-- External recipients are stored without a record_id.

alter table if exists public.email_manual_send_recipients
  alter column record_id drop not null;
