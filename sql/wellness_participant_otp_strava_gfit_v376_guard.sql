-- WELLNESS_PARTICIPANT_OTP_STRAVA_GFIT_V376
-- Wellness-only guard SQL. Adds OTP-gated participant portal, integration token storage,
-- and app activity history fields for Strava/Google Fit/manual workout history.

create table if not exists wellness_signup_otps (
  id bigserial primary key,
  participant_id bigint,
  employee_no text,
  email text,
  phone text,
  otp_hash text,
  expires_at timestamptz,
  used_at timestamptz,
  attempts integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_wellness_signup_otps_participant
on wellness_signup_otps(participant_id, created_at desc);

create table if not exists wellness_participant_sessions (
  id bigserial primary key,
  participant_id bigint not null,
  session_token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_wellness_participant_sessions_participant
on wellness_participant_sessions(participant_id, expires_at desc);

create table if not exists wellness_integrations (
  id bigserial primary key,
  participant_id bigint not null,
  provider text not null,
  provider_user_id text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  expires_at timestamptz,
  scope text,
  is_active boolean default true,
  connected_at timestamptz default now(),
  last_sync_at timestamptz,
  raw_profile jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_wellness_integrations_provider_unique
on wellness_integrations(participant_id, provider);

create index if not exists idx_wellness_integrations_participant
on wellness_integrations(participant_id, provider, is_active);

create table if not exists wellness_activity_logs (
  id bigserial primary key,
  participant_id bigint not null,
  log_date date not null default current_date,
  source text default 'manual',
  external_activity_id text,
  activity_type text,
  activity_name text,
  duration_minutes numeric,
  elapsed_minutes numeric,
  distance_km numeric,
  calories numeric,
  evidence_url text,
  notes text,
  raw_payload jsonb default '{}'::jsonb,
  synced_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table wellness_activity_logs
  add column if not exists source text default 'manual',
  add column if not exists external_activity_id text,
  add column if not exists activity_name text,
  add column if not exists duration_minutes numeric,
  add column if not exists elapsed_minutes numeric,
  add column if not exists distance_km numeric,
  add column if not exists calories numeric,
  add column if not exists evidence_url text,
  add column if not exists raw_payload jsonb default '{}'::jsonb,
  add column if not exists synced_at timestamptz,
  add column if not exists updated_at timestamptz default now();

create unique index if not exists idx_wellness_activity_logs_external_unique
on wellness_activity_logs(participant_id, source, external_activity_id)
where external_activity_id is not null and external_activity_id <> '';

create index if not exists idx_wellness_activity_logs_participant_date
on wellness_activity_logs(participant_id, log_date desc);

select pg_notify('pgrst', 'reload schema');
