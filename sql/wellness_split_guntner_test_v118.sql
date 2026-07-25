-- WELLNESS_GUNTNER_TO_HARMON_TEST_V118
--
-- PREVIEW:
--   v_apply boolean := false;
--
-- APPLY:
--   ubah menjadi:
--   v_apply boolean := true;
--
-- Hasil akhir:
-- - Company lama PT Guntner Indonesia menjadi PT Harmon Test.
-- - Company ID lama tidak berubah.
-- - Seluruh data peserta, Google Fit, Health Connect, point,
--   activity, history, akun portal, dan group tetap utuh.
-- - PT Guntner Indonesia baru dibuat dengan 0 peserta dan 0 group.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended(
    'WELLNESS_GUNTNER_TO_HARMON_TEST_V118',
    0
  )
);

do $v118$
declare
  -- FALSE = hanya preview.
  -- TRUE  = jalankan perubahan.
  v_apply boolean := false;

  v_guntner_count bigint := 0;
  v_harmon_count bigint := 0;

  v_source_id bigint;
  v_new_guntner_id bigint;

  v_source_description text;
  v_source_is_active integer;

  v_before_participants bigint := 0;
  v_before_groups bigint := 0;

  v_after_harmon_participants bigint := 0;
  v_after_harmon_groups bigint := 0;

  v_after_new_participants bigint := 0;
  v_after_new_groups bigint := 0;

  v_affected_rows bigint := 0;
begin
  select count(*)
  into v_guntner_count
  from public.wellness_companies
  where lower(btrim(name)) =
        lower('PT Guntner Indonesia');

  select count(*)
  into v_harmon_count
  from public.wellness_companies
  where lower(btrim(name)) =
        lower('PT Harmon Test');

  /*
   * Kondisi idempotent:
   * V118 sudah pernah dijalankan.
   */
  if v_guntner_count = 1
     and v_harmon_count = 1 then

    select id
    into v_new_guntner_id
    from public.wellness_companies
    where lower(btrim(name)) =
          lower('PT Guntner Indonesia');

    select count(*)
    into v_after_new_participants
    from public.wellness_participants
    where wellness_company_id =
          v_new_guntner_id;

    select count(*)
    into v_after_new_groups
    from public.wellness_group_units
    where company_id =
          v_new_guntner_id;

    if v_after_new_participants = 0
       and v_after_new_groups = 0 then

      raise notice
        'V118 sudah terpasang. PT Harmon Test tersedia dan PT Guntner Indonesia baru masih kosong.';

      return;
    end if;

    raise exception
      'Kondisi ambigu. Kedua perusahaan sudah ada, tetapi PT Guntner Indonesia baru memiliki % peserta dan % group. Tidak ada data yang diubah.',
      v_after_new_participants,
      v_after_new_groups;
  end if;

  /*
   * Kondisi awal wajib:
   * tepat 1 Guntner dan belum ada Harmon Test.
   */
  if v_guntner_count <> 1
     or v_harmon_count <> 0 then

    raise exception
      'Syarat V118 tidak terpenuhi. PT Guntner Indonesia=% dan PT Harmon Test=%. Harus tepat 1 Guntner dan 0 Harmon Test.',
      v_guntner_count,
      v_harmon_count;
  end if;

  select
    id,
    description,
    is_active
  into
    v_source_id,
    v_source_description,
    v_source_is_active
  from public.wellness_companies
  where lower(btrim(name)) =
        lower('PT Guntner Indonesia');

  select count(*)
  into v_before_participants
  from public.wellness_participants
  where wellness_company_id =
        v_source_id;

  select count(*)
  into v_before_groups
  from public.wellness_group_units
  where company_id =
        v_source_id;

  raise notice
    'PREVIEW V118: Company existing ID=% mempunyai % peserta dan % group.',
    v_source_id,
    v_before_participants,
    v_before_groups;

  if not v_apply then
    raise notice
      'PREVIEW SELESAI. Tidak ada data yang diubah. Ubah v_apply menjadi true untuk menjalankan migration.';

    return;
  end if;

  /*
   * Rename company lama.
   * ID company tetap sama.
   */
  update public.wellness_companies
  set
    name = 'PT Harmon Test',
    updated_at = now()
  where id = v_source_id;

  get diagnostics
    v_affected_rows = row_count;

  if v_affected_rows <> 1 then
    raise exception
      'Rename company gagal. Jumlah row berubah=%',
      v_affected_rows;
  end if;

  /*
   * Buat PT Guntner Indonesia baru.
   * Hanya company row yang dibuat.
   * Participant dan group tetap kosong.
   */
  insert into public.wellness_companies (
    name,
    description,
    is_active,
    created_at,
    updated_at
  )
  values (
    'PT Guntner Indonesia',
    v_source_description,
    v_source_is_active,
    now(),
    now()
  )
  returning id
  into v_new_guntner_id;

  /*
   * Validasi bahwa data lama tetap melekat
   * pada company ID lama.
   */
  select count(*)
  into v_after_harmon_participants
  from public.wellness_participants
  where wellness_company_id =
        v_source_id;

  select count(*)
  into v_after_harmon_groups
  from public.wellness_group_units
  where company_id =
        v_source_id;

  select count(*)
  into v_after_new_participants
  from public.wellness_participants
  where wellness_company_id =
        v_new_guntner_id;

  select count(*)
  into v_after_new_groups
  from public.wellness_group_units
  where company_id =
        v_new_guntner_id;

  if v_after_harmon_participants <>
     v_before_participants then

    raise exception
      'Validasi participant gagal. Sebelum=% sesudah=%',
      v_before_participants,
      v_after_harmon_participants;
  end if;

  if v_after_harmon_groups <>
     v_before_groups then

    raise exception
      'Validasi group gagal. Sebelum=% sesudah=%',
      v_before_groups,
      v_after_harmon_groups;
  end if;

  if v_after_new_participants <> 0 then
    raise exception
      'PT Guntner Indonesia baru tidak kosong. Participant=%',
      v_after_new_participants;
  end if;

  if v_after_new_groups <> 0 then
    raise exception
      'PT Guntner Indonesia baru tidak kosong. Group=%',
      v_after_new_groups;
  end if;

  raise notice
    'V118 BERHASIL. Company lama ID % menjadi PT Harmon Test dengan % peserta dan % group. PT Guntner Indonesia baru ID % dibuat kosong.',
    v_source_id,
    v_after_harmon_participants,
    v_after_harmon_groups,
    v_new_guntner_id;
end
$v118$;


/*
 * Ringkasan setelah preview atau apply.
 */
select
  c.id as company_id,
  c.name as company_name,

  (
    select count(*)
    from public.wellness_participants p
    where p.wellness_company_id = c.id
  ) as participant_count,

  (
    select count(*)
    from public.wellness_group_units g
    where g.company_id = c.id
  ) as group_unit_count,

  c.is_active,
  c.created_at,
  c.updated_at

from public.wellness_companies c

where lower(btrim(c.name)) in (
  lower('PT Guntner Indonesia'),
  lower('PT Harmon Test')
)

order by c.id;

commit;