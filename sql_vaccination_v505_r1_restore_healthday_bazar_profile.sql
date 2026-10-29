-- V505 R1 — RESTORE HEALTHDAY / BAZAR PROFILE FOR IMPORTED HEALTHDAY SESSIONS
-- SAFE / TARGETED / IDEMPOTENT
--
-- 1) Upgrade existing imported HEALTHDAY sessions that are still LEGACY.
-- 2) Add a DB trigger so future imported HEALTHDAY sessions automatically
--    become HEALTHDAY_BAZAR even if application code sends LEGACY.
-- 3) Does NOT touch manual legacy sessions without import_location_key.

begin;

update public.vaccination_sessions
set existing_queue_profile = 'HEALTHDAY_BAZAR'
where import_location_key is not null
  and upper(coalesce(session_name, '')) like '%HEALTHDAY%'
  and coalesce(upper(trim(existing_queue_profile)), 'LEGACY') <> 'HEALTHDAY_BAZAR';

create or replace function public.vaccination_auto_healthday_bazar_profile()
returns trigger
language plpgsql
as $$
begin
  if new.import_location_key is not null
     and upper(coalesce(new.session_name, '')) like '%HEALTHDAY%'
     and coalesce(upper(trim(new.existing_queue_profile)), 'LEGACY') = 'LEGACY'
  then
    new.existing_queue_profile := 'HEALTHDAY_BAZAR';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vaccination_auto_healthday_bazar_profile
  on public.vaccination_sessions;

create trigger trg_vaccination_auto_healthday_bazar_profile
before insert or update of session_name, import_location_key, existing_queue_profile
on public.vaccination_sessions
for each row
execute function public.vaccination_auto_healthday_bazar_profile();

commit;

notify pgrst, 'reload schema';

-- VERIFY
select
  id,
  session_name,
  company_name,
  location,
  session_date,
  existing_queue_profile,
  existing_flow_config,
  status
from public.vaccination_sessions
where import_location_key is not null
  and upper(coalesce(session_name, '')) like '%HEALTHDAY%'
order by session_date desc nulls last, id desc;
