-- V64 Vaccination manual BatchName -> vaccine/lot mapping.
-- Jalankan di Supabase SQL Editor sebelum import peserta vaksinasi dari database.

create table if not exists public.vaccination_session_batch_mappings (
  id bigserial primary key,
  session_id bigint not null references public.vaccination_sessions(id) on delete cascade,
  source_id bigint references public.participant_sources(id) on delete cascade,
  source_batch_name text not null,
  vaccine_id bigint not null references public.vaccination_vaccines(id),
  lot_id bigint references public.vaccination_vaccine_lots(id),
  dose_number integer not null default 1,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists vaccination_session_batch_mappings_unique_active
on public.vaccination_session_batch_mappings(session_id, source_id, lower(source_batch_name))
where active = true;

create index if not exists vaccination_session_batch_mappings_session_idx
on public.vaccination_session_batch_mappings(session_id);

create index if not exists vaccination_session_batch_mappings_source_idx
on public.vaccination_session_batch_mappings(source_id);
