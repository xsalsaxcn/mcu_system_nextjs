-- V624 BAZAR STAGE CORRECTION — ADDITIVE, NEVER EXECUTES PATIENT CORRECTIONS ON INSTALL.
-- REQUIRES V623 migration, verified DB backup, staging verification and authorized approver.
-- Existing LKG Inventory V581 SOURCE IS NOT CHANGED.
-- Corrects per-item FALSE administration ONLY after staff confirm vaccine was NOT given.
-- This is NOT a general-purpose reversal for actual vaccinations.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.vaccination_validation_item_moves_v623') IS NULL THEN
    RAISE EXCEPTION 'V623 migration is required before V624.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.vaccination_validation_stage_corrections_v624 (
  id bigserial PRIMARY KEY,
  registration_id bigint NOT NULL REFERENCES public.vaccination_registrations(id) ON DELETE RESTRICT,
  item_id bigint NOT NULL REFERENCES public.vaccination_registration_items(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('MARK_PENDING_ONLY','CORRECT_NOT_INJECTED')),
  original_record_id bigint,
  original_item jsonb,
  original_record jsonb,
  original_movement jsonb,
  original_lot_stock_used integer,
  reason text NOT NULL,
  corrected_by text NOT NULL,
  corrected_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_v624_one_correction_per_record
  ON public.vaccination_validation_stage_corrections_v624(original_record_id)
  WHERE original_record_id IS NOT NULL AND action = 'CORRECT_NOT_INJECTED';
CREATE INDEX IF NOT EXISTS idx_v624_reg_item
  ON public.vaccination_validation_stage_corrections_v624(registration_id,item_id,corrected_at);

