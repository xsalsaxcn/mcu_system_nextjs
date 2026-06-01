-- Vaccination Module Phase 4 Migration
-- 1) Multi vaksin per session.
-- 2) Import peserta corporate tidak langsung membuat nomor antrian.
-- 3) Nomor antrian dirilis saat registrasi ulang / kedatangan.

create table if not exists public.vaccination_session_vaccines (
  id bigserial primary key,
  session_id bigint not null references public.vaccination_sessions(id) on delete cascade,
  vaccine_id bigint not null references public.vaccination_vaccines(id) on delete restrict,
  lot_id bigint not null references public.vaccination_vaccine_lots(id) on delete restrict,
  dose_number integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, vaccine_id, lot_id, dose_number)
);

create index if not exists idx_vaccination_session_vaccines_session_id
  on public.vaccination_session_vaccines(session_id);

create index if not exists idx_vaccination_session_vaccines_vaccine_id
  on public.vaccination_session_vaccines(vaccine_id);

create index if not exists idx_vaccination_session_vaccines_lot_id
  on public.vaccination_session_vaccines(lot_id);

alter table public.vaccination_registrations
  alter column queue_number drop not null;

alter table public.vaccination_registrations
  drop constraint if exists vaccination_registrations_session_id_queue_number_key;

create unique index if not exists ux_vaccination_registrations_session_queue_number_not_null
  on public.vaccination_registrations(session_id, queue_number)
  where queue_number is not null;

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
