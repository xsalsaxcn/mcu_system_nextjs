-- V6342 / Vaccination History Sibling / schema proposal only.
-- DO NOT EXECUTE ON PRODUCTION without tested staging migration, backup/PITR and admin approval.
-- No parent-child, employee role, service, stock or clinical record changes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.vaccination_family_siblings_v6342 (
  id bigserial PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.vaccination_history_companies(id) ON DELETE RESTRICT,
  person_a_id bigint NOT NULL REFERENCES public.vaccination_persons(id) ON DELETE RESTRICT,
  person_b_id bigint NOT NULL REFERENCES public.vaccination_persons(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vaccination_family_siblings_order_v6342 CHECK (person_a_id < person_b_id),
  CONSTRAINT vaccination_family_siblings_unique_v6342 UNIQUE (company_id,person_a_id,person_b_id)
);
CREATE INDEX IF NOT EXISTS vaccination_family_siblings_a_v6342_idx ON public.vaccination_family_siblings_v6342(company_id,person_a_id) WHERE active;
CREATE INDEX IF NOT EXISTS vaccination_family_siblings_b_v6342_idx ON public.vaccination_family_siblings_v6342(company_id,person_b_id) WHERE active;
ALTER TABLE public.vaccination_family_siblings_v6342 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vaccination_family_siblings_v6342 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.vaccination_family_siblings_v6342 TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vaccination_family_siblings_v6342_id_seq TO service_role;
CREATE OR REPLACE FUNCTION public.vaccination_family_sibling_guard_v6342()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(6342);
  IF NOT EXISTS (SELECT 1 FROM public.vaccination_persons p
                 WHERE p.id=NEW.person_a_id AND p.company_id=NEW.company_id AND p.active)
     OR NOT EXISTS (SELECT 1 FROM public.vaccination_persons p
                    WHERE p.id=NEW.person_b_id AND p.company_id=NEW.company_id AND p.active)
  THEN RAISE EXCEPTION 'Both siblings must be distinct active History persons of one company'; END IF;
  IF EXISTS (SELECT 1 FROM public.vaccination_person_relationships r
             WHERE r.company_id=NEW.company_id AND r.active
               AND ((r.parent_person_id=NEW.person_a_id AND r.dependent_person_id=NEW.person_b_id)
                 OR (r.parent_person_id=NEW.person_b_id AND r.dependent_person_id=NEW.person_a_id)))
  THEN RAISE EXCEPTION 'Cannot create sibling link over an active Parent-Child link: correct the old link first'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS vaccination_family_sibling_guard_v6342_trg ON public.vaccination_family_siblings_v6342;
CREATE TRIGGER vaccination_family_sibling_guard_v6342_trg
BEFORE INSERT OR UPDATE ON public.vaccination_family_siblings_v6342
FOR EACH ROW EXECUTE FUNCTION public.vaccination_family_sibling_guard_v6342();
COMMIT;
