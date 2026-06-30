-- WELLNESS_PARTICIPANT_ALL_FORMS_EXISTING_GS_V398_SQL
-- Run in Supabase SQL Editor, not CMD.

alter table wellness_food_logs
  add column if not exists photo_url text,
  add column if not exists photo_path text,
  add column if not exists google_drive_file_id text,
  add column if not exists google_drive_url text,
  add column if not exists google_drive_preview_url text,
  add column if not exists calorie_source text,
  add column if not exists calorie_reference_id bigint,
  add column if not exists calorie_match_status text,
  add column if not exists google_sheet_synced_at timestamptz,
  add column if not exists google_sheet_row_number bigint,
  add column if not exists sync_status text,
  add column if not exists sync_error text;

alter table wellness_activity_logs
  add column if not exists steps numeric;

create table if not exists wellness_healthtalk_logs (
  id bigserial primary key,
  participant_id bigint not null,
  log_date date not null,
  healthtalk_type text,
  healthtalk_title text,
  notes text,
  evidence_url text,
  evidence_preview_url text,
  google_drive_file_id text,
  google_drive_folder_path text,
  google_sheet_row_number bigint,
  sync_status text,
  sync_error text,
  raw_payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_wellness_healthtalk_logs_participant_date
on wellness_healthtalk_logs(participant_id, log_date);

select pg_notify('pgrst', 'reload schema');
