-- V623 — PER-ITEM BAZAR VALIDATION (ADDITIVE; no historical edits)
-- REQUIREMENT: Run manually in Supabase SQL Editor for the intended project, AFTER backup.
-- Changes: ONE new narrow table, ONE atomic function. Existing Inventory V581 functions,
-- stock balances, records, registration/payment rows, and other modules remain untouched.
-- Service-role-only RPC; application auth is checked independently by validation route.
BEGIN;

CREATE TABLE IF NOT EXISTS public.vaccination_validation_item_moves_v623 (
  item_id bigint PRIMARY KEY REFERENCES public.vaccination_registration_items(id) ON DELETE RESTRICT,
  registration_id bigint NOT NULL REFERENCES public.vaccination_registrations(id) ON DELETE RESTRICT,
  destination text NOT NULL CHECK (destination = 'CLINIC'),
  active boolean NOT NULL DEFAULT true,
  note text NOT NULL DEFAULT '',
  moved_by text NOT NULL,
  moved_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vaccination_validation_item_moves_v623_registration
  ON public.vaccination_validation_item_moves_v623(registration_id, active);

-- This helper is STRICTLY for an explicit selection of BAZAR registration item IDs.
-- All preflight checks, records, stock counters, movements and item statuses are ONE
-- PostgreSQL transaction. Any error aborts the whole action (no partial Done).
CREATE OR REPLACE FUNCTION public.vaccination_validation_bazar_item_action_v623(
  p_registration_id bigint,
  p_item_ids bigint[],
  p_action text,
  p_actor text,
  p_note text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $v623$
DECLARE
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_actor text := nullif(btrim(coalesce(p_actor, '')), '');
  v_note text := btrim(coalesce(p_note, ''));
  v_registration public.vaccination_registrations%ROWTYPE;
  v_item public.vaccination_registration_items%ROWTYPE;
  v_lot public.vaccination_vaccine_lots%ROWTYPE;
  v_vaccine public.vaccination_vaccines%ROWTYPE;
  v_allocation record;
  v_id bigint;
  v_lot_id bigint;
  v_count integer;
  v_need integer;
  v_used integer;
  v_available integer;
  v_remaining integer;
  v_non_bazar_pending integer;
  v_next_days integer;
  v_schedule jsonb;
  v_record_id bigint;
  v_record_ids bigint[] := ARRAY[]::bigint[];
  v_now timestamptz := clock_timestamp();
  v_final_status text;
BEGIN
  IF p_registration_id IS NULL OR p_registration_id <= 0 THEN
    RAISE EXCEPTION 'Registration ID tidak valid.';
  END IF;
  IF v_action NOT IN ('DONE_SELECTED','MOVE_CLINIC_SELECTED') THEN
    RAISE EXCEPTION 'Aksi V623 tidak dikenal.';
  END IF;
  IF v_actor IS NULL OR length(v_actor) > 150 THEN
    RAISE EXCEPTION 'Petugas validasi wajib diisi.';
  END IF;
  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 OR cardinality(p_item_ids) > 50 THEN
    RAISE EXCEPTION 'Pilih 1 sampai 50 item vaksin.';
  END IF;
  IF v_action = 'MOVE_CLINIC_SELECTED' AND length(v_note) < 5 THEN
    RAISE EXCEPTION 'Alasan atau tujuan pindah Klinik wajib dijelaskan.';
  END IF;
  IF length(v_note) > 1500 THEN
    RAISE EXCEPTION 'Catatan terlalu panjang.';
  END IF;

  -- Serialize all V623 operations for the same registration, then lock its items.
  PERFORM pg_advisory_xact_lock(hashtext('v623-bazar'), p_registration_id::integer);
  SELECT * INTO v_registration
  FROM public.vaccination_registrations
  WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registrasi tidak ditemukan.'; END IF;
  IF v_registration.session_id = 177 THEN
    RAISE EXCEPTION 'Session 177 iServe Alsut LKG dilindungi; V623 tidak dijalankan.';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.vaccination_registration_items
  WHERE id = ANY(p_item_ids) AND registration_id = p_registration_id
    AND active IS TRUE AND upper(btrim(coalesce(service_mode, ''))) = 'BAZAR';
  IF v_count <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'Pilihan item duplikat / bukan Bazar / bukan milik registrasi ini.';
  END IF;

  FOR v_item IN
    SELECT * FROM public.vaccination_registration_items
    WHERE id = ANY(p_item_ids) AND registration_id = p_registration_id
    ORDER BY id FOR UPDATE
  LOOP
    IF upper(btrim(coalesce(v_item.status, ''))) <> 'WAITING'
       OR v_item.administered_record_id IS NOT NULL
       OR v_item.administered_at IS NOT NULL THEN
      RAISE EXCEPTION 'Item % tidak WAITING bersih; periksa record klinis dahulu.', v_item.id;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.vaccination_records rec
      WHERE rec.registration_id = p_registration_id
        AND rec.vaccine_id = v_item.vaccine_id
        AND rec.dose_number = greatest(1, coalesce(v_item.dose_number, 1))
        AND upper(btrim(coalesce(rec.status,''))) = 'ADMINISTERED'
    ) THEN
      RAISE EXCEPTION 'Item % memiliki record pemberian yang belum tertaut; audit sebelum Done.', v_item.id;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.vaccination_validation_item_moves_v623 m
      WHERE m.item_id = v_item.id AND m.active = true
    ) THEN
      RAISE EXCEPTION 'Item % sudah dipindah Klinik; tidak dapat Done di event.', v_item.id;
    END IF;
    IF v_item.vaccine_id IS NULL OR v_item.lot_id IS NULL THEN
      RAISE EXCEPTION 'Item % belum memiliki produk dan Lot valid.', v_item.id;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.vaccination_registration_items sibling
      WHERE sibling.id = ANY(p_item_ids) AND sibling.id <> v_item.id
        AND sibling.vaccine_id = v_item.vaccine_id
        AND greatest(1,coalesce(sibling.dose_number,1)) = greatest(1,coalesce(v_item.dose_number,1))
    ) THEN
      RAISE EXCEPTION 'Dua item yang dipilih memiliki vaksin+dosis yang sama; periksa dahulu.';
    END IF;
  END LOOP;

  IF v_action = 'DONE_SELECTED' THEN
    -- Lock affected lots in ID order; no partial writes before full preflight.
    FOR v_lot_id IN
      SELECT DISTINCT lot_id FROM public.vaccination_registration_items
      WHERE id = ANY(p_item_ids) ORDER BY lot_id
    LOOP
      SELECT * INTO v_lot FROM public.vaccination_vaccine_lots
      WHERE id = v_lot_id FOR UPDATE;
      IF NOT FOUND OR v_lot.active IS NOT TRUE THEN
        RAISE EXCEPTION 'Lot % tidak aktif / tidak ditemukan.', v_lot_id;
      END IF;
      IF upper(btrim(coalesce(v_lot.stock_scope, 'GENERAL'))) = 'SESSION'
         AND v_lot.stock_session_id IS DISTINCT FROM v_registration.session_id THEN
        RAISE EXCEPTION 'Lot % milik Session lain. Koreksi referensi item terlebih dahulu.', v_lot.lot_number;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.vaccination_registration_items it
        WHERE it.id = ANY(p_item_ids) AND it.lot_id = v_lot_id
          AND it.vaccine_id IS DISTINCT FROM v_lot.vaccine_id
      ) THEN
        RAISE EXCEPTION 'Vaccine ID dan Lot ID tidak sesuai untuk Lot %.', v_lot.lot_number;
      END IF;
      SELECT count(*) INTO v_need
      FROM public.vaccination_registration_items
      WHERE id = ANY(p_item_ids) AND lot_id = v_lot_id;
      v_available := coalesce(v_lot.stock_initial, 0) + coalesce(v_lot.stock_added, 0) - coalesce(v_lot.stock_used, 0);
      IF v_available < v_need THEN
        RAISE EXCEPTION 'Stok fisik Lot % tidak cukup (tersisa %, dibutuhkan %).', v_lot.lot_number, v_available, v_need;
      END IF;
      SELECT a.id, a.allocated_qty INTO v_allocation
      FROM public.vaccination_session_stock_allocations a
      WHERE a.session_id = v_registration.session_id AND a.lot_id = v_lot_id
        AND upper(btrim(coalesce(a.service_mode,''))) = 'BAZAR'
        AND a.active IS TRUE AND a.dedicated IS DISTINCT FROM FALSE
      ORDER BY a.id DESC LIMIT 1 FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Lot % tidak memiliki alokasi Bazar pada Session ini.', v_lot.lot_number;
      END IF;
      SELECT count(*) INTO v_used
      FROM public.vaccination_registration_items i
      JOIN public.vaccination_registrations r ON r.id = i.registration_id
      WHERE r.session_id = v_registration.session_id AND i.lot_id = v_lot_id
        AND i.active IS TRUE AND upper(btrim(coalesce(i.service_mode,''))) = 'BAZAR'
        AND upper(btrim(coalesce(i.status,''))) IN ('ADMINISTERED','DONE','FINISHED');
      IF v_allocation.allocated_qty - v_used < v_need THEN
        RAISE EXCEPTION 'Sisa alokasi Bazar Lot % tidak cukup (tersisa %, dibutuhkan %).',
          v_lot.lot_number, v_allocation.allocated_qty - v_used, v_need;
      END IF;
    END LOOP;

    -- BEGIN write phase: any exception rolls back all mutations in this RPC.
    FOR v_item IN
      SELECT * FROM public.vaccination_registration_items
      WHERE id = ANY(p_item_ids) ORDER BY id
    LOOP
      SELECT * INTO v_vaccine FROM public.vaccination_vaccines
      WHERE id = v_item.vaccine_id;
      SELECT * INTO v_lot FROM public.vaccination_vaccine_lots
      WHERE id = v_item.lot_id;
      IF v_vaccine.id IS NULL OR v_lot.id IS NULL THEN
        RAISE EXCEPTION 'Katalog produk atau Lot tidak tersedia.';
      END IF;
      v_next_days := NULL;
      IF v_vaccine.default_next_dose_days > 0 THEN
        v_next_days := v_vaccine.default_next_dose_days;
      END IF;
      -- Match the optional series setting used by the existing queue helper.
      IF to_regclass('public.vaccination_vaccine_series_settings') IS NOT NULL THEN
        SELECT CASE WHEN s.is_series THEN to_jsonb(s.schedule) ELSE NULL END INTO v_schedule
        FROM public.vaccination_vaccine_series_settings s
        WHERE s.vaccine_id = v_item.vaccine_id LIMIT 1;
        IF jsonb_typeof(v_schedule) = 'array' THEN
          SELECT NULLIF(elt->>'next_due_days','')::integer INTO v_remaining
          FROM jsonb_array_elements(v_schedule) elt
          WHERE coalesce(elt->>'dose_number','') = greatest(1,v_item.dose_number)::text
          LIMIT 1;
          IF coalesce(v_remaining,0) > 0 THEN v_next_days := v_remaining; END IF;
        END IF;
      END IF;
      INSERT INTO public.vaccination_records (
        registration_id, session_id, participant_name, vaccine_id, lot_id,
        vaccine_name, lot_number, dose_number, administered_at, administered_by,
        next_due_date, notes, status
      ) VALUES (
        p_registration_id, v_registration.session_id, v_registration.participant_name,
        v_item.vaccine_id, v_item.lot_id, v_vaccine.name, v_lot.lot_number,
        greatest(1,coalesce(v_item.dose_number,1)), v_now, v_actor,
        CASE WHEN coalesce(v_next_days,0) > 0 THEN (v_now::date + v_next_days) ELSE NULL END,
        'QUEUE_DONE_SYNC:BAZAR · V623 item ' || v_item.id, 'ADMINISTERED'
      ) RETURNING id INTO v_record_id;
      UPDATE public.vaccination_vaccine_lots
        SET stock_used = coalesce(stock_used,0) + 1, updated_at = v_now
        WHERE id = v_item.lot_id;
      INSERT INTO public.vaccination_inventory_movements (
        vaccine_id, lot_id, movement_type, qty, reference_type, reference_id,
        notes, created_by
      ) VALUES (
        v_item.vaccine_id, v_item.lot_id, 'administered', -1,
        'vaccination_record', v_record_id,
        'QUEUE_DONE_SYNC:BAZAR · V623 item ' || v_item.id || ' · ' || v_registration.participant_name || ' · Lot ' || v_lot.lot_number,
        v_actor
      );
      UPDATE public.vaccination_registration_items
        SET status='ADMINISTERED', administered_record_id=v_record_id,
            administered_at=v_now, updated_at=v_now
        WHERE id=v_item.id;
      v_record_ids := array_append(v_record_ids, v_record_id);
    END LOOP;
  ELSE
    FOR v_item IN
      SELECT * FROM public.vaccination_registration_items
      WHERE id = ANY(p_item_ids) ORDER BY id
    LOOP
      INSERT INTO public.vaccination_validation_item_moves_v623 (
        item_id, registration_id, destination, active, note, moved_by, moved_at, updated_at
      ) VALUES (v_item.id, p_registration_id, 'CLINIC', true, v_note, v_actor, v_now, v_now)
      ON CONFLICT (item_id) DO UPDATE SET
        destination=EXCLUDED.destination, active=true,
        note=EXCLUDED.note, moved_by=EXCLUDED.moved_by,
        moved_at=EXCLUDED.moved_at, updated_at=EXCLUDED.updated_at;
      -- Deliberately NO stock, record, item.status or payment write on transfer.
    END LOOP;
  END IF;

  SELECT count(*) INTO v_remaining
  FROM public.vaccination_registration_items i
  WHERE i.registration_id=p_registration_id AND i.active IS TRUE
    AND upper(btrim(coalesce(i.service_mode,'')))='BAZAR'
    AND upper(btrim(coalesce(i.status,''))) NOT IN ('ADMINISTERED','DONE','FINISHED')
    AND NOT EXISTS (
      SELECT 1 FROM public.vaccination_validation_item_moves_v623 m
      WHERE m.item_id=i.id AND m.active IS TRUE
    );
  SELECT count(*) INTO v_non_bazar_pending
  FROM public.vaccination_registration_items i
  WHERE i.registration_id=p_registration_id AND i.active IS TRUE
    AND upper(btrim(coalesce(i.service_mode,'')))='HEALTHDAY'
    AND upper(btrim(coalesce(i.status,''))) NOT IN ('ADMINISTERED','DONE','FINISHED');
  v_final_status := CASE WHEN v_remaining=0 AND v_non_bazar_pending=0 THEN 'DONE' ELSE 'PENDING' END;
  -- Only clinical validation status is updated; never reset or reissue queue numbers.
  UPDATE public.vaccination_registrations SET
    validation_status=v_final_status,
    validated_by=CASE WHEN v_final_status='DONE' THEN v_actor ELSE validated_by END,
    validated_at=CASE WHEN v_final_status='DONE' THEN v_now ELSE validated_at END,
    updated_at=v_now
  WHERE id=p_registration_id;

  RETURN jsonb_build_object(
    'ok',true,'action',v_action,'registration_id',p_registration_id,
    'processed_items',cardinality(p_item_ids),'record_ids',to_jsonb(v_record_ids),
    'remaining_event_items',v_remaining,'validation_status',v_final_status
  );
END;
$v623$;

REVOKE ALL ON TABLE public.vaccination_validation_item_moves_v623 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.vaccination_validation_item_moves_v623 TO service_role;
REVOKE ALL ON FUNCTION public.vaccination_validation_bazar_item_action_v623(bigint,bigint[],text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vaccination_validation_bazar_item_action_v623(bigint,bigint[],text,text,text)
  TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';

-- READ-ONLY postcheck:
SELECT to_regprocedure('public.vaccination_validation_bazar_item_action_v623(bigint,bigint[],text,text,text)')
  AS v623_atomic_action_ready,
       to_regclass('public.vaccination_validation_item_moves_v623') AS v623_move_audit_ready;
