-- WELLNESS_COACH_SNAPSHOT_PERFORMANCE_V1
-- Scope: Wellness only. Additive table only; no existing table/rule is altered.
-- Canonical payload is written only by server code that calls
-- lib/wellness/participantStreakServer.ts -> loadParticipantCanonicalStreak().

begin;

create table if not exists public.wellness_coach_participant_snapshots (
  participant_id bigint primary key,
  canonical_payload jsonb not null,
  snapshot_date date not null,
  generated_at timestamptz not null default now(),
  engine_key text not null default 'participantCanonicalStreak:v126m119_51',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wellness_coach_participant_snapshots_snapshot_date_idx
  on public.wellness_coach_participant_snapshots (snapshot_date);

create index if not exists wellness_coach_participant_snapshots_generated_at_idx
  on public.wellness_coach_participant_snapshots (generated_at desc);

alter table public.wellness_coach_participant_snapshots enable row level security;

comment on table public.wellness_coach_participant_snapshots is
  'Wellness Coach performance cache. Canonical streak payload only; no independent streak/point/fitness rules.';

commit;
