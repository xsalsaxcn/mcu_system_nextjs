-- Corporate Vaccination Module - Phase 1
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.vaccination_vaccines (
  id bigserial primary key,
  name text not null,
  brand text,
  description text,
  dose_count integer not null default 1,
  default_next_dose_days integer,
  reminder_days_before integer[] not null default array[7,3,1],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vaccination_vaccine_lots (
  id bigserial primary key,
  vaccine_id bigint not null references public.vaccination_vaccines(id) on delete cascade,
  lot_number text not null,
  expiry_date date,
  stock_initial integer not null default 0,
  stock_used integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(vaccine_id, lot_number)
);

create table if not exists public.vaccination_sessions (
  id bigserial primary key,
  session_name text not null,
  company_name text,
  location text,
  session_date date,
  public_queue_token text not null default encode(gen_random_bytes(18), 'hex'),
  current_queue_number text,
  current_registration_id bigint,
  status text not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vaccination_registrations (
  id bigserial primary key,
  session_id bigint not null references public.vaccination_sessions(id) on delete cascade,
  vaccine_id bigint references public.vaccination_vaccines(id),
  participant_name text not null,
  employee_id text,
  nik text,
  email text,
  phone text,
  company_name text,
  department text,
  queue_number text not null,
  queue_status text not null default 'WAITING',
  public_token text not null default encode(gen_random_bytes(18), 'hex'),
  registered_by text,
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, queue_number)
);

create table if not exists public.vaccination_records (
  id bigserial primary key,
  registration_id bigint not null references public.vaccination_registrations(id) on delete cascade,
  session_id bigint not null references public.vaccination_sessions(id) on delete cascade,
  participant_name text not null,
  vaccine_id bigint not null references public.vaccination_vaccines(id),
  lot_id bigint not null references public.vaccination_vaccine_lots(id),
  vaccine_name text not null,
  lot_number text not null,
  dose_number integer not null default 1,
  administered_at timestamptz not null default now(),
  administered_by text,
  next_due_date date,
  notes text,
  sticker_printed_at timestamptz,
  status text not null default 'ADMINISTERED',
  created_at timestamptz not null default now()
);

create table if not exists public.vaccination_reminders (
  id bigserial primary key,
  record_id bigint not null references public.vaccination_records(id) on delete cascade,
  registration_id bigint not null references public.vaccination_registrations(id) on delete cascade,
  participant_email text,
  participant_name text,
  vaccine_name text,
  next_due_date date,
  reminder_date date not null,
  status text not null default 'PENDING',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vaccination_lots_vaccine on public.vaccination_vaccine_lots(vaccine_id);
create index if not exists idx_vaccination_sessions_token on public.vaccination_sessions(public_queue_token);
create index if not exists idx_vaccination_reg_session on public.vaccination_registrations(session_id);
create index if not exists idx_vaccination_records_reg on public.vaccination_records(registration_id);
create index if not exists idx_vaccination_reminders_date_status on public.vaccination_reminders(reminder_date, status);
