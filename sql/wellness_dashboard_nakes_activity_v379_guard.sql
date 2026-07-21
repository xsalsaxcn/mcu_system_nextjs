-- WELLNESS_DASHBOARD_NAKES_ACTIVITY_LOG_V379_SQL_GUARD
-- Safe guard only for Wellness dashboard history/activity reading.

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
  add column if not exists selection_reason text,
  add column if not exists hba1c_raw text,
  add column if not exists hba1c_percent numeric,
  add column if not exists glucose_value numeric,
  add column if not exists bp_raw text,
  add column if not exists systolic numeric,
  add column if not exists diastolic numeric,
  add column if not exists pulse numeric,
  add column if not exists bmi numeric,
  add column if not exists weight_kg numeric,
  add column if not exists height_cm numeric,
  add column if not exists waist_cm numeric,
  add column if not exists cholesterol_total numeric,
  add column if not exists ldl numeric,
  add column if not exists hdl numeric,
  add column if not exists triglyceride numeric,
  add column if not exists uric_acid numeric,
  add column if not exists sgot numeric,
  add column if not exists sgpt numeric,
  add column if not exists risk_score numeric,
  add column if not exists criteria_count numeric,
  add column if not exists intervention_focus text,
  add column if not exists monitoring_plan text,
  add column if not exists medical_validation_notes text,
  add column if not exists program_status text,
  add column if not exists next_followup_date date,
  add column if not exists raw_payload jsonb default '{}'::jsonb;

create index if not exists idx_wellness_checkup_history_participant_id on wellness_checkup_history(participant_id);
create index if not exists idx_wellness_checkup_history_employee_code on wellness_checkup_history(employee_code);
create index if not exists idx_wellness_checkup_history_type_date on wellness_checkup_history(history_type, checkup_date);
create index if not exists idx_wellness_checkup_history_participant_date on wellness_checkup_history(participant_id, checkup_date desc);

select pg_notify('pgrst', 'reload schema');
