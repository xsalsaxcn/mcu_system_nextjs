begin;

-- V153.58 SAFE - Onsite Queue browser recovery.
-- CUMULATIVE: also ensures V153.57 form-builder columns exist.

alter table public.vaccination_sessions
  add column if not exists onsite_queue_form_config jsonb;

update public.vaccination_sessions
set onsite_queue_form_config = '[
  {"id":"participant_name","kind":"participant_name","label":"Nama Lengkap","placeholder":"Nama lengkap","required":true,"recoveryKey":false},
  {"id":"employee_id","kind":"employee_id","label":"NIK Karyawan","placeholder":"NIK Karyawan","required":true,"recoveryKey":true}
]'::jsonb
where onsite_queue_form_config is null;

alter table public.vaccination_sessions
  alter column onsite_queue_form_config set default '[
    {"id":"participant_name","kind":"participant_name","label":"Nama Lengkap","placeholder":"Nama lengkap","required":true,"recoveryKey":false},
    {"id":"employee_id","kind":"employee_id","label":"NIK Karyawan","placeholder":"NIK Karyawan","required":true,"recoveryKey":true}
  ]'::jsonb;

alter table public.vaccination_sessions
  alter column onsite_queue_form_config set not null;

alter table public.vaccination_onsite_queue_entries
  add column if not exists form_data jsonb;

update public.vaccination_onsite_queue_entries
set form_data = '{}'::jsonb
where form_data is null;

alter table public.vaccination_onsite_queue_entries
  alter column form_data set default '{}'::jsonb;

alter table public.vaccination_onsite_queue_entries
  alter column form_data set not null;

alter table public.vaccination_onsite_queue_entries
  add column if not exists recovery_field_id text;

alter table public.vaccination_onsite_queue_entries
  add column if not exists recovery_key_hash text;

create index if not exists idx_vaccination_onsite_queue_entries_recovery_key
  on public.vaccination_onsite_queue_entries (event_id, recovery_key_hash)
  where recovery_key_hash is not null;

comment on column public.vaccination_sessions.onsite_queue_form_config is
  'Per-session Onsite Queue form builder config. Exactly one field acts as Recovery Key. A field with kind=whatsapp enables WhatsApp reminder for that session.';

comment on column public.vaccination_onsite_queue_entries.form_data is
  'Snapshot of participant answers and field metadata at queue registration time.';

comment on column public.vaccination_onsite_queue_entries.recovery_field_id is
  'Field id selected as Recovery Key when this queue entry was created.';

comment on column public.vaccination_onsite_queue_entries.recovery_key_hash is
  'HMAC hash of the normalized Recovery Key value. Used to restore an existing queue ticket without exposing the raw recovery value.';

commit;

select
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='vaccination_sessions'
      and column_name='onsite_queue_form_config'
  ) as session_queue_form_config_ready,
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='vaccination_onsite_queue_entries'
      and column_name='form_data'
  ) as queue_form_data_ready,
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='vaccination_onsite_queue_entries'
      and column_name='recovery_field_id'
  ) as recovery_field_ready,
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='vaccination_onsite_queue_entries'
      and column_name='recovery_key_hash'
  ) as recovery_hash_ready;
