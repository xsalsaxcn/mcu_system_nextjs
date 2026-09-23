begin;

-- V153.30 SAFE - Vaccination Onsite Queue Web Push ONLY.
-- Does not alter Existing Queue, CAPASKA, MCU, Wellness, Reminder, Sticker, Master, Session, or Dashboard.

create table if not exists public.vaccination_onsite_push_subscriptions (
  id bigserial primary key,
  entry_id bigint not null references public.vaccination_onsite_queue_entries(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(endpoint)
);

create index if not exists idx_vaccination_onsite_push_entry_enabled
  on public.vaccination_onsite_push_subscriptions(entry_id, enabled);

alter table public.vaccination_onsite_push_subscriptions enable row level security;

revoke all on table public.vaccination_onsite_push_subscriptions from public;
revoke all on table public.vaccination_onsite_push_subscriptions from anon;
revoke all on table public.vaccination_onsite_push_subscriptions from authenticated;
grant all on table public.vaccination_onsite_push_subscriptions to service_role;

revoke all on sequence public.vaccination_onsite_push_subscriptions_id_seq from public;
revoke all on sequence public.vaccination_onsite_push_subscriptions_id_seq from anon;
revoke all on sequence public.vaccination_onsite_push_subscriptions_id_seq from authenticated;
grant usage, select on sequence public.vaccination_onsite_push_subscriptions_id_seq to service_role;

commit;

select
  to_regclass('public.vaccination_onsite_push_subscriptions') is not null as push_table_ready,
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_vaccination_onsite_push_entry_enabled'
  ) as push_index_ready;
