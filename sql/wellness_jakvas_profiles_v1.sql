-- WELLNESS_JAKVAS_REPORT_V1
-- Additive Wellness-only storage for JAKVAS self-report fields.
-- No existing table, streak rule, point rule, fitness rule, or target rule is altered.

begin;

create table if not exists public.wellness_jakvas_profiles (
  participant_id bigint primary key,
  smoking_status text null,
  diabetes_status boolean null,
  prior_cvd boolean null,
  physical_activity_category text null,
  updated_by_role text null,
  updated_by_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wellness_jakvas_profiles_smoking_check
    check (smoking_status is null or smoking_status in ('never', 'former', 'current')),
  constraint wellness_jakvas_profiles_activity_check
    check (physical_activity_category is null or physical_activity_category in ('heavy', 'moderate', 'light', 'none'))
);

create index if not exists wellness_jakvas_profiles_updated_at_idx
  on public.wellness_jakvas_profiles (updated_at desc);

alter table public.wellness_jakvas_profiles enable row level security;

comment on table public.wellness_jakvas_profiles is
  'Wellness-only JAKVAS self-report inputs. Read/write through authenticated server routes; does not alter canonical streak, point, target, Google Fit, Health Connect, or clinical history.';

commit;
