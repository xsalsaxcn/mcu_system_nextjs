-- WELLNESS_PARTICIPANT_NUTRITION_GOOGLE_SHEET_DRIVE_V396
-- Run in Supabase SQL Editor. This only supports the portal mirror table.
-- Google Sheet/Drive remain the primary external storage for participant nutrition evidence.

alter table wellness_food_logs
  add column if not exists photo_url text,
  add column if not exists photo_path text,
  add column if not exists calorie_source text,
  add column if not exists calorie_reference_id bigint,
  add column if not exists calorie_match_status text,
  add column if not exists food_reference_name text;

create index if not exists idx_wellness_food_logs_participant_log_date
on wellness_food_logs(participant_id, log_date);

create index if not exists idx_wellness_food_logs_calorie_match_status
on wellness_food_logs(calorie_match_status);

select pg_notify('pgrst', 'reload schema');
