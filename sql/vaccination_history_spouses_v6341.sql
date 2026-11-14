-- V6341 vaccination-only / independent SPOUSE links.
-- CHANGE CONTROL REQUIRED: apply only after isolated STAGING migration + tests,
-- backup/PITR validation and explicit DB administrator approval.
-- This SQL is NOT executed by the V6341 one-shot Git runner.
BEGIN;
CREATE TABLE IF NOT EXISTS public.vaccination_family_spouses_v6341 (
  id bigserial PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.vaccination_history_companies(id) ON DELETE RESTRICT,
  person_a_id bigint NOT NULL REFERENCES public.vaccination_persons(id) ON DELETE RESTRICT,
  person_b_id bigint NOT NULL REFERENCES public.vaccination_persons(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vaccination_family_spouse_canonical_v6341 CHECK (person_a_id < person_b_id),
  CONSTRAINT vaccination_family_spouse_unique_v6341 UNIQUE(company_id, person_a_id, person_b_id)
);
CREATE INDEX IF NOT EXISTS vaccination_family_spouse_a_v6341_idx ON public.vaccination_family_spouses_v6341(company_id, person_a_id) WHERE active;
CREATE INDEX IF NOT EXISTS vaccination_family_spouse_b_v6341_idx ON public.vaccination_family_spouses_v6341(company_id, person_b_id) WHERE active;
ALTER TABLE public.vaccination_family_spouses_v6341 ENABLE ROW LEVEL SECURITY;
-- Only service-role server routes may access the relationships; no public client write.
REVOKE ALL ON public.vaccination_family_spouses_v6341 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.vaccination_family_spouses_v6341 TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vaccination_family_spouses_v6341_id_seq TO service_role;
-- Prevent cross-company pair links even from a service-role bug.
CREATE OR REPLACE FUNCTION public.vaccination_family_spouse_guard_v6341()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Serialize all spouse writes to avoid two concurrent requests creating
  -- incompatible active spouses for the same profile.
  PERFORM pg_advisory_xact_lock(6341);
  IF EXISTS (SELECT 1 FROM public.vaccination_family_spouses_v6341 link
             WHERE link.company_id=NEW.company_id AND link.active
               AND link.id <> COALESCE(NEW.id, -1)
               AND (link.person_a_id IN (NEW.person_a_id,NEW.person_b_id)
                 OR link.person_b_id IN (NEW.person_a_id,NEW.person_b_id)))
  THEN RAISE EXCEPTION 'One of the participants already has an active spouse relationship';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vaccination_persons p
                 WHERE p.id=NEW.person_a_id AND p.company_id=NEW.company_id AND p.active)
     OR NOT EXISTS (SELECT 1 FROM public.vaccination_persons p
                    WHERE p.id=NEW.person_b_id AND p.company_id=NEW.company_id AND p.active)
  THEN RAISE EXCEPTION 'Spouse pair must reference two active people of the same company';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS vaccination_family_spouse_guard_v6341_trg ON public.vaccination_family_spouses_v6341;
CREATE TRIGGER vaccination_family_spouse_guard_v6341_trg BEFORE INSERT OR UPDATE ON public.vaccination_family_spouses_v6341
FOR EACH ROW EXECUTE FUNCTION public.vaccination_family_spouse_guard_v6341();
COMMIT;
