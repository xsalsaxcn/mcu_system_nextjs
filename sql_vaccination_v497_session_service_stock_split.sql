-- =====================================================================
-- V497 — VACCINATION SESSION SERVICE STOCK SPLIT
-- Healthday (Gratis) vs Bazar (Bayar)
-- Scope: Vaccination ONLY
-- Safe / additive / idempotent / legacy-preserving
--
-- Tujuan:
-- 1. Satu Session memiliki bucket stok terpisah untuk HEALTHDAY dan BAZAR.
-- 2. Existing allocation tetap dianggap HEALTHDAY (backward compatible).
-- 3. Existing lot scope SESSION yang belum punya allocation dibackfill ke HEALTHDAY.
-- 4. Tidak mengubah stock_initial / stock_added / stock_used.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- STEP 1 — ensure base table exists
-- ---------------------------------------------------------------------
create table if not exists public.vaccination_session_stock_allocations (
  id bigserial primary key,
  session_id bigint not null references public.vaccination_sessions(id) on delete cascade,
  vaccine_id bigint not null references public.vaccination_vaccines(id) on delete restrict,
  lot_id bigint not null references public.vaccination_vaccine_lots(id) on delete restrict,
  allocated_qty integer not null default 0 check (allocated_qty >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  dedicated boolean not null default true,
  active boolean not null default true,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- STEP 2 — add service_mode
-- ---------------------------------------------------------------------
alter table public.vaccination_session_stock_allocations
  add column if not exists service_mode text;

update public.vaccination_session_stock_allocations
set service_mode = 'HEALTHDAY'
where service_mode is null
   or upper(trim(service_mode)) not in ('HEALTHDAY', 'BAZAR');

alter table public.vaccination_session_stock_allocations
  alter column service_mode set default 'HEALTHDAY';

alter table public.vaccination_session_stock_allocations
  alter column service_mode set not null;

alter table public.vaccination_session_stock_allocations
  drop constraint if exists vaccination_session_stock_allocations_service_mode_chk;

alter table public.vaccination_session_stock_allocations
  add constraint vaccination_session_stock_allocations_service_mode_chk
  check (upper(trim(service_mode)) in ('HEALTHDAY', 'BAZAR'));

-- ---------------------------------------------------------------------
-- STEP 3 — replace old UNIQUE(session_id, lot_id)
-- with UNIQUE(session_id, lot_id, service_mode)
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.vaccination_session_stock_allocations'::regclass
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike 'UNIQUE (session_id, lot_id)%'
      and pg_get_constraintdef(c.oid) not ilike '%service_mode%'
  loop
    execute format(
      'alter table public.vaccination_session_stock_allocations drop constraint %I',
      r.conname
    );
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.vaccination_session_stock_allocations'::regclass
      and conname = 'vaccination_session_stock_allocations_session_lot_service_key'
  ) then
    alter table public.vaccination_session_stock_allocations
      add constraint vaccination_session_stock_allocations_session_lot_service_key
      unique (session_id, lot_id, service_mode);
  end if;
end $$;

create index if not exists idx_vaccination_session_stock_allocations_service
  on public.vaccination_session_stock_allocations(
    session_id,
    service_mode,
    active
  );

create index if not exists idx_vaccination_session_stock_allocations_lot_service
  on public.vaccination_session_stock_allocations(
    lot_id,
    service_mode,
    active,
    dedicated
  );

-- ---------------------------------------------------------------------
-- STEP 4 — legacy backfill
-- Existing exact SESSION-owned lots with remaining stock become
-- HEALTHDAY by default only if no allocation exists for that session/lot.
-- This preserves existing operations and does not invent Bazar stock.
-- ---------------------------------------------------------------------
insert into public.vaccination_session_stock_allocations (
  session_id,
  vaccine_id,
  lot_id,
  allocated_qty,
  low_stock_threshold,
  dedicated,
  active,
  service_mode,
  notes,
  created_by,
  updated_at
)
select
  l.stock_session_id,
  l.vaccine_id,
  l.id,
  greatest(
    0,
    coalesce(l.stock_initial, 0)
      + coalesce(l.stock_added, 0)
      - coalesce(l.stock_used, 0)
  )::integer,
  least(
    5,
    greatest(
      0,
      coalesce(l.stock_initial, 0)
        + coalesce(l.stock_added, 0)
        - coalesce(l.stock_used, 0)
    )::integer
  ),
  true,
  true,
  'HEALTHDAY',
  'V497 legacy backfill: existing Session stock defaults to Healthday',
  'migration_v497',
  now()
from public.vaccination_vaccine_lots l
where upper(trim(coalesce(l.stock_scope, 'GENERAL'))) = 'SESSION'
  and l.stock_session_id is not null
  and greatest(
        0,
        coalesce(l.stock_initial, 0)
          + coalesce(l.stock_added, 0)
          - coalesce(l.stock_used, 0)
      ) > 0
  and not exists (
    select 1
    from public.vaccination_session_stock_allocations a
    where a.session_id = l.stock_session_id
      and a.lot_id = l.id
  )
on conflict (session_id, lot_id, service_mode) do nothing;

comment on column public.vaccination_session_stock_allocations.service_mode is
  'HEALTHDAY = stok gratis; BAZAR = stok berbayar. Bucket terpisah dalam Session/Lokasi yang sama.';

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- VERIFICATION — READ ONLY
-- =====================================================================
select
  exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='vaccination_session_stock_allocations'
      and column_name='service_mode'
  ) as service_mode_ready;

select
  a.session_id,
  s.session_name,
  s.company_name,
  a.service_mode,
  count(*) as lot_rows,
  sum(a.allocated_qty) as allocated_qty
from public.vaccination_session_stock_allocations a
join public.vaccination_sessions s on s.id = a.session_id
where a.active = true
group by
  a.session_id,
  s.session_name,
  s.company_name,
  a.service_mode
order by
  s.session_name,
  a.service_mode;
