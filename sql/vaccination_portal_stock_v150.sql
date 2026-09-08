-- V150 - Vaccination dedicated portal + session stock allocation
-- Scope: vaccination only. Does not change MCU, CAPASKA, Wellness, or sticker layout.

begin;

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
  updated_at timestamptz not null default now(),
  unique(session_id, lot_id)
);

create index if not exists idx_vaccination_session_stock_allocations_session
  on public.vaccination_session_stock_allocations(session_id, active);

create index if not exists idx_vaccination_session_stock_allocations_lot
  on public.vaccination_session_stock_allocations(lot_id, active, dedicated);

comment on table public.vaccination_session_stock_allocations is
  'V150 session-aware stock allocation. dedicated=true means the allocated lot is restricted to its owning session(s).';

commit;

select
  a.id,
  a.session_id,
  s.session_name,
  s.company_name,
  a.vaccine_id,
  v.name as vaccine_name,
  a.lot_id,
  l.lot_number,
  a.allocated_qty,
  a.low_stock_threshold,
  a.dedicated,
  a.active
from public.vaccination_session_stock_allocations a
join public.vaccination_sessions s on s.id = a.session_id
join public.vaccination_vaccines v on v.id = a.vaccine_id
join public.vaccination_vaccine_lots l on l.id = a.lot_id
order by s.session_date desc nulls last, s.id desc, v.name, l.lot_number;
