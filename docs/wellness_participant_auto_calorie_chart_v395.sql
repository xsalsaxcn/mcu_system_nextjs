-- WELLNESS_PARTICIPANT_AUTO_CALORIE_CHART_V395
-- Run this in Supabase SQL Editor before testing the v395 participant portal patch.

alter table if exists wellness_food_logs
  add column if not exists photo_url text,
  add column if not exists photo_path text,
  add column if not exists calorie_source text,
  add column if not exists calorie_reference_id bigint,
  add column if not exists calorie_match_status text;

alter table if exists wellness_activity_logs
  add column if not exists steps numeric;

-- Optional storage bucket for food photos.
-- The API can create this bucket automatically using service-role access.
-- This SQL is included so the bucket also exists when API bucket creation is restricted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wellness-nutrition-photos',
  'wellness-nutrition-photos',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

select pg_notify('pgrst', 'reload schema');
