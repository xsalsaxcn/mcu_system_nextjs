-- ============================================================
-- VACCINATION COMPANY + SESSION STOCK OWNERSHIP V2
-- Scope: Vaccination ONLY
-- Additive / legacy-preserving
--
-- Tujuan:
-- 1. Pertahankan GENERAL dan COMPANY dari V1.
-- 2. Tambah SESSION agar 1 lot dapat dikunci ke exact Session/Lokasi.
-- 3. Existing GENERAL/COMPANY tidak berubah.
-- 4. Tidak mengubah stock_initial / stock_added / stock_used.
-- ============================================================

begin;

alter table public.vaccination_vaccine_lots
  add column if not exists stock_session_id bigint;

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

-- Normalize only invalid legacy scope values. Valid V1 rows stay unchanged.
update public.vaccination_vaccine_lots
set stock_scope = 'GENERAL',
    stock_company_name = null,
    stock_session_id = null
where stock_scope is null
   or upper(trim(stock_scope)) not in ('GENERAL', 'COMPANY', 'SESSION');

update public.vaccination_vaccine_lots
set stock_company_name = null,
    stock_session_id = null
where upper(trim(coalesce(stock_scope, 'GENERAL'))) = 'GENERAL';

update public.vaccination_vaccine_lots
set stock_session_id = null
where upper(trim(coalesce(stock_scope, 'GENERAL'))) = 'COMPANY';

-- Rebuild V1 checks so SESSION is valid.
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
  'Exact vaccination_sessions.id ketika stock_scope=SESSION. Digunakan untuk stock management per lokasi/session.';

commit;

-- ============================================================
-- VERIFICATION - READ ONLY
-- ============================================================
select
  l.stock_scope,
  coalesce(l.stock_company_name, '-') as stock_company_name,
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
  s.session_name,
  s.location,
  s.session_date
order by
  l.stock_scope,
  l.stock_company_name,
  s.session_date desc nulls last,
  s.session_name;

select
  l.id,
  v.name as produk,
  l.lot_number,
  l.stock_scope,
  l.stock_company_name,
  l.stock_session_id,
  s.session_name,
  s.location,
  s.session_date,
  l.stock_initial,
  l.stock_added,
  l.stock_used,
  l.active
from public.vaccination_vaccine_lots l
left join public.vaccination_vaccines v on v.id = l.vaccine_id
left join public.vaccination_sessions s on s.id = l.stock_session_id
order by l.id desc
limit 200;
