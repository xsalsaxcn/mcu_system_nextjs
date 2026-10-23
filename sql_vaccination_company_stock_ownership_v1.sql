-- ============================================================
-- VACCINATION COMPANY STOCK OWNERSHIP V1
-- Scope: Vaccination ONLY
-- Additive / legacy-preserving
--
-- Tujuan:
-- 1. Setiap lot dapat ditandai GENERAL atau COMPANY.
-- 2. Jika COMPANY, nama perusahaan wajib diisi.
-- 3. Semua lot existing otomatis tetap GENERAL.
-- 4. Tidak mengubah stock_initial / stock_added / stock_used.
-- ============================================================

begin;

alter table public.vaccination_vaccine_lots
  add column if not exists stock_scope text not null default 'GENERAL';

alter table public.vaccination_vaccine_lots
  add column if not exists stock_company_name text;

update public.vaccination_vaccine_lots
set stock_scope = 'GENERAL'
where stock_scope is null
   or upper(trim(stock_scope)) not in ('GENERAL', 'COMPANY');

update public.vaccination_vaccine_lots
set stock_company_name = null
where upper(trim(coalesce(stock_scope, 'GENERAL'))) = 'GENERAL';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vaccination_vaccine_lots_stock_scope_chk'
      and conrelid = 'public.vaccination_vaccine_lots'::regclass
  ) then
    alter table public.vaccination_vaccine_lots
      add constraint vaccination_vaccine_lots_stock_scope_chk
      check (upper(trim(stock_scope)) in ('GENERAL', 'COMPANY'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vaccination_vaccine_lots_stock_company_chk'
      and conrelid = 'public.vaccination_vaccine_lots'::regclass
  ) then
    alter table public.vaccination_vaccine_lots
      add constraint vaccination_vaccine_lots_stock_company_chk
      check (
        upper(trim(stock_scope)) = 'GENERAL'
        or nullif(trim(stock_company_name), '') is not null
      );
  end if;
end $$;

create index if not exists idx_vaccination_vaccine_lots_stock_owner
  on public.vaccination_vaccine_lots (
    stock_scope,
    lower(stock_company_name),
    active
  );

comment on column public.vaccination_vaccine_lots.stock_scope is
  'GENERAL = dapat dipakai lintas perusahaan; COMPANY = stok lot dikunci ke perusahaan tertentu.';

comment on column public.vaccination_vaccine_lots.stock_company_name is
  'Nama perusahaan pemilik/tujuan stok ketika stock_scope=COMPANY.';

commit;

-- ============================================================
-- VERIFICATION - READ ONLY
-- ============================================================
select
  stock_scope,
  coalesce(stock_company_name, '-') as stock_company_name,
  count(*) as jumlah_lot,
  sum(coalesce(stock_initial, 0) + coalesce(stock_added, 0) - coalesce(stock_used, 0)) as sisa_sistem
from public.vaccination_vaccine_lots
group by stock_scope, stock_company_name
order by stock_scope, stock_company_name;

select
  l.id,
  v.name as produk,
  l.lot_number,
  l.stock_scope,
  l.stock_company_name,
  l.stock_initial,
  l.stock_added,
  l.stock_used,
  l.active
from public.vaccination_vaccine_lots l
left join public.vaccination_vaccines v on v.id = l.vaccine_id
order by l.id desc
limit 100;
