-- WELLNESS_DASHBOARD_NAKES_ACTIVITY_LOG_V377_SQL
-- Wellness-only guard. Ensures dashboard can read NAKES clinical history and activity logs.

create table if not exists wellness_checkup_history (
  id bigserial primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table wellness_checkup_history
  add column if not exists company_name text,
  add column if not exists participant_id bigint,
  add column if not exists employee_code text,
  add column if not exists lab_no text,
  add column if not exists checkup_date date,
  add column if not exists history_type text default 'baseline_mcu',
  add column if not exists visit_label text,
  add column if not exists risk_cluster text,
  add column if not exists risk_level text,
  add column if not exists hba1c_percent numeric,
  add column if not exists glucose_value numeric,
  add column if not exists systolic numeric,
  add column if not exists diastolic numeric,
  add column if not exists bmi numeric,
  add column if not exists weight_kg numeric,
  add column if not exists height_cm numeric,
  add column if not exists waist_cm numeric,
  add column if not exists intervention_focus text,
  add column if not exists monitoring_plan text,
  add column if not exists medical_validation_notes text,
  add column if not exists program_status text,
  add column if not exists raw_payload jsonb default '{}'::jsonb;

create index if not exists idx_wellness_checkup_history_participant_date
on wellness_checkup_history(participant_id, checkup_date desc);

create index if not exists idx_wellness_checkup_history_employee_code
on wellness_checkup_history(employee_code);

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
  add column if not exists activity_type text,
  add column if not exists activity_name text,
  add column if not exists duration_minutes numeric,
  add column if not exists elapsed_minutes numeric,
  add column if not exists distance_km numeric,
  add column if not exists calories numeric,
  add column if not exists evidence_url text,
  add column if not exists notes text,
  add column if not exists raw_payload jsonb default '{}'::jsonb,
  add column if not exists synced_at timestamptz,
  add column if not exists updated_at timestamptz default now();

create unique index if not exists idx_wellness_activity_logs_external_unique
on wellness_activity_logs(participant_id, source, external_activity_id)
where external_activity_id is not null and external_activity_id <> '';

create index if not exists idx_wellness_activity_logs_participant_date
on wellness_activity_logs(participant_id, log_date desc);

select pg_notify('pgrst', 'reload schema');
