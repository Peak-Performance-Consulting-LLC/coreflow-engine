update public.workspace_phone_numbers
set webhook_status = 'pending'
where
  webhook_status = 'ready'
  and provider_order_id is null
  and telnyx_connection_id is null;
