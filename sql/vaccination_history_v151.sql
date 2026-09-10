-- V151.0 SAFE - Vaccination Historical Service Foundation
-- Scope: vaccination only. Does not alter sticker, administer, inventory, queue, validation, wellness, CAPASKA, or MCU Corporate.

create extension if not exists pgcrypto;

create table if not exists public.vaccination_history_companies (
  id bigserial primary key,
  company_name text not null,
  company_key text not null unique,
  public_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vaccination_persons (
  id bigserial primary key,
  company_id bigint not null references public.vaccination_history_companies(id) on delete cascade,
  participant_type text not null default 'EMPLOYEE' check (participant_type in ('EMPLOYEE','DEPENDENT')),
  participant_name text not null,
  name_key text not null,
  employee_id text,
  employee_key text,
  nik text,
  nik_key text,
  email text,
  email_key text,
  phone text,
  birth_date date,
  gender text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vaccination_persons_company_idx on public.vaccination_persons(company_id);
create index if not exists vaccination_persons_company_name_idx on public.vaccination_persons(company_id, name_key);
create index if not exists vaccination_persons_company_employee_idx on public.vaccination_persons(company_id, employee_key) where employee_key is not null;
create index if not exists vaccination_persons_company_nik_idx on public.vaccination_persons(company_id, nik_key) where nik_key is not null;
create index if not exists vaccination_persons_company_email_idx on public.vaccination_persons(company_id, email_key) where email_key is not null;

create table if not exists public.vaccination_person_relationships (
  id bigserial primary key,
  company_id bigint not null references public.vaccination_history_companies(id) on delete cascade,
  parent_person_id bigint not null references public.vaccination_persons(id) on delete cascade,
  dependent_person_id bigint not null references public.vaccination_persons(id) on delete cascade,
  relationship_type text not null default 'CHILD',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, parent_person_id, dependent_person_id)
);

create index if not exists vaccination_person_relationship_parent_idx on public.vaccination_person_relationships(parent_person_id);
create index if not exists vaccination_person_relationship_dependent_idx on public.vaccination_person_relationships(dependent_person_id);

create table if not exists public.vaccination_history_import_batches (
  id bigserial primary key,
  company_id bigint not null references public.vaccination_history_companies(id) on delete cascade,
  source_filename text not null,
  source_file_hash text not null,
  source_sheet text,
  source_year integer,
  source_type text,
  detected_template text,
  total_rows integer not null default 0,
  person_rows integer not null default 0,
  service_rows integer not null default 0,
  dependent_rows integer not null default 0,
  skipped_rows integer not null default 0,
  status text not null default 'IMPORTED',
  imported_by text,
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists vaccination_history_import_company_idx on public.vaccination_history_import_batches(company_id, imported_at desc);
create index if not exists vaccination_history_import_hash_idx on public.vaccination_history_import_batches(company_id, source_file_hash);

create table if not exists public.vaccination_service_history (
  id bigserial primary key,
  company_id bigint not null references public.vaccination_history_companies(id) on delete cascade,
  person_id bigint not null references public.vaccination_persons(id) on delete cascade,
  service_date date,
  service_category text not null default 'VACCINATION',
  service_name text not null,
  product_brand text,
  vaccine_id bigint references public.vaccination_vaccines(id) on delete set null,
  dose_number integer,
  lot_number text,
  location text,
  next_due_date date,
  notes text,
  source_type text not null default 'HISTORICAL_IMPORT',
  source_year integer,
  source_filename text,
  source_file_hash text not null,
  source_sheet text,
  source_row integer not null,
  raw_json jsonb not null default '{}'::jsonb,
  import_batch_id bigint references public.vaccination_history_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(company_id, source_file_hash, source_sheet, source_row)
);

create index if not exists vaccination_service_history_person_date_idx on public.vaccination_service_history(person_id, service_date desc);
create index if not exists vaccination_service_history_company_idx on public.vaccination_service_history(company_id);

-- No ALTER is performed on vaccination_registrations or vaccination_records in V151.0.
-- Current operational records remain canonical and are only read by the History API.

-- Sensitive history data is server-only. Service-role APIs bypass RLS; browser/anon access gets no table policy.
alter table public.vaccination_history_companies enable row level security;
alter table public.vaccination_persons enable row level security;
alter table public.vaccination_person_relationships enable row level security;
alter table public.vaccination_history_import_batches enable row level security;
alter table public.vaccination_service_history enable row level security;
