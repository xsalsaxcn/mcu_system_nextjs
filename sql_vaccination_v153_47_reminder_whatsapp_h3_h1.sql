-- V153.47 SAFE — Vaccination Reminder WhatsApp H-3 / H-1
-- Additive migration only. Existing email reminder columns and claim RPC are untouched.

begin;

alter table public.vaccination_reminders
  add column if not exists recipient_phone text,
  add column if not exists wa_status text,
  add column if not exists wa_attempt_count integer not null default 0,
  add column if not exists wa_last_attempt_at timestamptz,
  add column if not exists wa_sent_at timestamptz,
  add column if not exists wa_meta_message_id text,
  add column if not exists wa_error_message text;

-- Existing rows are initialized conservatively. The next reminder sync will fill
-- recipient_phone from current registration / History person data and reopen
-- eligible H-3/H-1 rows to PENDING when a valid phone is found.
update public.vaccination_reminders
set wa_status = case
  when upper(coalesce(reminder_stage, '')) in ('H3', 'H1') then
    case
      when nullif(trim(coalesce(recipient_phone, '')), '') is not null then 'PENDING'
      else 'SKIPPED'
    end
  else 'NOT_APPLICABLE'
end
where wa_status is null;

create index if not exists idx_vaccination_reminders_wa_due
  on public.vaccination_reminders (reminder_date, wa_status, reminder_stage)
  where superseded_at is null;

create index if not exists idx_vaccination_reminders_wa_sent
  on public.vaccination_reminders (wa_sent_at)
  where wa_sent_at is not null;

commit;
