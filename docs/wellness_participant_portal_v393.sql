-- WELLNESS_PARTICIPANT_PORTAL_V393_SQL
-- Run this in Supabase SQL Editor, not in Windows CMD.

alter table wellness_participants
  add column if not exists portal_username text,
  add column if not exists portal_email text,
  add column if not exists portal_phone text,
  add column if not exists portal_email_verified_at timestamptz,
  add column if not exists portal_phone_verified_at timestamptz,
  add column if not exists portal_registered_at timestamptz;

create unique index if not exists idx_wellness_participants_portal_username
on wellness_participants(lower(portal_username))
where portal_username is not null and portal_username <> '';

create table if not exists wellness_food_logs (
  id bigserial primary key,
  participant_id bigint not null,
  log_date date not null default current_date,
  meal_type text,
  food_name text,
  portion text,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  notes text,
  source text default 'manual',
  raw_payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table wellness_food_logs
  add column if not exists participant_id bigint,
  add column if not exists log_date date default current_date,
  add column if not exists meal_type text,
  add column if not exists food_name text,
  add column if not exists portion text,
  add column if not exists calories numeric,
  add column if not exists protein_g numeric,
  add column if not exists carbs_g numeric,
  add column if not exists fat_g numeric,
  add column if not exists notes text,
  add column if not exists source text default 'manual',
  add column if not exists raw_payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_wellness_food_logs_participant_date
on wellness_food_logs(participant_id, log_date desc);

alter table wellness_activity_logs
  add column if not exists started_at timestamptz,
  add column if not exists external_activity_id text,
  add column if not exists provider_activity_id text,
  add column if not exists source text default 'manual',
  add column if not exists activity_type text,
  add column if not exists activity_name text,
  add column if not exists duration_minutes numeric,
  add column if not exists calories numeric,
  add column if not exists distance_km numeric,
  add column if not exists steps integer,
  add column if not exists raw_payload jsonb default '{}'::jsonb;

create index if not exists idx_wellness_activity_logs_participant_source
on wellness_activity_logs(participant_id, source);

create index if not exists idx_wellness_activity_logs_started_at
on wellness_activity_logs(started_at);

select pg_notify('pgrst', 'reload schema');
