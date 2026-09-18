-- V153.18 SAFE - Vaccination product import mapping
-- Scope: vaccination_* only. Does NOT touch CAPASKA, MCU, Wellness, Sticker, or Reminder.
-- Run once in Supabase SQL Editor before using "Import Produk & Lot" on Vaccination Master.

create table if not exists public.vaccination_product_mappings (
  id bigserial primary key,
  source_system text not null default 'ODOO_STOCK_QUANT',
  external_product_key text not null,
  external_product_code text,
  external_product_name text not null,
  external_product_label text,
  source_location text,
  vaccine_id bigint not null references public.vaccination_vaccines(id) on delete cascade,
  active boolean not null default true,
  last_imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_system, external_product_key),
  unique(source_system, vaccine_id)
);

create index if not exists idx_vaccination_product_mappings_vaccine
  on public.vaccination_product_mappings(vaccine_id, active);

create index if not exists idx_vaccination_product_mappings_source
  on public.vaccination_product_mappings(source_system, active);

comment on table public.vaccination_product_mappings is
  'Mapping product source external (e.g. Odoo stock.quant) ke vaccination_vaccines. V153.18.';
