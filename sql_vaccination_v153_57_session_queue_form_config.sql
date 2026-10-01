begin;

-- V153.57 SAFE - Session-configurable Onsite Queue form.
-- WhatsApp reminder is enabled by the presence of a `whatsapp` field in this JSON config.

alter table public.vaccination_sessions
  add column if not exists onsite_queue_form_config jsonb;

update public.vaccination_sessions
set onsite_queue_form_config = '[
  {"id":"participant_name","kind":"participant_name","label":"Nama Lengkap","placeholder":"Nama lengkap","required":true},
  {"id":"employee_id","kind":"employee_id","label":"NIK Karyawan","placeholder":"NIK Karyawan","required":true}
]'::jsonb
where onsite_queue_form_config is null;

alter table public.vaccination_sessions
  alter column onsite_queue_form_config set default '[
    {"id":"participant_name","kind":"participant_name","label":"Nama Lengkap","placeholder":"Nama lengkap","required":true},
    {"id":"employee_id","kind":"employee_id","label":"NIK Karyawan","placeholder":"NIK Karyawan","required":true}
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

comment on column public.vaccination_sessions.onsite_queue_form_config is
  'Per-session Onsite Queue form builder config. A field with kind=whatsapp enables the queue WhatsApp reminder for that session.';

comment on column public.vaccination_onsite_queue_entries.form_data is
  'Snapshot of participant answers and field labels/kinds at queue registration time.';

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
  ) as queue_form_data_ready;
