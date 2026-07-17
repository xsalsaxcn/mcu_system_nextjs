-- WELLNESS_PARTICIPANT_CONTROLS_V79F
-- Safe additive migration. It does not delete or rewrite existing logs.

create table if not exists public.wellness_participant_controls (
  participant_id bigint primary key references public.wellness_participants(id) on delete cascade,
  session_enabled boolean not null default true,
  fitness_enabled boolean not null default false,
  fitness_source text not null default 'none'
    check (fitness_source in ('none', 'health_connect', 'google_fit')),
  updated_by bigint null,
  updated_at timestamptz not null default now()
);

create index if not exists wellness_participant_controls_fitness_source_idx
  on public.wellness_participant_controls(fitness_source);

comment on table public.wellness_participant_controls is
  'Admin controls for participant portal access and the single fitness provider used for metrics.';

-- Existing participants remain allowed by default because the application
-- treats a missing control row as session_enabled=true.
