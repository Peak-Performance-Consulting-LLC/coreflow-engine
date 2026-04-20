-- Fix schema cache: reload PostgREST and grant execution permissions
notify pgrst, 'reload schema';

grant execute on function public.ensure_workspace_email_automation_defaults(uuid, uuid)
  to service_role, authenticated;

grant execute on function public.claim_due_record_email_followup_steps(integer, timestamptz)
  to service_role;
