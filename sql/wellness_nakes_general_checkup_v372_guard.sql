-- WELLNESS_NAKES_GENERAL_CHECKUP_INPUT_V372_SQL
-- Generalized NAKES input guard. Only touches wellness_checkup_history.
-- WELLNESS_NAKES_MINI_MCU_INPUT_V371_SQL
-- Guard SQL khusus modul Wellness untuk memastikan tabel history pemeriksaan NAKES/Mini MCU tersedia.
-- Tidak mengubah tabel MCU, CAPASKA, Corporate MCU, atau Vaksinasi.

create table if not exists wellness_checkup_history (
  id bigserial primary key,

  company_name text,
  participant_id bigint references wellness_participants(id) on delete cascade,
  employee_code text,
  lab_no text,

  checkup_date date,
  history_type text default 'baseline_mcu',
  visit_label text,

  risk_cluster text,
  risk_level text,
  selection_reason text,

  hba1c_raw text,
  hba1c_percent numeric,
  glucose_value numeric,

  bp_raw text,
  systolic numeric,
  diastolic numeric,

  bmi numeric,
  weight_kg numeric,
  height_cm numeric,
  waist_cm numeric,

  risk_score numeric,
  criteria_count numeric,

  intervention_focus text,
  monitoring_plan text,
  medical_validation_notes text,
  program_status text,

  raw_payload jsonb default '{}'::jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_wellness_checkup_history_participant_id
on wellness_checkup_history(participant_id);

create index if not exists idx_wellness_checkup_history_employee_code
on wellness_checkup_history(employee_code);

create index if not exists idx_wellness_checkup_history_company
on wellness_checkup_history(company_name);

create index if not exists idx_wellness_checkup_history_type_date
on wellness_checkup_history(history_type, checkup_date);

create index if not exists idx_wellness_checkup_history_participant_date
on wellness_checkup_history(participant_id, checkup_date desc);
