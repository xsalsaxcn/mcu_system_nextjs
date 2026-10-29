-- V509 — RECOVER EXISTING SESSION LOT STOCK INTO HEALTHDAY / BAZAR
-- SAFE / TARGETED / IDEMPOTENT
--
-- Problem repaired:
-- Older exact-Session lots may already contain stock_initial/stock_added, while
-- vaccination_session_stock_allocations was never created or still points to
-- the legacy Healthday bucket. The UI then shows Stok Awal = 0 and hides the Lot
-- when Bazar is selected even though the real Lot stock exists.
--
-- Safety rules:
-- - only exact SESSION-owned lots
-- - only products with exactly ONE active Session service assignment
-- - only lots with stock_used = 0
-- - only lots with no vaccination_records yet
-- - only lots with no ADMINISTERED/DONE registration item yet
-- - never changes stock_initial / stock_added / stock_used
-- - if both Healthday and Bazar assignments exist, no automatic guess is made

begin;

with candidate as (
  select
    l.id as lot_id,
    l.stock_session_id as session_id,
    l.vaccine_id,
    greatest(0, coalesce(l.stock_initial,0) + coalesce(l.stock_added,0))::integer as total_qty,
    min(
      case
        when upper(trim(coalesce(a.service_mode,'HEALTHDAY'))) = 'BAZAR' then 'BAZAR'
        else 'HEALTHDAY'
      end
    ) as target_service_mode
  from public.vaccination_vaccine_lots l
  join public.vaccination_session_product_assignments a
    on a.session_id = l.stock_session_id
   and a.vaccine_id = l.vaccine_id
   and coalesce(a.active,true) = true
  where upper(trim(coalesce(l.stock_scope,'GENERAL'))) = 'SESSION'
    and l.stock_session_id is not null
    and coalesce(l.stock_used,0) = 0
    and greatest(0, coalesce(l.stock_initial,0) + coalesce(l.stock_added,0)) > 0
    and not exists (
      select 1
      from public.vaccination_records r
      where r.lot_id = l.id
    )
    and not exists (
      select 1
      from public.vaccination_registration_items ri
      where ri.lot_id = l.id
        and coalesce(ri.active,true) = true
        and upper(trim(coalesce(ri.status,''))) in ('ADMINISTERED','DONE')
    )
  group by l.id, l.stock_session_id, l.vaccine_id, l.stock_initial, l.stock_added
  having count(
    distinct case
      when upper(trim(coalesce(a.service_mode,'HEALTHDAY'))) = 'BAZAR' then 'BAZAR'
      else 'HEALTHDAY'
    end
  ) = 1
), disable_other as (
  update public.vaccination_session_stock_allocations x
  set
    allocated_qty = 0,
    active = false,
    notes = concat(
      coalesce(x.notes,''),
      case when coalesce(x.notes,'') = '' then '' else ' | ' end,
      'V509: disabled because exact Session product assignment points to another service bucket'
    ),
    updated_at = now()
  from candidate c
  where x.session_id = c.session_id
    and x.lot_id = c.lot_id
    and upper(trim(coalesce(x.service_mode,'HEALTHDAY'))) <> c.target_service_mode
  returning x.id
)
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
  c.session_id,
  c.vaccine_id,
  c.lot_id,
  c.total_qty,
  least(5, c.total_qty),
  true,
  c.total_qty > 0,
  c.target_service_mode,
  'V509 recovered existing exact-Session Lot stock from Master assignment',
  'migration_v509',
  now()
from candidate c
on conflict (session_id, lot_id, service_mode)
do update set
  vaccine_id = excluded.vaccine_id,
  allocated_qty = excluded.allocated_qty,
  low_stock_threshold = excluded.low_stock_threshold,
  dedicated = true,
  active = excluded.active,
  notes = excluded.notes,
  updated_at = now();

commit;

notify pgrst, 'reload schema';

-- VERIFY — compare physical Lot stock with service allocation.
select
  s.session_name,
  s.company_name,
  s.location,
  v.name as vaccine_name,
  l.lot_number,
  l.stock_initial,
  l.stock_added,
  l.stock_used,
  a.service_mode,
  a.allocated_qty,
  a.active
from public.vaccination_vaccine_lots l
join public.vaccination_vaccines v on v.id = l.vaccine_id
join public.vaccination_sessions s on s.id = l.stock_session_id
left join public.vaccination_session_stock_allocations a
  on a.session_id = l.stock_session_id
 and a.lot_id = l.id
where upper(trim(coalesce(l.stock_scope,'GENERAL'))) = 'SESSION'
order by s.session_date desc nulls last, s.id desc, v.name, l.lot_number, a.service_mode;
