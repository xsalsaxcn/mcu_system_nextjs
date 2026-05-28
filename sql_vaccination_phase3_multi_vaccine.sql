-- Vaccination Module Phase 3 Migration
-- Multi vaksin per session/perusahaan.
-- Jalankan di Supabase SQL Editor setelah Phase 1/2.

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
