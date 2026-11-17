-- V6345 Vaccination Reminder Controls. Run in STAGING FIRST, after backup/approval.
-- DDL only, does not change old reminders, clinical records, inventory, or payments.
begin;
create table if not exists public.vaccination_reminder_controls_v6345 (
  id smallint primary key check (id = 1),
  paused boolean not null default false,
  enabled_stages text[] not null default array['H7','H3','H1','H0']::text[],
  enabled_companies text[] not null default '{}'::text[],
  enabled_vaccines text[] not null default '{}'::text[],
  email_subject text not null default '',
  email_body text not null default '',
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint vaccination_reminder_controls_v6345_valid_stage check (enabled_stages <@ array['H7','H3','H1','H0']::text[])
);
insert into public.vaccination_reminder_controls_v6345(id) values (1) on conflict do nothing;
alter table public.vaccination_reminder_controls_v6345 enable row level security;
revoke all on public.vaccination_reminder_controls_v6345 from anon, authenticated;
grant select, update on public.vaccination_reminder_controls_v6345 to service_role;
-- Single transaction, excludes SENT and in-flight SENDING on EITHER channel.
-- CANCELLED persists through sync: upsert_preserve_delivery doesn't overwrite delivery fields.
create or replace function public.vaccination_reminder_cancel_bulk_v6345(p_ids bigint[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_total int; v_cancelled int; v_skipped int;
begin
  if p_ids is null or array_length(p_ids,1) is null or array_length(p_ids,1) > 1000 then
    raise exception 'Invalid selection size';
  end if;
  select count(distinct x) into v_total from unnest(p_ids) x where x > 0;
  with locked as (
    select id from public.vaccination_reminders
      where id in (select distinct x from unnest(p_ids) x)
        and superseded_at is null
        and status not in ('SENT','SENDING','CANCELLED','SUPERSEDED')
        and coalesce(wa_status,'') not in ('SENT','SENDING')
      for update skip locked
  ), changed as (
    update public.vaccination_reminders r set
      status = 'CANCELLED',
      wa_status = case when r.wa_status in ('SENT','SENDING','NOT_APPLICABLE') then r.wa_status else 'CANCELLED' end,
      error_message = 'Dibatalkan massal oleh admin melalui kontrol V6345.',
      updated_at = now()
    where r.id in (select id from locked)
    returning r.id
  ) select count(*) into v_cancelled from changed;
  v_skipped := v_total - v_cancelled;
  return jsonb_build_object('selected',v_total,'cancelled',v_cancelled,'skipped',v_skipped);
end $$;
revoke all on function public.vaccination_reminder_cancel_bulk_v6345(bigint[]) from PUBLIC, anon, authenticated;
grant execute on function public.vaccination_reminder_cancel_bulk_v6345(bigint[]) to service_role;
commit;
select pg_notify('pgrst','reload schema');
