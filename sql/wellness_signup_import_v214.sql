-- WELLNESS_SIGNUP_IMPORT_V214
-- Jalankan setelah sql/wellness_schema_v212.sql.
-- File ini hanya menambah tabel signup/consent Wellness dan tidak mengubah modul CAPASKA/MCU/Vaksinasi.

create table if not exists wellness_signup_otps (
  id bigserial primary key,
  participant_id bigint not null references wellness_participants(id) on delete cascade,
  employee_no text not null,
  email text,
  phone text,
  otp_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_wellness_signup_otps_participant_created on wellness_signup_otps(participant_id, created_at desc);
create index if not exists idx_wellness_signup_otps_employee_no on wellness_signup_otps(employee_no);

create table if not exists wellness_strava_consents (
  id bigserial primary key,
  participant_id bigint not null unique references wellness_participants(id) on delete cascade,
  approved integer not null default 0,
  approved_at timestamptz,
  revoked_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Kolom code di wellness_participants dipakai sebagai No Karyawan existing.
-- Import peserta Wellness akan melakukan upsert berdasarkan wellness_participants.code.
