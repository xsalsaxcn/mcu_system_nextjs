-- V153.53 SAFE
-- Preserve vaccination reminder Email + WhatsApp delivery state during sync.
--
-- ROOT CAUSE FIX:
-- The application previously used a normal UPSERT containing status fields.
-- A stale/concurrent sync could overwrite a freshly successful manual send:
--   SENT -> PENDING
--   wa_status SENT -> NOT_APPLICABLE / SKIPPED
--
-- This RPC inserts complete state for NEW reminders, but on conflict only
-- refreshes reminder metadata. Existing Email/WA delivery state is untouched.

begin;

create or replace function public.upsert_vaccination_reminders_preserve_delivery(
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  with src as (
    select *
    from jsonb_populate_recordset(
      null::public.vaccination_reminders,
      p_rows
    )
  ),
  applied as (
    insert into public.vaccination_reminders (
      reminder_key,
      source_type,
      source_key,
      record_id,
      registration_id,
      history_service_id,
      person_id,
      participant_email,
      participant_name,
      vaccine_name,
      next_due_date,
      reminder_date,
      reminder_stage,
      recipient_name,
      recipient_email,
      recipient_phone,
      recipient_type,
      company_name,

      -- Initial delivery state is used ONLY when the reminder row is new.
      status,
      sent_at,
      error_message,
      attempt_count,

      wa_status,
      wa_attempt_count,
      wa_last_attempt_at,
      wa_sent_at,
      wa_meta_message_id,
      wa_error_message,

      superseded_at,
      updated_at
    )
    select
      s.reminder_key,
      s.source_type,
      s.source_key,
      s.record_id,
      s.registration_id,
      s.history_service_id,
      s.person_id,
      s.participant_email,
      s.participant_name,
      s.vaccine_name,
      s.next_due_date,
      s.reminder_date,
      s.reminder_stage,
      s.recipient_name,
      s.recipient_email,
      s.recipient_phone,
      s.recipient_type,
      s.company_name,

      s.status,
      s.sent_at,
      s.error_message,
      coalesce(s.attempt_count, 0),

      s.wa_status,
      coalesce(s.wa_attempt_count, 0),
      s.wa_last_attempt_at,
      s.wa_sent_at,
      s.wa_meta_message_id,
      s.wa_error_message,

      null,
      coalesce(s.updated_at, now())
    from src s
    where nullif(trim(s.reminder_key), '') is not null

    on conflict (reminder_key) do update
    set
      -- Metadata may legitimately change as imported/history data is corrected.
      source_type = excluded.source_type,
      source_key = excluded.source_key,
      record_id = excluded.record_id,
      registration_id = excluded.registration_id,
      history_service_id = excluded.history_service_id,
      person_id = excluded.person_id,
      participant_email = excluded.participant_email,
      participant_name = excluded.participant_name,
      vaccine_name = excluded.vaccine_name,
      next_due_date = excluded.next_due_date,
      reminder_date = excluded.reminder_date,
      reminder_stage = excluded.reminder_stage,
      recipient_name = excluded.recipient_name,
      recipient_email = excluded.recipient_email,
      recipient_phone = excluded.recipient_phone,
      recipient_type = excluded.recipient_type,
      company_name = excluded.company_name,
      superseded_at = null,
      updated_at = excluded.updated_at

      -- INTENTIONALLY NOT UPDATED ON CONFLICT:
      -- status
      -- sent_at
      -- error_message
      -- attempt_count / last_attempt_at
      -- wa_status
      -- wa_attempt_count
      -- wa_last_attempt_at
      -- wa_sent_at
      -- wa_meta_message_id
      -- wa_error_message

    returning 1
  )
  select count(*) into v_count from applied;

  return v_count;
end;
$$;

revoke all on function public.upsert_vaccination_reminders_preserve_delivery(jsonb)
  from public, anon, authenticated;

grant execute on function public.upsert_vaccination_reminders_preserve_delivery(jsonb)
  to service_role;

commit;

-- Optional verification after running:
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'upsert_vaccination_reminders_preserve_delivery';
