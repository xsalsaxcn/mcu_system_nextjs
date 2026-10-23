-- =====================================================================
-- VACCINATION STOCK OWNERSHIP V2.1 REPAIR + POSTGREST SCHEMA RELOAD
-- Scope: Vaccination ONLY
-- Safe / additive / idempotent / legacy-preserving
--
-- Tujuan:
-- 1. Pastikan kolom V1 + V2 ada pada vaccination_vaccine_lots.
-- 2. Pertahankan GENERAL / COMPANY / SESSION.
-- 3. Jangan reset stock_initial / stock_added / stock_used.
-- 4. Paksa Supabase/PostgREST reload schema agar stock_session_id terbaca API.
-- =====================================================================

begin;

alter table public.vaccination_vaccine_lots
  add column if not exists stock_scope text not null default 'GENERAL';

alter table public.vaccination_vaccine_lots
  add column if not exists stock_company_name text;

alter table public.vaccination_vaccine_lots
  add column if not exists stock_session_id bigint;

alter table public.vaccination_vaccine_lots
  alter column stock_scope set default 'GENERAL';

update public.vaccination_vaccine_lots
set stock_scope = 'GENERAL'
where stock_scope is null
   or upper(trim(stock_scope)) not in ('GENERAL', 'COMPANY', 'SESSION');

update public.vaccination_vaccine_lots
set stock_company_name = null,
    stock_session_id = null
where upper(trim(coalesce(stock_scope, 'GENERAL'))) = 'GENERAL';

update public.vaccination_vaccine_lots
set stock_session_id = null
where upper(trim(coalesce(stock_scope, 'GENERAL'))) = 'COMPANY';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vaccination_vaccine_lots_stock_session_fk'
      and conrelid = 'public.vaccination_vaccine_lots'::regclass
  ) then
    alter table public.vaccination_vaccine_lots
      add constraint vaccination_vaccine_lots_stock_session_fk
      foreign key (stock_session_id)
      references public.vaccination_sessions(id)
      on delete restrict;
  end if;
end $$;

alter table public.vaccination_vaccine_lots
  drop constraint if exists vaccination_vaccine_lots_stock_scope_chk;

alter table public.vaccination_vaccine_lots
  add constraint vaccination_vaccine_lots_stock_scope_chk
  check (upper(trim(stock_scope)) in ('GENERAL', 'COMPANY', 'SESSION'));

alter table public.vaccination_vaccine_lots
  drop constraint if exists vaccination_vaccine_lots_stock_company_chk;

alter table public.vaccination_vaccine_lots
  add constraint vaccination_vaccine_lots_stock_company_chk
  check (
    upper(trim(stock_scope)) = 'GENERAL'
    or nullif(trim(stock_company_name), '') is not null
  );

alter table public.vaccination_vaccine_lots
  drop constraint if exists vaccination_vaccine_lots_stock_session_chk;

alter table public.vaccination_vaccine_lots
  add constraint vaccination_vaccine_lots_stock_session_chk
  check (
    (
      upper(trim(stock_scope)) = 'SESSION'
      and stock_session_id is not null
    )
    or
    (
      upper(trim(stock_scope)) <> 'SESSION'
      and stock_session_id is null
    )
  );

create index if not exists idx_vaccination_vaccine_lots_stock_owner
  on public.vaccination_vaccine_lots (
    stock_scope,
    lower(stock_company_name),
    active
  );

create index if not exists idx_vaccination_vaccine_lots_stock_owner_session
  on public.vaccination_vaccine_lots (
    stock_scope,
    lower(stock_company_name),
    stock_session_id,
    active
  );

comment on column public.vaccination_vaccine_lots.stock_scope is
  'GENERAL = lintas perusahaan/session; COMPANY = seluruh session perusahaan yang sama; SESSION = exact Session/Lokasi.';

comment on column public.vaccination_vaccine_lots.stock_company_name is
  'Nama perusahaan tujuan stok untuk COMPANY atau SESSION.';

comment on column public.vaccination_vaccine_lots.stock_session_id is
  'Exact vaccination_sessions.id ketika stock_scope=SESSION.';

commit;

-- Supabase/PostgREST kadang masih memakai schema cache lama setelah ALTER TABLE.
-- NOTIFY ini memaksa API membaca stock_session_id tanpa menunggu cache refresh otomatis.
notify pgrst, 'reload schema';

-- =====================================================================
-- VERIFICATION - READ ONLY
-- Semua kolom di bawah harus TRUE / tampil.
-- =====================================================================
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vaccination_vaccine_lots'
      and column_name = 'stock_scope'
  ) as stock_scope_ready,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vaccination_vaccine_lots'
      and column_name = 'stock_company_name'
  ) as stock_company_ready,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vaccination_vaccine_lots'
      and column_name = 'stock_session_id'
  ) as stock_session_ready;

select
  l.stock_scope,
  coalesce(l.stock_company_name, '-') as stock_company_name,
  l.stock_session_id,
  coalesce(s.session_name, '-') as session_name,
  coalesce(s.location, '-') as location,
  coalesce(s.session_date::text, '-') as session_date,
  count(*) as jumlah_lot,
  sum(
    coalesce(l.stock_initial, 0)
    + coalesce(l.stock_added, 0)
    - coalesce(l.stock_used, 0)
  ) as sisa_sistem
from public.vaccination_vaccine_lots l
left join public.vaccination_sessions s
  on s.id = l.stock_session_id
group by
  l.stock_scope,
  l.stock_company_name,
  l.stock_session_id,
  s.session_name,
  s.location,
  s.session_date
order by
  l.stock_scope,
  l.stock_company_name,
  s.session_date desc nulls last;
