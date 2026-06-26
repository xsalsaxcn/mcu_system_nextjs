-- WELLNESS_DAILY_INPUT_PRO_V360_SQL
-- Wellness-only additive migration.
-- Aman untuk modul lain: hanya membuat tabel/index wellness_* untuk bukti, healthtalk, dan point.

create table if not exists wellness_daily_evidence (
  id bigserial primary key,
  participant_id bigint not null references wellness_participants(id) on delete cascade,
  company_id bigint references wellness_companies(id) on delete set null,
  log_date date not null default current_date,
  evidence_type text not null,
  source_type text,
  source_id bigint,
  title text,
  evidence_url text,
  file_name text,
  mime_type text,
  notes text,
  status text not null default 'pending',
  reviewed_by bigint,
  reviewed_at timestamptz,
  review_notes text,
  created_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wellness_healthtalk_logs (
  id bigserial primary key,
  participant_id bigint not null references wellness_participants(id) on delete cascade,
  company_id bigint references wellness_companies(id) on delete set null,
  event_date date not null default current_date,
  title text not null,
  attendance_type text,
  evidence_url text,
  notes text,
  status text not null default 'pending',
  reviewed_by bigint,
  reviewed_at timestamptz,
  review_notes text,
  created_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wellness_point_logs (
  id bigserial primary key,
  participant_id bigint not null references wellness_participants(id) on delete cascade,
  company_id bigint references wellness_companies(id) on delete set null,
  log_date date not null default current_date,
  point_key text not null,
  source_type text,
  source_id bigint,
  points numeric not null default 0,
  description text,
  status text not null default 'approved',
  reviewed_by bigint,
  reviewed_at timestamptz,
  review_notes text,
  created_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wellness_daily_evidence_participant_date on wellness_daily_evidence(participant_id, log_date desc);
create index if not exists idx_wellness_daily_evidence_company on wellness_daily_evidence(company_id);
create index if not exists idx_wellness_daily_evidence_status on wellness_daily_evidence(status);
create index if not exists idx_wellness_healthtalk_logs_participant_date on wellness_healthtalk_logs(participant_id, event_date desc);
create index if not exists idx_wellness_healthtalk_logs_company on wellness_healthtalk_logs(company_id);
create index if not exists idx_wellness_healthtalk_logs_status on wellness_healthtalk_logs(status);
create index if not exists idx_wellness_point_logs_participant_date on wellness_point_logs(participant_id, log_date desc);
create index if not exists idx_wellness_point_logs_company on wellness_point_logs(company_id);
create index if not exists idx_wellness_point_logs_key on wellness_point_logs(point_key);
