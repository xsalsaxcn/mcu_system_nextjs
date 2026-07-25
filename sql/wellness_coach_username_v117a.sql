-- WELLNESS_COACH_USERNAME_ACCOUNTS_V117A
-- Jalankan melalui Supabase SQL Editor sebelum deploy aplikasi.

begin;

alter table public.wellness_coach_users
  add column if not exists username text;

update public.wellness_coach_users
set username = null
where username is not null
  and btrim(username) = '';

create unique index if not exists
  ux_wellness_coach_users_username_lower
on public.wellness_coach_users (lower(username))
where username is not null
  and btrim(username) <> '';

comment on column public.wellness_coach_users.username
is 'Username Coach untuk login Email + Username. Access code dipertahankan sebagai fallback sementara.';

commit;

select
  id,
  name,
  email,
  username,
  is_active
from public.wellness_coach_users
order by name;
