-- WELLNESS_PARTICIPANT_NUTRITION_USE_EXISTING_GS_V397
-- Run in Supabase SQL Editor before testing nutrition save.

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
  add column if not exists google_sheet_row_number integer,
  add column if not exists sync_status text,
  add column if not exists sync_error text,
  add column if not exists updated_at timestamptz;

select pg_notify('pgrst', 'reload schema');
