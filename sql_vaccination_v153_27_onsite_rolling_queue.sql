-- V153.27 SAFE - Vaccination Onsite Rolling QR Queue
-- Scope: VACCINATION ONLY. Does not alter CAPASKA / MCU / Wellness tables.
-- Existing vaccination queue remains intact. This migration ADDS a second queue mode.

create extension if not exists pgcrypto;

create table if not exists public.vaccination_onsite_queue_events (
  id bigserial primary key,
  session_id bigint not null references public.vaccination_sessions(id) on delete cascade,
  public_token text not null default encode(gen_random_bytes(18), 'hex'),
  qr_secret text not null default encode(gen_random_bytes(32), 'hex'),
  qr_interval_seconds integer not null default 45 check (qr_interval_seconds between 30 and 60),
  queue_prefix text not null default 'Q',
  next_queue_sequence bigint not null default 0,
  current_entry_id bigint,
  current_queue_number text,
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id),
  unique(public_token)
);

create table if not exists public.vaccination_onsite_queue_entries (
  id bigserial primary key,
  event_id bigint not null references public.vaccination_onsite_queue_events(id) on delete cascade,
  participant_name text not null,
  employee_id text not null,
  employee_id_key text not null,
  email text not null,
  queue_sequence bigint not null,
  queue_number text not null,
  queue_status text not null default 'WAITING'
    check (queue_status in ('WAITING','CALLED','IN_PROGRESS','SKIPPED','DONE','CANCELLED')),
  public_token text not null default encode(gen_random_bytes(18), 'hex'),
  joined_at timestamptz not null default now(),
  called_at timestamptz,
  started_at timestamptz,
  skipped_at timestamptz,
  reactivated_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(event_id, employee_id_key),
  unique(event_id, queue_sequence),
  unique(event_id, queue_number),
  unique(public_token)
);

create index if not exists idx_vaccination_onsite_entries_event_status_sequence
  on public.vaccination_onsite_queue_entries(event_id, queue_status, queue_sequence);

create index if not exists idx_vaccination_onsite_entries_public_token
  on public.vaccination_onsite_queue_entries(public_token);

alter table public.vaccination_onsite_queue_events
  drop constraint if exists vaccination_onsite_queue_events_current_entry_id_fkey;

alter table public.vaccination_onsite_queue_events
  add constraint vaccination_onsite_queue_events_current_entry_id_fkey
  foreign key (current_entry_id)
  references public.vaccination_onsite_queue_entries(id)
  on delete set null;

create or replace function public.vaccination_onsite_claim_queue(
  p_event_id bigint,
  p_participant_name text,
  p_employee_id text,
  p_employee_id_key text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.vaccination_onsite_queue_events%rowtype;
  v_existing public.vaccination_onsite_queue_entries%rowtype;
  v_entry public.vaccination_onsite_queue_entries%rowtype;
  v_sequence bigint;
  v_queue_number text;
begin
  select * into v_event
  from public.vaccination_onsite_queue_events
  where id = p_event_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'EVENT_NOT_FOUND', 'message', 'Event onsite queue tidak ditemukan.');
  end if;

  if upper(coalesce(v_event.status, '')) <> 'OPEN' then
    return jsonb_build_object('ok', false, 'code', 'EVENT_CLOSED', 'message', 'Onsite queue sedang ditutup.');
  end if;

  select * into v_existing
  from public.vaccination_onsite_queue_entries
  where event_id = p_event_id
    and employee_id_key = p_employee_id_key
  limit 1;

  if found then
    return jsonb_build_object('ok', true, 'created', false, 'entry', to_jsonb(v_existing));
  end if;

  v_sequence := coalesce(v_event.next_queue_sequence, 0) + 1;
  v_queue_number := coalesce(nullif(trim(v_event.queue_prefix), ''), 'Q') || '-' || lpad(v_sequence::text, 4, '0');

  update public.vaccination_onsite_queue_events
  set next_queue_sequence = v_sequence,
      updated_at = now()
  where id = p_event_id;

  insert into public.vaccination_onsite_queue_entries (
    event_id,
    participant_name,
    employee_id,
    employee_id_key,
    email,
    queue_sequence,
    queue_number,
    queue_status
  ) values (
    p_event_id,
    trim(p_participant_name),
    trim(p_employee_id),
    p_employee_id_key,
    lower(trim(p_email)),
    v_sequence,
    v_queue_number,
    'WAITING'
  )
  returning * into v_entry;

  return jsonb_build_object('ok', true, 'created', true, 'entry', to_jsonb(v_entry));
exception
  when unique_violation then
    select * into v_existing
    from public.vaccination_onsite_queue_entries
    where event_id = p_event_id
      and employee_id_key = p_employee_id_key
    limit 1;

    if found then
      return jsonb_build_object('ok', true, 'created', false, 'entry', to_jsonb(v_existing));
    end if;
    raise;
end;
$$;

create or replace function public.vaccination_onsite_call_next(p_event_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.vaccination_onsite_queue_events%rowtype;
  v_active public.vaccination_onsite_queue_entries%rowtype;
  v_next public.vaccination_onsite_queue_entries%rowtype;
begin
  select * into v_event
  from public.vaccination_onsite_queue_events
  where id = p_event_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'EVENT_NOT_FOUND', 'message', 'Event onsite queue tidak ditemukan.');
  end if;

  if upper(coalesce(v_event.status, '')) <> 'OPEN' then
    return jsonb_build_object('ok', false, 'code', 'EVENT_CLOSED', 'message', 'Onsite queue sedang ditutup.');
  end if;

  select * into v_active
  from public.vaccination_onsite_queue_entries
  where event_id = p_event_id
    and queue_status in ('CALLED','IN_PROGRESS')
  order by queue_sequence
  limit 1;

  if found then
    return jsonb_build_object('ok', false, 'code', 'ACTIVE_CURRENT', 'entry', to_jsonb(v_active));
  end if;

  select * into v_next
  from public.vaccination_onsite_queue_entries
  where event_id = p_event_id
    and queue_status = 'WAITING'
  order by queue_sequence
  limit 1
  for update skip locked;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'EMPTY', 'message', 'Tidak ada antrean menunggu.');
  end if;

  update public.vaccination_onsite_queue_entries
  set queue_status = 'CALLED',
      called_at = now(),
      updated_at = now()
  where id = v_next.id
  returning * into v_next;

  update public.vaccination_onsite_queue_events
  set current_entry_id = v_next.id,
      current_queue_number = v_next.queue_number,
      updated_at = now()
  where id = p_event_id;

  return jsonb_build_object('ok', true, 'entry', to_jsonb(v_next));
end;
$$;

revoke all on function public.vaccination_onsite_claim_queue(bigint,text,text,text,text) from public;
revoke all on function public.vaccination_onsite_call_next(bigint) from public;
grant execute on function public.vaccination_onsite_claim_queue(bigint,text,text,text,text) to service_role;
grant execute on function public.vaccination_onsite_call_next(bigint) to service_role;
