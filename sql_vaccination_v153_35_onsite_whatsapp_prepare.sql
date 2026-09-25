begin;

-- V153.35 — Onsite Queue WhatsApp prepare notification.
-- Scope: ONLY vaccination_onsite_queue_entries.
-- Existing queue rows/statuses/functions are not rewritten.

alter table public.vaccination_onsite_queue_entries
  add column if not exists wa_prepare_claimed_at timestamptz,
  add column if not exists wa_prepare_attempted_at timestamptz,
  add column if not exists wa_prepare_sent_at timestamptz,
  add column if not exists wa_prepare_meta_message_id text,
  add column if not exists wa_prepare_last_error text;

comment on column public.vaccination_onsite_queue_entries.wa_prepare_claimed_at
  is 'Short-lived concurrency claim used to prevent duplicate prepare WhatsApp sends.';

comment on column public.vaccination_onsite_queue_entries.wa_prepare_attempted_at
  is 'Latest attempt timestamp for the 1-ahead WhatsApp prepare notification.';

comment on column public.vaccination_onsite_queue_entries.wa_prepare_sent_at
  is 'Successful send timestamp for the 1-ahead WhatsApp prepare notification. Anti-double-send guard.';

comment on column public.vaccination_onsite_queue_entries.wa_prepare_meta_message_id
  is 'Meta WhatsApp message id returned by Notiva for the prepare notification.';

comment on column public.vaccination_onsite_queue_entries.wa_prepare_last_error
  is 'Latest non-blocking Notiva/WhatsApp prepare error. Queue processing continues even when populated.';

commit;

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vaccination_onsite_queue_entries'
      and column_name = 'wa_prepare_claimed_at'
  ) as wa_prepare_claimed_at_ready,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vaccination_onsite_queue_entries'
      and column_name = 'wa_prepare_sent_at'
  ) as wa_prepare_sent_at_ready,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vaccination_onsite_queue_entries'
      and column_name = 'wa_prepare_meta_message_id'
  ) as wa_prepare_meta_message_id_ready;
