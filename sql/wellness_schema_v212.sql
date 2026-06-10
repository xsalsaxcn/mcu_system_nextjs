-- WELLNESS_SCHEMA_V212
-- Jalankan file ini di Supabase SQL Editor sebelum memakai layanan Wellness.
-- File ini hanya menambahkan tabel wellness_* dan tidak mengubah tabel CAPASKA, MCU Corporate, atau Vaksinasi.

create table if not exists wellness_groups (
  id bigserial primary key,
  name text not null unique,
  leader_name text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wellness_participants (
  id bigserial primary key,
  user_id bigint,
  group_id bigint references wellness_groups(id) on delete set null,
  coach_id bigint,
  code text unique,
  name text not null,
  gender text,
  phone text,
  email text,
  birth_date date,
  height_cm numeric,
  initial_weight_kg numeric,
  target_weight_kg numeric,
  program_start_date date,
  is_active integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wellness_food_calories (
  id bigserial primary key,
  food_name text not null unique,
  calories numeric not null default 0,
  category text,
  aliases text,
  is_active integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wellness_activity_calories (
  id bigserial primary key,
  activity_name text not null unique,
  met numeric,
  calories_per_km numeric,
  unit text default 'menit',
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wellness_weight_logs (
  id bigserial primary key,
  participant_id bigint not null references wellness_participants(id) on delete cascade,
  log_date date not null default current_date,
  weight_kg numeric,
  waist_cm numeric,
  bmi numeric,
  bmi_status text,
  notes text,
  created_by bigint,
  created_at timestamptz not null default now()
);

create table if not exists wellness_food_logs (
  id bigserial primary key,
  participant_id bigint not null references wellness_participants(id) on delete cascade,
  log_date date not null default current_date,
  meal_time text,
  meal_text text,
  detected_foods text,
  total_calories numeric,
  photo_url text,
  created_by bigint,
  created_at timestamptz not null default now()
);

create table if not exists wellness_activity_logs (
  id bigserial primary key,
  participant_id bigint not null references wellness_participants(id) on delete cascade,
  log_date date not null default current_date,
  source text not null default 'manual',
  activity_type text,
  duration_minutes numeric,
  distance_km numeric,
  calories numeric,
  strava_activity_id text unique,
  notes text,
  raw_payload jsonb,
  created_by bigint,
  created_at timestamptz not null default now()
);

create table if not exists wellness_strava_connections (
  id bigserial primary key,
  participant_id bigint not null unique references wellness_participants(id) on delete cascade,
  strava_athlete_id text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  expires_at timestamptz,
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_wellness_participants_user_id on wellness_participants(user_id);
create index if not exists idx_wellness_participants_group_id on wellness_participants(group_id);
create index if not exists idx_wellness_food_logs_participant_date on wellness_food_logs(participant_id, log_date desc);
create index if not exists idx_wellness_weight_logs_participant_date on wellness_weight_logs(participant_id, log_date desc);
create index if not exists idx_wellness_activity_logs_participant_date on wellness_activity_logs(participant_id, log_date desc);

-- Opsional: contoh akun admin wellness. Password plain mengikuti pola sistem saat ini.
-- Ubah password setelah dibuat jika dipakai.
insert into wellness_groups (name, leader_name)
values ('Wellness Default', 'Coach Wellness')
on conflict (name) do nothing;

-- Jika ingin membuat user peserta, buat dulu di tabel users, lalu isi user_id di wellness_participants.
-- Contoh:
-- insert into users (name, username, password, role, program_type, is_active)
-- values ('Peserta Wellness Demo', 'wellness_demo', 'demo123', 'wellness_participant', 'wellness', 1)
-- on conflict do nothing;
