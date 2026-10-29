-- V507 — VACCINATION PACKAGE / NON PACKAGE PRICING
-- SAFE / ADDITIVE / IDEMPOTENT
-- Inventory remains at vaccination_vaccines + vaccination_vaccine_lots.
-- This migration creates SALES/PRICING metadata only.

begin;

create table if not exists public.vaccination_vaccine_sales_options (
  id bigserial primary key,
  vaccine_id bigint not null references public.vaccination_vaccines(id) on delete cascade,
  sale_mode text not null default 'NON_PACKAGE',
  package_dose_count integer not null default 1,
  price numeric(14,2) not null default 0,
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vaccination_vaccine_sales_options_mode_ck
    check (upper(trim(sale_mode)) in ('PACKAGE','NON_PACKAGE')),
  constraint vaccination_vaccine_sales_options_dose_ck
    check (package_dose_count >= 1),
  constraint vaccination_vaccine_sales_options_price_ck
    check (price >= 0),
  constraint vaccination_vaccine_sales_options_vaccine_mode_uq
    unique (vaccine_id, sale_mode)
);

create index if not exists vaccination_vaccine_sales_options_vaccine_idx
  on public.vaccination_vaccine_sales_options(vaccine_id, active);

-- Snapshot fields on registration items. Existing records stay NON_PACKAGE.
alter table public.vaccination_registration_items
  add column if not exists sales_option_id bigint;

alter table public.vaccination_registration_items
  add column if not exists sale_mode text not null default 'NON_PACKAGE';

alter table public.vaccination_registration_items
  add column if not exists package_dose_count integer not null default 1;

alter table public.vaccination_registration_items
  add column if not exists sales_price_snapshot numeric(14,2);

update public.vaccination_registration_items
set sale_mode = 'NON_PACKAGE'
where sale_mode is null
   or upper(trim(sale_mode)) not in ('PACKAGE','NON_PACKAGE');

update public.vaccination_registration_items
set package_dose_count = 1
where package_dose_count is null or package_dose_count < 1;

-- Add FK only when not already present.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vaccination_registration_items_sales_option_fk'
  ) then
    alter table public.vaccination_registration_items
      add constraint vaccination_registration_items_sales_option_fk
      foreign key (sales_option_id)
      references public.vaccination_vaccine_sales_options(id)
      on delete set null;
  end if;
end $$;

create index if not exists vaccination_registration_items_sales_option_idx
  on public.vaccination_registration_items(sales_option_id)
  where sales_option_id is not null;

create index if not exists vaccination_registration_items_sale_mode_idx
  on public.vaccination_registration_items(registration_id, sale_mode)
  where active = true;

comment on table public.vaccination_vaccine_sales_options is
  'Pricing/sales layer only. Package and Non Package point to the same vaccine/lot inventory.';

comment on column public.vaccination_vaccine_sales_options.package_dose_count is
  'Commercial entitlement count. Inventory is still consumed one dose at each actual administration.';

commit;

notify pgrst, 'reload schema';

-- VERIFY
select
  v.id as vaccine_id,
  v.name as vaccine_name,
  o.sale_mode,
  o.package_dose_count,
  o.price,
  o.active
from public.vaccination_vaccines v
left join public.vaccination_vaccine_sales_options o on o.vaccine_id = v.id
where v.active = true
order by v.name, o.sale_mode;
