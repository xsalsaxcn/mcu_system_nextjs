-- Vaccination validation final guard v129
-- Run this in Supabase SQL editor.

alter table if exists public.vaccination_sessions
  add column if not exists print_label_handler text not null default 'MEDIS';

alter table if exists public.vaccination_registrations
  add column if not exists validation_status text,
  add column if not exists print_status text,
  add column if not exists printed_by text,
  add column if not exists printed_at timestamptz,
  add column if not exists validated_by text,
  add column if not exists validated_at timestamptz,
  add column if not exists cancelled_by text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_note text;

create table if not exists public.vaccination_session_print_settings (
  session_key text primary key,
  session_id text,
  session_name text,
  print_label_handler text not null default 'MEDIS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vaccination_sessions_print_label_handler_idx
  on public.vaccination_sessions (print_label_handler);

create index if not exists vaccination_session_print_settings_handler_idx
  on public.vaccination_session_print_settings (print_label_handler);

create index if not exists vaccination_registrations_validation_status_idx
  on public.vaccination_registrations (validation_status);

create index if not exists vaccination_registrations_print_status_idx
  on public.vaccination_registrations (print_status);
