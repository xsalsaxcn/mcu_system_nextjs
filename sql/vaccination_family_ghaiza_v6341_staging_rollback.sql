-- V6341 carry-forward V633.9 FAMILY correction rehearsal: BINUS School Bekasi, vaccination Session 192 only
-- *** STAGING CLONE ONLY *** DO NOT RUN IN PRODUCTION.
-- Everything is rolled back. Do not change ROLLBACK to COMMIT.
-- Source for expected IDs/roles: per-session CSV (96) as of 2026-11-14.
-- Family identity was confirmed by operator: Henri Sekar Wangi (mother),
-- Ghaiza Zafeera Ramadhani (child), Keena Aaditri Novrisa (child).
-- BINUSIAN ID BN001557105 is SHARED; it is NOT a unique person identifier.
-- No clinical record, payment, item, inventory, queue, stock or other sessions are modified.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtextextended('vaccination-family-v6339-company1-session192', 0));

DO $v6339$
DECLARE
  v_people integer;
  v_links integer;
  v_regs integer;
BEGIN
  -- Lock exactly the known person, link and registration rows.
  PERFORM id FROM public.vaccination_persons WHERE id IN (2121,2122,2123) ORDER BY id FOR UPDATE;
  PERFORM id FROM public.vaccination_person_relationships WHERE id IN (366,371) ORDER BY id FOR UPDATE;
  PERFORM id FROM public.vaccination_registrations WHERE id IN (5530,5572) ORDER BY id FOR UPDATE;

  SELECT count(*) INTO v_people FROM public.vaccination_persons
  WHERE company_id=1 AND active IS TRUE AND (
    (id=2121 AND participant_name='Ghaiza Zafeera Ramadhani' AND participant_type='EMPLOYEE' AND employee_key='BN001557105') OR
    (id=2122 AND participant_name='Keena Aaditri Novrisa' AND participant_type='DEPENDENT' AND employee_key='BN001557105') OR
    (id=2123 AND participant_name='Henri Sekar Wangi' AND participant_type='DEPENDENT' AND employee_id IS NULL)
  );
  IF v_people <> 3 THEN RAISE EXCEPTION 'V6341 STOP: person identity/role differs from CSV96: expected 3, got %',v_people; END IF;
  SELECT count(*) INTO v_links FROM public.vaccination_person_relationships
  WHERE company_id=1 AND active IS TRUE AND (
    (id=366 AND parent_person_id=2121 AND dependent_person_id=2122) OR
    (id=371 AND parent_person_id=2121 AND dependent_person_id=2123)
  );
  IF v_links <> 2 THEN RAISE EXCEPTION 'V6341 STOP: family relationships have changed'; END IF;
  IF (SELECT count(*) FROM public.vaccination_person_relationships
      WHERE active IS TRUE AND (parent_person_id IN (2121,2122,2123) OR dependent_person_id IN (2121,2122,2123))) <> 2
  THEN RAISE EXCEPTION 'V6341 STOP: unexpected additional active relation'; END IF;
  IF EXISTS (SELECT 1 FROM public.vaccination_person_relationships
        WHERE company_id=1 AND parent_person_id=2123 AND dependent_person_id IN (2121,2122))
  THEN RAISE EXCEPTION 'V6341 STOP: desired parent relationship already exists/inactive; manual review'; END IF;

  SELECT count(*) INTO v_regs FROM public.vaccination_registrations WHERE
   (id=5530 AND session_id=192 AND participant_name='Ghaiza Zafeera Ramadhani'
      AND employee_id='BN001557105' AND family_role='PARENT'
      AND history_person_id IS NULL AND parent_history_person_id IS NULL)
   OR
   (id=5572 AND session_id=192 AND participant_name='Keena Aaditri Novrisa'
      AND employee_id='BN001557105' AND family_role='DEPENDENT'
      AND history_person_id=2122 AND parent_history_person_id=2121);
  IF v_regs <> 2 THEN RAISE EXCEPTION 'V6341 STOP: session 192 registrations changed'; END IF;
  IF EXISTS (SELECT 1 FROM public.vaccination_registrations
    WHERE id NOT IN (5530,5572)
      AND (history_person_id IN (2121,2122,2123) OR parent_history_person_id IN (2121,2122,2123)))
  THEN RAISE EXCEPTION 'V6341 STOP: other registrations reference family; expand preflight first'; END IF;
  IF EXISTS (SELECT 1 FROM public.vaccination_records WHERE registration_id IN (5530,5572))
  THEN RAISE EXCEPTION 'V6341 STOP: active clinical record present; review before any family correction'; END IF;

  -- STAGING TRANSACTION REHEARSAL. No commits; ROLLBACK below is mandatory.
  UPDATE public.vaccination_persons SET participant_type='EMPLOYEE',
       employee_id='BN001557105', employee_key='BN001557105', updated_at=now()
   WHERE id=2123 AND company_id=1;
  UPDATE public.vaccination_persons SET participant_type='DEPENDENT',updated_at=now()
   WHERE id=2121 AND company_id=1;
  UPDATE public.vaccination_person_relationships SET parent_person_id=2123,
       dependent_person_id=2121,relationship_type='CHILD',updated_at=now()
   WHERE id=371 AND company_id=1;
  UPDATE public.vaccination_person_relationships SET parent_person_id=2123,
       dependent_person_id=2122,relationship_type='CHILD',updated_at=now()
   WHERE id=366 AND company_id=1;
  UPDATE public.vaccination_registrations SET family_role='DEPENDENT',
       history_person_id=2121,parent_history_person_id=2123
   WHERE id=5530 AND session_id=192;
  UPDATE public.vaccination_registrations SET parent_history_person_id=2123
   WHERE id=5572 AND session_id=192;

  IF (SELECT count(*) FROM public.vaccination_person_relationships
      WHERE active AND company_id=1 AND parent_person_id=2123 AND
         dependent_person_id IN (2121,2122) AND relationship_type='CHILD') <> 2
  THEN RAISE EXCEPTION 'V6341 STOP: final family graph assertion failed'; END IF;
  RAISE NOTICE 'V6341 staged family correction passed (transaction will ROLLBACK)';
END;
$v6339$;

SELECT id, participant_name,participant_type,employee_id
  FROM public.vaccination_persons WHERE id IN (2121,2122,2123) ORDER BY id;
SELECT id,parent_person_id,dependent_person_id,relationship_type,active
  FROM public.vaccination_person_relationships WHERE id IN (366,371) ORDER BY id;
SELECT id,session_id,participant_name,family_role,history_person_id,parent_history_person_id
  FROM public.vaccination_registrations WHERE id IN (5530,5572) ORDER BY id;
ROLLBACK;
-- This rehearsal DOES NOT satisfy backup/PITR, full trigger/dependency review,
-- audit persistence, isolated staging regression, nor Production authorization.
