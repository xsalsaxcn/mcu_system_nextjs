begin;

-- V153.59 SAFE
-- Strict cross-session / cross-location queue eligibility:
-- - any prior queue in another event with status != CANCELLED blocks a new queue
-- - prior CANCELLED rows do not block
-- - admin Cancel sets CANCELLED and therefore releases the participant for another event
--
-- Identity matching uses all stable identifiers submitted by the participant:
-- employee_id, WhatsApp, email, plus the configured Recovery Key.

alter table public.vaccination_onsite_queue_entries
  add column if not exists identity_keys text[];

update public.vaccination_onsite_queue_entries
set identity_keys = '{}'::text[]
where identity_keys is null;

alter table public.vaccination_onsite_queue_entries
  alter column identity_keys set default '{}'::text[];

alter table public.vaccination_onsite_queue_entries
  alter column identity_keys set not null;

alter table public.vaccination_onsite_queue_entries
  add column if not exists cancelled_at timestamptz;

-- Normalize one identity into the same key format used by the application.
create or replace function public.vaccination_onsite_identity_key(
  p_kind text,
  p_value text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_raw text := trim(coalesce(p_value, ''));
  v_digits text;
  v_normalized text;
begin
  if v_raw = '' then
    return null;
  end if;

  if v_kind = 'employee_id' then
    v_normalized := upper(regexp_replace(v_raw, '\s+', '', 'g'));
    if v_normalized = '' then return null; end if;
    return 'EMPLOYEE:' || v_normalized;
  end if;

  if v_kind = 'whatsapp' then
    v_digits := regexp_replace(v_raw, '[^0-9]', '', 'g');

    if left(v_digits, 4) = '0062' then
      v_digits := substr(v_digits, 5);
    elsif left(v_digits, 2) = '62' then
      v_digits := substr(v_digits, 3);
    end if;

    v_digits := regexp_replace(v_digits, '^0+', '');
    if v_digits = '' then return null; end if;
    return 'WHATSAPP:0' || v_digits;
  end if;

  if v_kind = 'email' then
    v_normalized := lower(v_raw);
    if v_normalized = '' then return null; end if;
    return 'EMAIL:' || v_normalized;
  end if;

  if v_kind = 'custom_number' then
    v_normalized := regexp_replace(v_raw, '\s+', '', 'g');
  elsif v_kind = 'custom_date' then
    v_normalized := v_raw;
  else
    v_normalized := lower(regexp_replace(v_raw, '\s+', ' ', 'g'));
  end if;

  if v_normalized = '' then return null; end if;
  return 'RECOVERY:' || v_kind || ':' || v_normalized;
end;
$$;

-- Backfill historical rows so queues created before V153.59 also participate
-- in the strict cross-session check whenever a stable identifier is available.
with generated as (
  select
    e.id,
    array(
      select distinct identity_key
      from (
        select public.vaccination_onsite_identity_key('employee_id', nullif(e.employee_id, '')) as identity_key
        union all
        select public.vaccination_onsite_identity_key('whatsapp', nullif(e.phone, ''))
        union all
        select public.vaccination_onsite_identity_key(
          coalesce(field->>'kind', ''),
          coalesce(field->>'value', '')
        )
        from jsonb_array_elements(
          case
            when jsonb_typeof(e.form_data->'fields') = 'array'
              then e.form_data->'fields'
            else '[]'::jsonb
          end
        ) field
        where lower(coalesce(field->>'kind', '')) in ('employee_id', 'whatsapp', 'email')
           or lower(coalesce(field->>'recoveryKey', 'false')) = 'true'
      ) source_keys
      where identity_key is not null
      order by identity_key
    ) as keys
  from public.vaccination_onsite_queue_entries e
)
update public.vaccination_onsite_queue_entries e
set identity_keys = generated.keys
from generated
where generated.id = e.id
  and cardinality(generated.keys) > 0
  and (
    cardinality(e.identity_keys) = 0
    or not (e.identity_keys @> generated.keys and generated.keys @> e.identity_keys)
  );

create index if not exists idx_vaccination_onsite_queue_entries_identity_keys
  on public.vaccination_onsite_queue_entries
  using gin (identity_keys);

create index if not exists idx_vaccination_onsite_queue_entries_status_event
  on public.vaccination_onsite_queue_entries (queue_status, event_id);

create or replace function public.vaccination_onsite_claim_queue_v3(
  p_event_id bigint,
  p_participant_name text,
  p_employee_id text,
  p_employee_id_key text,
  p_phone text,
  p_identity_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keys text[];
  v_lock_key text;
  v_same_event public.vaccination_onsite_queue_entries%rowtype;
  v_blocker public.vaccination_onsite_queue_entries%rowtype;
  v_blocker_session record;
  v_result jsonb;
  v_entry_id bigint;
  v_entry_json jsonb;
  v_updated_entry public.vaccination_onsite_queue_entries%rowtype;
begin
  select array_agg(distinct trim(k) order by trim(k))
  into v_keys
  from unnest(coalesce(p_identity_keys, '{}'::text[])) as k
  where trim(coalesce(k, '')) <> '';

  if coalesce(cardinality(v_keys), 0) = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'GLOBAL_IDENTITY_REQUIRED',
      'message', 'Identitas peserta untuk validasi lintas session tidak tersedia.'
    );
  end if;

  -- Serialize simultaneous claims for the same identity.
  for v_lock_key in
    select unnest(v_keys) order by 1
  loop
    perform pg_advisory_xact_lock(hashtext(v_lock_key));
  end loop;

  -- Re-opening/resubmitting the same event must return the existing queue,
  -- not be rejected as a cross-session duplicate.
  select *
  into v_same_event
  from public.vaccination_onsite_queue_entries
  where event_id = p_event_id
    and employee_id_key = p_employee_id_key
  order by id desc
  limit 1;

  if found then
    update public.vaccination_onsite_queue_entries
    set identity_keys = (
      select array_agg(distinct x order by x)
      from unnest(coalesce(identity_keys, '{}'::text[]) || v_keys) as x
    ),
    updated_at = now()
    where id = v_same_event.id
    returning * into v_same_event;

    return jsonb_build_object(
      'ok', true,
      'created', false,
      'entry', to_jsonb(v_same_event)
    );
  end if;

  -- STRICT RULE:
  -- any matching participant in any OTHER event blocks a new queue unless
  -- that previous entry is explicitly CANCELLED.
  select e.*
  into v_blocker
  from public.vaccination_onsite_queue_entries e
  where e.event_id <> p_event_id
    and upper(coalesce(e.queue_status, '')) <> 'CANCELLED'
    and coalesce(e.identity_keys, '{}'::text[]) && v_keys
  order by e.id desc
  limit 1;

  if found then
    select
      ev.session_id,
      s.session_name,
      s.company_name,
      s.location,
      s.session_date
    into v_blocker_session
    from public.vaccination_onsite_queue_events ev
    left join public.vaccination_sessions s on s.id = ev.session_id
    where ev.id = v_blocker.event_id;

    return jsonb_build_object(
      'ok', false,
      'code', 'ALREADY_QUEUED_OTHER_SESSION',
      'message',
        'Peserta sudah pernah mengambil antrean pada session/lokasi lain dan status sebelumnya bukan Cancel. Antrean baru tidak diperbolehkan. Hubungi petugas jika antrean sebelumnya seharusnya dibatalkan.',
      'previous',
        jsonb_build_object(
          'queue_number', v_blocker.queue_number,
          'queue_status', v_blocker.queue_status,
          'session_id', v_blocker_session.session_id,
          'session_name', v_blocker_session.session_name,
          'company_name', v_blocker_session.company_name,
          'location', v_blocker_session.location,
          'session_date', v_blocker_session.session_date
        )
    );
  end if;

  -- Existing event-local numbering / duplicate protection stays in V2.
  v_result := public.vaccination_onsite_claim_queue_v2(
    p_event_id,
    p_participant_name,
    p_employee_id,
    p_employee_id_key,
    p_phone
  );

  if coalesce((v_result->>'ok')::boolean, false) is false then
    return v_result;
  end if;

  begin
    v_entry_id := nullif(v_result #>> '{entry,id}', '')::bigint;
  exception
    when others then
      v_entry_id := null;
  end;

  if v_entry_id is not null then
    update public.vaccination_onsite_queue_entries
    set identity_keys = (
      select array_agg(distinct x order by x)
      from unnest(coalesce(identity_keys, '{}'::text[]) || v_keys) as x
    ),
    updated_at = now()
    where id = v_entry_id
    returning * into v_updated_entry;

    v_entry_json := to_jsonb(v_updated_entry);
    if v_entry_json is not null then
      v_result := jsonb_set(v_result, '{entry}', v_entry_json, true);
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function public.vaccination_onsite_identity_key(text,text) from public;
revoke all on function public.vaccination_onsite_claim_queue_v3(bigint,text,text,text,text,text[]) from public;

grant execute on function public.vaccination_onsite_identity_key(text,text) to service_role;
grant execute on function public.vaccination_onsite_claim_queue_v3(bigint,text,text,text,text,text[]) to service_role;

commit;

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vaccination_onsite_queue_entries'
      and column_name = 'identity_keys'
  ) as identity_keys_ready,

  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vaccination_onsite_queue_entries'
      and column_name = 'cancelled_at'
  ) as cancelled_at_ready,

  to_regprocedure(
    'public.vaccination_onsite_claim_queue_v3(bigint,text,text,text,text,text[])'
  ) is not null as claim_queue_v3_ready,

  (
    select count(*)
    from public.vaccination_onsite_queue_entries
    where cardinality(identity_keys) = 0
  ) as historical_rows_without_stable_identity;
