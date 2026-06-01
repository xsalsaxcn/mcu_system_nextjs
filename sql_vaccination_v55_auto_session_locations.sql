-- V55 - Vaccination only: auto session locations from imported vaccination Excel.
-- Scope: hanya tabel vaccination_* dan kolom session vaksinasi. Tidak mengubah flow MCU Corporate / CAPASKA.

create table if not exists public.vaccination_import_rows (
  id bigserial primary key,
  source_id bigint not null,
  participant_id bigint,
  mcu_id text,
  external_id text,
  participant_name text,
  nik text,
  gender text,
  batch_name text,
  time_area_name text,
  time_name text,
  location_name text,
  session_date date,
  time_slot text,
  import_location_key text,
  email text,
  phone text,
  marital_status text,
  nationality_text text,
  employee_type text,
  raw_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vaccination_import_rows_source
  on public.vaccination_import_rows(source_id);

create index if not exists idx_vaccination_import_rows_location_key
  on public.vaccination_import_rows(source_id, import_location_key);

create index if not exists idx_vaccination_import_rows_participant
  on public.vaccination_import_rows(participant_id);

alter table if exists public.vaccination_sessions
  add column if not exists time_slot text,
  add column if not exists import_location_key text,
  add column if not exists import_time_area_name text,
  add column if not exists participant_count_planned integer;

create index if not exists idx_vaccination_sessions_location_key
  on public.vaccination_sessions(source_id, import_location_key);
