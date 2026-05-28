-- Vaccination Module Phase 2 Migration
-- Jalankan di Supabase SQL Editor setelah Phase 1.

alter table public.vaccination_sessions
  add column if not exists source_id bigint,
  add column if not exists source_name text,
  add column if not exists default_vaccine_id bigint,
  add column if not exists default_lot_id bigint;

alter table public.vaccination_registrations
  add column if not exists source_id bigint,
  add column if not exists participant_id bigint,
  add column if not exists mcu_id text;

create index if not exists idx_vaccination_sessions_source_id
  on public.vaccination_sessions(source_id);

create index if not exists idx_vaccination_reg_source_id
  on public.vaccination_registrations(source_id);

create index if not exists idx_vaccination_reg_participant_id
  on public.vaccination_registrations(participant_id);

create index if not exists idx_vaccination_reg_mcu_id
  on public.vaccination_registrations(mcu_id);
