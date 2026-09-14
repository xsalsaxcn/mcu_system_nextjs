-- V152.0 SAFE - Automatic Vaccination Email Reminder
-- Scope: vaccination reminder only.
-- Does NOT alter Sticker V146, label/print CSS, Administer, Inventory, Session,
-- Register, Queue, Validation workflow, Wellness, CAPASKA, or MCU Corporate.

begin;

alter table public.vaccination_reminders
  alter column record_id drop not null;

alter table public.vaccination_reminders
  alter column registration_id drop not null;

alter table public.vaccination_reminders
  add column if not exists source_type text not null default 'CURRENT_RECORD',
  add column if not exists source_key text,
  add column if not exists reminder_key text,
  add column if not exists history_service_id bigint references public.vaccination_service_history(id) on delete cascade,
  add column if not exists person_id bigint references public.vaccination_persons(id) on delete cascade,
  add column if not exists reminder_stage text,
  add column if not exists recipient_name text,
  add column if not exists recipient_email text,
  add column if not exists recipient_type text not null default 'SELF',
  add column if not exists company_name text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists superseded_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.vaccination_reminders
set
  source_type = coalesce(nullif(source_type, ''), 'CURRENT_RECORD'),
  source_key = coalesce(source_key, 'CURRENT_RECORD:' || record_id::text),
  recipient_email = coalesce(recipient_email, participant_email),
  updated_at = now()
where record_id is not null;

create unique index if not exists ux_vaccination_reminders_reminder_key
  on public.vaccination_reminders(reminder_key)
  where reminder_key is not null;

create index if not exists idx_vaccination_reminders_source_key
  on public.vaccination_reminders(source_key)
  where source_key is not null;

create index if not exists idx_vaccination_reminders_due_auto
  on public.vaccination_reminders(reminder_date, status, superseded_at);

create index if not exists idx_vaccination_reminders_history_service
  on public.vaccination_reminders(history_service_id)
  where history_service_id is not null;

alter table public.vaccination_reminders enable row level security;

create or replace function public.claim_vaccination_reminders(
  p_today date,
  p_limit integer default 200
)
returns setof public.vaccination_reminders
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select r.id
    from public.vaccination_reminders r
    where r.superseded_at is null
      and r.reminder_date <= p_today
      and r.status in ('PENDING', 'FAILED')
      and coalesce(r.attempt_count, 0) < 3
    order by r.reminder_date asc, r.id asc
    for update skip locked
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
  )
  update public.vaccination_reminders r
  set
    status = 'SENDING',
    attempt_count = coalesce(r.attempt_count, 0) + 1,
    last_attempt_at = now(),
    updated_at = now()
  from picked p
  where r.id = p.id
  returning r.*;
end;
$$;

revoke all on function public.claim_vaccination_reminders(date, integer) from public;
grant execute on function public.claim_vaccination_reminders(date, integer) to service_role;

commit;

select pg_notify('pgrst', 'reload schema');

select
  to_regclass('public.vaccination_reminders') as reminders,
  to_regprocedure('public.claim_vaccination_reminders(date,integer)') as claim_function;
