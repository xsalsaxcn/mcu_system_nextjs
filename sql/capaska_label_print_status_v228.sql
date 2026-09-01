alter table public.participants
  add column if not exists label_printed_at timestamptz,
  add column if not exists label_printed_by text,
  add column if not exists label_print_count integer not null default 0;

create index if not exists idx_participants_label_printed_at
  on public.participants(label_printed_at);

create index if not exists idx_participants_program_source_label_printed
  on public.participants(program_type, source_id, label_printed_at);
