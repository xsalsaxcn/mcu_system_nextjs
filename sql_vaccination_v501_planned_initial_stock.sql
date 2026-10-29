-- V501 - Planned Initial Stock for Session Product Assignment
-- Safe / additive / idempotent
-- Purpose: allow Jumlah Awal to be recorded before Lot Number exists.
-- The value is planning metadata only until a Lot is created.

alter table public.vaccination_session_product_assignments
  add column if not exists planned_stock_initial integer not null default 0;

update public.vaccination_session_product_assignments
set planned_stock_initial = 0
where planned_stock_initial is null
   or planned_stock_initial < 0;

alter table public.vaccination_session_product_assignments
  drop constraint if exists vaccination_session_product_assignments_planned_stock_initial_chk;

alter table public.vaccination_session_product_assignments
  add constraint vaccination_session_product_assignments_planned_stock_initial_chk
  check (planned_stock_initial >= 0);

comment on column public.vaccination_session_product_assignments.planned_stock_initial is
  'Planned initial stock captured before a Lot Number exists. When the product is later saved with a Lot, this value is used as vaccination_vaccine_lots.stock_initial and assignment planned value is reset to 0.';

notify pgrst, 'reload schema';

select
  exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='vaccination_session_product_assignments'
      and column_name='planned_stock_initial'
  ) as planned_stock_initial_ready;
