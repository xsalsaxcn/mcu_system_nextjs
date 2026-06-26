-- WELLNESS_HISTORY_IMPORT_V352_SQL
-- Wellness-only additive migration.
-- Aman untuk modul lain: hanya membuat tabel/index wellness_checkup_history.

create table if not exists wellness_checkup_history (
  id bigserial primary key,
  company_id bigint references wellness_companies(id) on delete set null,
  participant_id bigint not null references wellness_participants(id) on delete cascade,
  employee_code text,
  lab_no text,
  participant_name text,
  sex text,
  department text,
  position text,
  checkup_date date,
  history_type text not null default 'baseline_mcu',
  visit_label text,
  risk_cluster text,
  risk_level text,
  selection_reason text,
  hba1c_raw text,
  hba1c_percent numeric,
  hba1c_flag boolean,
  bp_raw text,
  systolic numeric,
  diastolic numeric,
  bp_flag boolean,
  height_cm numeric,
  weight_kg numeric,
  bmi numeric,
  bmi_flag boolean,
  waist_cm numeric,
  glucose_value numeric,
  criteria_count integer,
  risk_score numeric,
  intervention_focus text,
  monitoring_plan text,
  medical_validation_notes text,
  program_status text,
  raw_payload jsonb,
  created_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wellness_checkup_history_participant_date on wellness_checkup_history(participant_id, checkup_date desc);
create index if not exists idx_wellness_checkup_history_company on wellness_checkup_history(company_id);
create index if not exists idx_wellness_checkup_history_employee_code on wellness_checkup_history(employee_code);
create index if not exists idx_wellness_checkup_history_type on wellness_checkup_history(history_type);
