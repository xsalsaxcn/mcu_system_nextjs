-- V57 - Vaccination operational foundation
-- Scope: hanya tabel vaccination_*. Tidak menyentuh MCU Corporate atau CAPASKA.

alter table if exists public.vaccination_registrations
  add column if not exists nik text,
  add column if not exists payment_price numeric,
  add column if not exists payment_method text,
  add column if not exists payment_note text,
  add column if not exists status_note text,
  add column if not exists last_product_change_at timestamptz,
  add column if not exists last_product_change_by text;

alter table if exists public.vaccination_vaccines
  add column if not exists price numeric,
  add column if not exists price_category text;

alter table if exists public.vaccination_vaccine_lots
  add column if not exists stock_added integer not null default 0,
  add column if not exists stock_physical_count integer,
  add column if not exists inventory_notes text;

create table if not exists public.vaccination_registration_items (
  id bigserial primary key,
  registration_id bigint not null references public.vaccination_registrations(id) on delete cascade,
  session_id bigint references public.vaccination_sessions(id) on delete cascade,
  vaccine_id bigint references public.vaccination_vaccines(id) on delete restrict,
  lot_id bigint references public.vaccination_vaccine_lots(id) on delete restrict,
  dose_number integer not null default 1,
  price_category text,
  price numeric,
  payment_method text,
  payment_note text,
  item_note text,
  item_source text not null default 'registration',
  status text not null default 'WAITING',
  active boolean not null default true,
  administered_record_id bigint references public.vaccination_records(id) on delete set null,
  administered_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vaccination_registration_items_registration
  on public.vaccination_registration_items(registration_id);

create index if not exists idx_vaccination_registration_items_session
  on public.vaccination_registration_items(session_id);

create index if not exists idx_vaccination_registration_items_lot
  on public.vaccination_registration_items(lot_id, active, status);

create table if not exists public.vaccination_inventory_movements (
  id bigserial primary key,
  vaccine_id bigint references public.vaccination_vaccines(id) on delete set null,
  lot_id bigint references public.vaccination_vaccine_lots(id) on delete set null,
  movement_type text not null,
  qty integer not null default 0,
  reference_type text,
  reference_id bigint,
  notes text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vaccination_inventory_movements_lot
  on public.vaccination_inventory_movements(lot_id, created_at);

create index if not exists idx_vaccination_reg_queue_status
  on public.vaccination_registrations(queue_status);

-- Backfill item layanan untuk registrasi lama yang sudah punya vaccine_id tetapi belum punya item.
insert into public.vaccination_registration_items (
  registration_id,
  session_id,
  vaccine_id,
  lot_id,
  dose_number,
  price_category,
  price,
  payment_method,
  payment_note,
  item_source,
  status,
  active,
  created_by
)
select
  r.id,
  r.session_id,
  r.vaccine_id,
  s.default_lot_id,
  1,
  v.price_category,
  v.price,
  r.payment_method,
  r.payment_note,
  'backfill',
  case when upper(coalesce(r.queue_status, '')) in ('ADMINISTERED','DONE') then 'ADMINISTERED' else 'WAITING' end,
  true,
  'migration_v57'
from public.vaccination_registrations r
left join public.vaccination_sessions s on s.id = r.session_id
left join public.vaccination_vaccines v on v.id = r.vaccine_id
where r.vaccine_id is not null
  and not exists (
    select 1 from public.vaccination_registration_items i
    where i.registration_id = r.id
      and i.active = true
  );
