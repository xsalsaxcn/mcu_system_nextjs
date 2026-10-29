-- V499 - Vaccination Session Product Assignment Without Lot
-- Safe / additive / idempotent
-- Purpose: allow a master vaccine/product to belong to a Session + service mode
-- even when Lot Number has not been created yet.

create table if not exists public.vaccination_session_product_assignments (
  id bigserial primary key,
  session_id bigint not null references public.vaccination_sessions(id) on delete cascade,
  vaccine_id bigint not null references public.vaccination_vaccines(id) on delete cascade,
  service_mode text not null default 'HEALTHDAY',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vaccination_session_product_assignments_service_mode_chk
    check (service_mode in ('HEALTHDAY','BAZAR')),
  constraint vaccination_session_product_assignments_unique
    unique (session_id, vaccine_id, service_mode)
);

create index if not exists idx_vaccination_session_product_assignments_session
  on public.vaccination_session_product_assignments(session_id, active);

create index if not exists idx_vaccination_session_product_assignments_vaccine
  on public.vaccination_session_product_assignments(vaccine_id, active);

comment on table public.vaccination_session_product_assignments is
  'Product-level Session assignment independent of Lot. Used so products remain visible/filterable before a Lot Number exists.';

notify pgrst, 'reload schema';

select
  exists (
    select 1 from information_schema.tables
    where table_schema='public'
      and table_name='vaccination_session_product_assignments'
  ) as product_assignment_ready;
