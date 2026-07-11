-- CORPORATE_SETUP_PERSISTENCE_V411
-- Jalankan satu kali melalui Supabase Dashboard -> SQL Editor.

create table if not exists public.corporate_mcu_pdf_setups (
  source_id bigint primary key references public.participant_sources(id) on delete cascade,
  signatories jsonb not null default '{}'::jsonb,
  updated_by bigint null,
  updated_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_corporate_mcu_pdf_setups_updated_at
  on public.corporate_mcu_pdf_setups(updated_at desc);

alter table public.corporate_mcu_pdf_setups enable row level security;

comment on table public.corporate_mcu_pdf_setups is
  'Penyimpanan setup nama petugas/penanggung jawab PDF MCU Corporate per participant_sources.source_id.';
