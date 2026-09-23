begin;

-- V153.28 is scoped ONLY to Vaccination Onsite Queue.
-- Keep legacy email data for historical rows, but new onsite registrations use phone.
alter table public.vaccination_onsite_queue_entries
  add column if not exists phone text;

alter table public.vaccination_onsite_queue_entries
  alter column email drop not null;

create or replace function public.vaccination_onsite_claim_queue_v2(
  p_event_id bigint,
  p_participant_name text,
  p_employee_id text,
  p_employee_id_key text,
  p_phone text
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
    phone,
    queue_sequence,
    queue_number,
    queue_status
  ) values (
    p_event_id,
    trim(p_participant_name),
    trim(p_employee_id),
    p_employee_id_key,
    trim(p_phone),
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

-- No PROCESS stage in V153.28.
-- Each Call Next atomically finishes the currently CALLED/legacy IN_PROGRESS row,
-- then calls the lowest WAITING queue number. If there is no next waiting row,
-- it still finishes the current row and clears the current event pointer.
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
  limit 1
  for update;

  if found then
    update public.vaccination_onsite_queue_entries
    set queue_status = 'DONE',
        finished_at = now(),
        updated_at = now()
    where id = v_active.id
    returning * into v_active;
  end if;

  select * into v_next
  from public.vaccination_onsite_queue_entries
  where event_id = p_event_id
    and queue_status = 'WAITING'
  order by queue_sequence
  limit 1
  for update skip locked;

  if not found then
    update public.vaccination_onsite_queue_events
    set current_entry_id = null,
        current_queue_number = null,
        updated_at = now()
    where id = p_event_id;

    if v_active.id is not null then
      return jsonb_build_object(
        'ok', true,
        'code', 'COMPLETED_ONLY',
        'completed_entry', to_jsonb(v_active)
      );
    end if;

    return jsonb_build_object('ok', false, 'code', 'EMPTY', 'message', 'Tidak ada antrean aktif maupun menunggu.');
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

  return jsonb_build_object(
    'ok', true,
    'entry', to_jsonb(v_next),
    'completed_entry', case when v_active.id is null then null else to_jsonb(v_active) end
  );
end;
$$;

revoke all on function public.vaccination_onsite_claim_queue_v2(bigint,text,text,text,text) from public;
revoke all on function public.vaccination_onsite_call_next(bigint) from public;
grant execute on function public.vaccination_onsite_claim_queue_v2(bigint,text,text,text,text) to service_role;
grant execute on function public.vaccination_onsite_call_next(bigint) to service_role;

commit;

select
  to_regprocedure('public.vaccination_onsite_claim_queue_v2(bigint,text,text,text,text)') is not null as claim_queue_v2_ready,
  to_regprocedure('public.vaccination_onsite_call_next(bigint)') is not null as call_next_ready,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vaccination_onsite_queue_entries'
      and column_name = 'phone'
  ) as phone_column_ready;
