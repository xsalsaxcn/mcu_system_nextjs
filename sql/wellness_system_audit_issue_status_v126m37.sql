-- WELLNESS_SYSTEM_AUDIT_ISSUE_STATUS_V126M37
-- Administrative workflow metadata only. Does not alter participant, nutrition,
-- workout, NAKES, point, or clinical data.

create table if not exists public.wellness_system_audit_issue_status (
  fingerprint text primary key,
  issue_id text,
  issue_code text,
  check_key text,
  module text,
  severity text,
  participant_id bigint,
  participant_code text,
  participant_name text,
  issue_date date,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'fixed_pending_verification', 'solved', 'reopened')),
  resolution_note text,
  action_by text,
  verification_result text not null default 'not_verified'
    check (verification_result in ('not_verified', 'still_detected', 'not_detected')),
  fixed_at timestamptz,
  verified_at timestamptz,
  issue_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wellness_system_audit_issue_status_status_idx
  on public.wellness_system_audit_issue_status(status);

create index if not exists wellness_system_audit_issue_status_participant_idx
  on public.wellness_system_audit_issue_status(participant_id);

create index if not exists wellness_system_audit_issue_status_updated_idx
  on public.wellness_system_audit_issue_status(updated_at desc);

alter table public.wellness_system_audit_issue_status enable row level security;

comment on table public.wellness_system_audit_issue_status is
  'Administrative status for Wellness System Audit findings. Accessed only through server-side admin API.';