CREATE OR REPLACE FUNCTION public.vaccination_validation_bazar_stage_v624(
  p_registration_id bigint, p_item_ids bigint[], p_action text,
  p_actor text, p_reason text, p_confirmed_not_injected boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $v624$
DECLARE
  v_action text := upper(btrim(coalesce(p_action,'')));
  v_actor text := nullif(btrim(coalesce(p_actor,'')), '');
  v_reason text := btrim(coalesce(p_reason,''));
  v_registration public.vaccination_registrations%ROWTYPE;
  v_item public.vaccination_registration_items%ROWTYPE;
  v_record public.vaccination_records%ROWTYPE;
  v_movement public.vaccination_inventory_movements%ROWTYPE;
  v_lot public.vaccination_vaccine_lots%ROWTYPE;
  v_count integer;
  v_remaining integer;
  v_healthday_pending integer;
  v_final text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_registration_id IS NULL OR p_registration_id < 1 THEN
    RAISE EXCEPTION 'Registration tidak valid.';
  END IF;
  IF v_action NOT IN ('MARK_PENDING_ONLY','CORRECT_NOT_INJECTED') THEN
    RAISE EXCEPTION 'Aksi koreksi tidak dikenal.';
  END IF;
  IF v_actor IS NULL OR length(v_actor) > 150 THEN
    RAISE EXCEPTION 'Petugas wajib diidentifikasi.';
  END IF;
  IF length(v_reason) < 15 OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'Alasan koreksi wajib 15-1000 karakter.';
  END IF;
  IF p_item_ids IS NULL OR cardinality(p_item_ids) < 1 OR cardinality(p_item_ids) > 30 THEN
    RAISE EXCEPTION 'Pilih 1-30 item.';
  END IF;
  IF v_action='CORRECT_NOT_INJECTED' AND p_confirmed_not_injected IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Verifikasi petugas medis bahwa vaksin BELUM disuntik wajib.';
  END IF;

  -- Same registration lock namespace as V623: prevent races with per-item Done.
  PERFORM pg_advisory_xact_lock(hashtext('v623-bazar'), p_registration_id::integer);
  SELECT * INTO v_registration FROM public.vaccination_registrations
    WHERE id=p_registration_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registrasi tidak ditemukan.'; END IF;
  IF v_registration.session_id=177 THEN
    RAISE EXCEPTION 'Session 177 iServe LKG protected.';
  END IF;
  SELECT count(*) INTO v_count FROM public.vaccination_registration_items i
    WHERE i.id=ANY(p_item_ids) AND i.registration_id=p_registration_id
      AND i.active IS TRUE AND upper(btrim(coalesce(i.service_mode,'')))='BAZAR';
  IF v_count<>cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'Item bukan milik registrasi ini, tidak aktif, atau duplikat.';
  END IF;

  -- Preflight all selected items BEFORE making ANY updates.
  FOR v_item IN
    SELECT * FROM public.vaccination_registration_items
    WHERE id=ANY(p_item_ids) AND registration_id=p_registration_id ORDER BY id FOR UPDATE
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.vaccination_validation_item_moves_v623 m
      WHERE m.item_id=v_item.id AND m.active IS TRUE
    ) THEN
      RAISE EXCEPTION 'Item % sudah ditandai Pindah Klinik; periksa riwayat.',v_item.id;
    END IF;
    IF v_action='MARK_PENDING_ONLY' THEN
      IF upper(btrim(coalesce(v_item.status,''))) <> 'WAITING'
        OR v_item.administered_record_id IS NOT NULL OR v_item.administered_at IS NOT NULL THEN
        RAISE EXCEPTION 'Item % memiliki tanda telah diberikan. Gunakan koreksi salah Done dengan otorisasi supervisor.',v_item.id;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.vaccination_records r
        WHERE r.registration_id=p_registration_id AND r.vaccine_id=v_item.vaccine_id
          AND r.dose_number=greatest(1,coalesce(v_item.dose_number,1))
          AND upper(btrim(coalesce(r.status,'')))='ADMINISTERED'
      ) THEN
        RAISE EXCEPTION 'Item % mempunyai record suntikan lain; audit manual wajib.',v_item.id;
      END IF;
    ELSE
      IF upper(btrim(coalesce(v_item.status,''))) <> 'ADMINISTERED'
        OR v_item.administered_record_id IS NULL OR v_item.administered_at IS NULL THEN
        RAISE EXCEPTION 'Item % tidak memiliki state ADMINISTERED lengkap; audit manual wajib.',v_item.id;
      END IF;
      SELECT * INTO v_record FROM public.vaccination_records
        WHERE id=v_item.administered_record_id AND registration_id=p_registration_id FOR UPDATE;
      IF NOT FOUND OR upper(btrim(coalesce(v_record.status,''))) <> 'ADMINISTERED'
        OR v_record.vaccine_id IS DISTINCT FROM v_item.vaccine_id
        OR v_record.lot_id IS DISTINCT FROM v_item.lot_id
        OR v_record.session_id IS DISTINCT FROM v_registration.session_id
        OR v_record.dose_number IS DISTINCT FROM greatest(1,coalesce(v_item.dose_number,1)) THEN
        RAISE EXCEPTION 'Record klinis item % tidak cocok; STOP, jangan koreksi otomatis.',v_item.id;
      END IF;
      IF position('QUEUE_DONE_SYNC:BAZAR' IN upper(coalesce(v_record.notes,'')))=0 THEN
        RAISE EXCEPTION 'Record item % bukan berasal dari flow Done otomatis Bazar; butuh audit klinis manual.',v_item.id;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.vaccination_validation_stage_corrections_v624 c
        WHERE c.original_record_id=v_record.id AND c.action='CORRECT_NOT_INJECTED'
      ) THEN
        RAISE EXCEPTION 'Record item % sudah pernah dikoreksi. Jangan mengulang reversal.',v_item.id;
      END IF;
      SELECT count(*) INTO v_count FROM public.vaccination_inventory_movements m
        WHERE m.reference_type='vaccination_record' AND m.reference_id=v_record.id
          AND lower(btrim(coalesce(m.movement_type,'')))='administered'
          AND m.lot_id=v_item.lot_id AND m.vaccine_id=v_item.vaccine_id AND m.qty<0;
      IF v_count<>1 THEN
        RAISE EXCEPTION 'Item % tidak memiliki tepat 1 movement administered; audit Inventory dahulu.',v_item.id;
      END IF;
      SELECT * INTO v_lot FROM public.vaccination_vaccine_lots
        WHERE id=v_item.lot_id FOR UPDATE;
      IF NOT FOUND OR v_lot.vaccine_id IS DISTINCT FROM v_item.vaccine_id
        OR coalesce(v_lot.stock_used,0) < 1 THEN
        RAISE EXCEPTION 'Lot atau pemakaian stok item % tidak cocok; STOP.',v_item.id;
      END IF;
      -- An already-sent/queued reminder cannot be silently reversed.
      IF EXISTS (SELECT 1 FROM public.vaccination_reminders rem WHERE rem.record_id=v_record.id) THEN
        RAISE EXCEPTION 'Item % punya riwayat reminder: verifikasi jadwal/komunikasi dahulu.',v_item.id;
      END IF;
    END IF;
  END LOOP;

  -- All writes below are inside the single PostgreSQL RPC transaction.
  FOR v_item IN
    SELECT * FROM public.vaccination_registration_items
    WHERE id=ANY(p_item_ids) AND registration_id=p_registration_id ORDER BY id
  LOOP
    IF v_action='CORRECT_NOT_INJECTED' THEN
      SELECT * INTO v_record FROM public.vaccination_records WHERE id=v_item.administered_record_id;
      SELECT * INTO v_movement FROM public.vaccination_inventory_movements
        WHERE reference_type='vaccination_record' AND reference_id=v_record.id
          AND lower(btrim(coalesce(movement_type,'')))='administered'
          AND lot_id=v_item.lot_id AND vaccine_id=v_item.vaccine_id AND qty<0
        FOR UPDATE;
      SELECT * INTO v_lot FROM public.vaccination_vaccine_lots WHERE id=v_item.lot_id FOR UPDATE;
      INSERT INTO public.vaccination_validation_stage_corrections_v624(
        registration_id,item_id,action,original_record_id,original_item,
        original_record,original_movement,original_lot_stock_used,reason,corrected_by,corrected_at
      ) VALUES(
        p_registration_id,v_item.id,v_action,v_record.id,to_jsonb(v_item),
        to_jsonb(v_record),to_jsonb(v_movement),v_lot.stock_used,v_reason,v_actor,v_now
      );
      -- Keep the original movement and record IDs but reclassify as an audit,
      -- so Inventory V581 does not count a voided injection as consumed stock.
      UPDATE public.vaccination_inventory_movements
        SET movement_type='validation_done_reversal_audit',qty=0,
            notes=concat(coalesce(v_movement.notes,''),' · V624 FALSE_ADMINISTERED reversed: ',v_reason,' · ',v_actor)
        WHERE id=v_movement.id;
      UPDATE public.vaccination_records
        SET status='VOIDED',notes=concat(coalesce(v_record.notes,''),' · V624 FALSE_ADMINISTERED: ',v_reason,' · ',v_actor)
        WHERE id=v_record.id;
      UPDATE public.vaccination_vaccine_lots
        SET stock_used=stock_used-1,updated_at=v_now
        WHERE id=v_item.lot_id AND stock_used>0;
      UPDATE public.vaccination_registration_items
        SET status='WAITING',administered_record_id=NULL,administered_at=NULL,updated_at=v_now
        WHERE id=v_item.id;
    ELSE
      INSERT INTO public.vaccination_validation_stage_corrections_v624(
        registration_id,item_id,action,original_item,reason,corrected_by,corrected_at
      ) VALUES(p_registration_id,v_item.id,v_action,to_jsonb(v_item),v_reason,v_actor,v_now);
    END IF;
  END LOOP;

  -- Payment, price, sale mode, queue numbers and original session are untouched.
  SELECT count(*) INTO v_remaining FROM public.vaccination_registration_items i
  WHERE i.registration_id=p_registration_id AND i.active IS TRUE
    AND upper(btrim(coalesce(i.service_mode,'')))='BAZAR'
    AND upper(btrim(coalesce(i.status,''))) NOT IN ('ADMINISTERED','DONE','FINISHED')
    AND NOT EXISTS(SELECT 1 FROM public.vaccination_validation_item_moves_v623 m
      WHERE m.item_id=i.id AND m.active IS TRUE);
  SELECT count(*) INTO v_healthday_pending FROM public.vaccination_registration_items i
  WHERE i.registration_id=p_registration_id AND i.active IS TRUE
    AND upper(btrim(coalesce(i.service_mode,'')))='HEALTHDAY'
    AND upper(btrim(coalesce(i.status,''))) NOT IN ('ADMINISTERED','DONE','FINISHED');
  v_final:=CASE WHEN v_remaining=0 AND v_healthday_pending=0 THEN 'DONE' ELSE 'PENDING' END;
  UPDATE public.vaccination_registrations
    SET validation_status=v_final,updated_at=v_now
    WHERE id=p_registration_id;

  RETURN jsonb_build_object('ok',true,'action',v_action,'registration_id',p_registration_id,
    'processed_items',cardinality(p_item_ids),'validation_status',v_final);
END;
$v624$;
REVOKE ALL ON TABLE public.vaccination_validation_stage_corrections_v624 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.vaccination_validation_stage_corrections_v624 TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vaccination_validation_stage_corrections_v624_id_seq TO service_role;
REVOKE ALL ON FUNCTION public.vaccination_validation_bazar_stage_v624(bigint,bigint[],text,text,text,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vaccination_validation_bazar_stage_v624(bigint,bigint[],text,text,text,boolean)
  TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
-- Read-only readiness check:
SELECT to_regprocedure('public.vaccination_validation_bazar_stage_v624(bigint,bigint[],text,text,text,boolean)') AS ready_v624;
