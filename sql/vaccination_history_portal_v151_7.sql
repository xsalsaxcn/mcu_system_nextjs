-- V151.7 SAFE - Vaccination History Participant Portal + Admin Correction Audit
-- Scope: vaccination history only. Does not alter Wellness, Sticker, Administer, Inventory, Session, Queue, Validation, CAPASKA, or MCU Corporate.

create table if not exists public.vaccination_history_portal_otps (
  id bigserial primary key,
  person_id bigint not null references public.vaccination_persons(id) on delete cascade,
  employee_id text not null,
  email text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists vaccination_history_portal_otps_person_idx
  on public.vaccination_history_portal_otps(person_id, created_at desc);

create table if not exists public.vaccination_history_portal_sessions (
  id bigserial primary key,
  person_id bigint not null references public.vaccination_persons(id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists vaccination_history_portal_sessions_person_idx
  on public.vaccination_history_portal_sessions(person_id, created_at desc);

create table if not exists public.vaccination_history_service_audit (
  id bigserial primary key,
  service_id bigint references public.vaccination_service_history(id) on delete set null,
  company_id bigint not null references public.vaccination_history_companies(id) on delete cascade,
  person_id bigint not null references public.vaccination_persons(id) on delete cascade,
  action text not null check (action in ('ADD','EDIT')),
  changed_by text not null,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vaccination_history_service_audit_service_idx
  on public.vaccination_history_service_audit(service_id, created_at desc);

alter table public.vaccination_history_portal_otps enable row level security;
alter table public.vaccination_history_portal_sessions enable row level security;
alter table public.vaccination_history_service_audit enable row level security;
