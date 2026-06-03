create table if not exists public.vaccination_staff_options (
  id bigserial primary key,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vaccination_staff_options_name_lower_key
  on public.vaccination_staff_options (lower(name));

alter table public.vaccination_staff_options enable row level security;

drop policy if exists "vaccination_staff_options_select_all" on public.vaccination_staff_options;
create policy "vaccination_staff_options_select_all"
  on public.vaccination_staff_options
  for select
  using (true);
