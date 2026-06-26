-- WELLNESS_SETTINGS_V350
-- Wellness-only additive migration.
-- Aman untuk modul lain: hanya membuat/mengubah tabel wellness_*.

create table if not exists wellness_companies (
  id bigserial primary key,
  name text not null unique,
  description text,
  is_active integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wellness_group_units (
  id bigserial primary key,
  company_id bigint references wellness_companies(id) on delete cascade,
  parent_id bigint references wellness_group_units(id) on delete cascade,
  unit_type text not null default 'kelompok',
  name text not null,
  coach_name text,
  coach_contact text,
  description text,
  is_active integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, parent_id, unit_type, name)
);

create table if not exists wellness_program_parameters (
  id bigserial primary key,
  company_id bigint references wellness_companies(id) on delete cascade,
  parameter_key text not null,
  label text not null,
  frequency text,
  filled_by text,
  is_enabled integer not null default 1,
  config_json jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, parameter_key)
);

create table if not exists wellness_mini_mcu_parameters (
  id bigserial primary key,
  company_id bigint references wellness_companies(id) on delete cascade,
  parameter_key text not null,
  label text not null,
  unit text,
  is_enabled integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, parameter_key)
);

create table if not exists wellness_mini_mcu_logs (
  id bigserial primary key,
  participant_id bigint not null references wellness_participants(id) on delete cascade,
  company_id bigint references wellness_companies(id) on delete set null,
  exam_date date not null default current_date,
  examiner_name text,
  weight_kg numeric,
  bmi numeric,
  waist_cm numeric,
  sbp numeric,
  dbp numeric,
  glucose numeric,
  hba1c numeric,
  total_cholesterol numeric,
  ldl numeric,
  hdl numeric,
  triglyceride numeric,
  uric_acid numeric,
  notes text,
  created_by bigint,
  created_at timestamptz not null default now()
);

alter table wellness_participants add column if not exists wellness_company_id bigint references wellness_companies(id) on delete set null;
alter table wellness_participants add column if not exists wellness_kelompok_id bigint references wellness_group_units(id) on delete set null;
alter table wellness_participants add column if not exists wellness_group_unit_id bigint references wellness_group_units(id) on delete set null;
alter table wellness_participants add column if not exists baseline_mcu_date date;
alter table wellness_participants add column if not exists baseline_hba1c numeric;
alter table wellness_participants add column if not exists baseline_glucose numeric;
alter table wellness_participants add column if not exists baseline_sbp numeric;
alter table wellness_participants add column if not exists baseline_dbp numeric;
alter table wellness_participants add column if not exists baseline_waist_cm numeric;
alter table wellness_participants add column if not exists baseline_bmi numeric;
alter table wellness_participants add column if not exists baseline_risk_group text;
alter table wellness_participants add column if not exists baseline_notes text;

create index if not exists idx_wellness_group_units_company on wellness_group_units(company_id);
create index if not exists idx_wellness_group_units_parent on wellness_group_units(parent_id);
create index if not exists idx_wellness_participants_company on wellness_participants(wellness_company_id);
create index if not exists idx_wellness_participants_kelompok on wellness_participants(wellness_kelompok_id);
create index if not exists idx_wellness_participants_group_unit on wellness_participants(wellness_group_unit_id);
create index if not exists idx_wellness_mini_mcu_logs_participant_date on wellness_mini_mcu_logs(participant_id, exam_date desc);
