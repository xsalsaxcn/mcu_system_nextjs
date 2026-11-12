-- V627 FAMILY IDENTITY EDIT: staging first, manual Production after tested backup.
-- Creates one auditable RPC. NO automatic edits to patients, registration status, stock, clinical events, payment, family relationships.
BEGIN;
CREATE TABLE IF NOT EXISTS public.vaccination_identity_edit_audit_v627 (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_kind text NOT NULL CHECK (target_kind IN ('PERSON','REGISTRATION')),
  target_id bigint NOT NULL,
  company_key text NOT NULL,
  before_identity jsonb NOT NULL,
  after_identity jsonb NOT NULL,
  reason text NOT NULL,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.vaccination_identity_edit_audit_v627 FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.vaccination_identity_edit_audit_v627 TO service_role;

CREATE OR REPLACE FUNCTION public.vaccination_family_identity_edit_v627(
 p_kind text, p_id bigint, p_company_key text, p_expected_name text,
 p_values jsonb, p_reason text, p_actor text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
 v_before jsonb;
 v_after jsonb;
 v_company text;
 v_name text;
 v_key text;
 v_field text;
 v_person public.vaccination_persons%ROWTYPE;
 v_reg public.vaccination_registrations%ROWTYPE;
BEGIN
 IF p_kind NOT IN ('PERSON','REGISTRATION') OR p_id IS NULL OR p_id < 1 THEN
  RAISE EXCEPTION 'Target tidak valid'; END IF;
 IF p_company_key IS NULL OR btrim(p_company_key) = '' OR p_actor IS NULL OR btrim(p_actor) = '' OR length(btrim(coalesce(p_reason,''))) < 8 THEN
  RAISE EXCEPTION 'Perusahaan, aktor, dan alasan koreksi wajib valid'; END IF;
 IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Identitas harus object'; END IF;
 FOR v_field IN SELECT jsonb_object_keys(p_values) LOOP
  IF v_field NOT IN ('name','employeeId','nik','email','phone','birthDate','gender') OR
   (p_kind = 'REGISTRATION' AND v_field IN ('birthDate','gender')) THEN
   RAISE EXCEPTION 'Field identitas tidak diizinkan: %', v_field;
  END IF;
 END LOOP;
 v_name := btrim(coalesce(p_values->>'name',''));
 IF length(v_name) < 2 OR length(v_name) > 150 THEN RAISE EXCEPTION 'Nama baru tidak valid'; END IF;
 IF length(coalesce(p_values->>'email','')) > 254 THEN RAISE EXCEPTION 'Email terlalu panjang'; END IF;
 IF nullif(btrim(coalesce(p_values->>'email','')),'') IS NOT NULL AND
   btrim(p_values->>'email') !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
  RAISE EXCEPTION 'Email tidak valid'; END IF;

 IF p_kind = 'PERSON' THEN
  SELECT p.* INTO v_person FROM public.vaccination_persons p
   JOIN public.vaccination_history_companies c ON c.id = p.company_id
   WHERE p.id = p_id AND p.active = true AND c.company_key = p_company_key AND c.active = true
   FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil tidak ditemukan dalam perusahaan ini'; END IF;
  IF lower(btrim(v_person.participant_name)) <> lower(btrim(p_expected_name)) THEN RAISE EXCEPTION 'Nama profil berubah, muat ulang'; END IF;
  v_before := jsonb_build_object('name',v_person.participant_name,'employeeId',v_person.employee_id,'nik',v_person.nik,
      'email',v_person.email,'phone',v_person.phone,'birthDate',v_person.birth_date,'gender',v_person.gender);
  IF nullif(btrim(coalesce(p_values->>'birthDate','')),'') IS NOT NULL THEN
   IF (p_values->>'birthDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Tanggal lahir tidak valid'; END IF;
  END IF;
  UPDATE public.vaccination_persons p SET
   participant_name = v_name,
   name_key = CASE WHEN v_name IS DISTINCT FROM p.participant_name THEN btrim(regexp_replace(lower(v_name),'[^a-z0-9]+',' ','g')) ELSE p.name_key END,
   employee_id = CASE WHEN p_values ? 'employeeId' THEN nullif(btrim(p_values->>'employeeId'),'') ELSE p.employee_id END,
   employee_key = CASE WHEN (p_values ? 'employeeId') AND nullif(btrim(p_values->>'employeeId'),'') IS DISTINCT FROM p.employee_id THEN nullif(regexp_replace(upper(p_values->>'employeeId'),'[^A-Z0-9]','','g'),'') ELSE p.employee_key END,
   nik = CASE WHEN p_values ? 'nik' THEN nullif(btrim(p_values->>'nik'),'') ELSE p.nik END,
   nik_key = CASE WHEN (p_values ? 'nik') AND nullif(btrim(p_values->>'nik'),'') IS DISTINCT FROM p.nik THEN nullif(regexp_replace(upper(p_values->>'nik'),'[^A-Z0-9]','','g'),'') ELSE p.nik_key END,
   email = CASE WHEN p_values ? 'email' THEN nullif(lower(btrim(p_values->>'email')),'') ELSE p.email END,
   email_key = CASE WHEN (p_values ? 'email') AND nullif(lower(btrim(p_values->>'email')),'') IS DISTINCT FROM p.email THEN nullif(lower(btrim(p_values->>'email')),'') ELSE p.email_key END,
   phone = CASE WHEN p_values ? 'phone' THEN nullif(btrim(p_values->>'phone'),'') ELSE p.phone END,
   birth_date = CASE WHEN p_values ? 'birthDate' THEN nullif(btrim(p_values->>'birthDate'),'')::date ELSE p.birth_date END,
   gender = CASE WHEN p_values ? 'gender' THEN nullif(btrim(p_values->>'gender'),'') ELSE p.gender END,
   updated_at = now()
  WHERE p.id = p_id;
  SELECT jsonb_build_object('name',p.participant_name,'employeeId',p.employee_id,'nik',p.nik,'email',p.email,
     'phone',p.phone,'birthDate',p.birth_date,'gender',p.gender) INTO v_after
   FROM public.vaccination_persons p WHERE p.id = p_id;
 ELSE
  SELECT r.* INTO v_reg FROM public.vaccination_registrations r
   JOIN public.vaccination_sessions s ON s.id = r.session_id
   WHERE r.id = p_id AND
     trim(both '-' from regexp_replace(lower(btrim(s.company_name)),'[^a-z0-9]+','-','g')) = p_company_key
   FOR UPDATE OF r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registrasi tidak ditemukan dalam perusahaan ini'; END IF;
  IF lower(btrim(v_reg.participant_name)) <> lower(btrim(p_expected_name)) THEN RAISE EXCEPTION 'Nama registrasi berubah, muat ulang'; END IF;
  v_before := jsonb_build_object('name',v_reg.participant_name,'employeeId',v_reg.employee_id,'nik',v_reg.nik,
      'email',v_reg.email,'phone',v_reg.phone);
  UPDATE public.vaccination_registrations r SET
   participant_name = v_name,
   employee_id = CASE WHEN p_values ? 'employeeId' THEN nullif(btrim(p_values->>'employeeId'),'') ELSE r.employee_id END,
   nik = CASE WHEN p_values ? 'nik' THEN nullif(btrim(p_values->>'nik'),'') ELSE r.nik END,
   email = CASE WHEN p_values ? 'email' THEN nullif(lower(btrim(p_values->>'email')),'') ELSE r.email END,
   phone = CASE WHEN p_values ? 'phone' THEN nullif(btrim(p_values->>'phone'),'') ELSE r.phone END
   WHERE r.id = p_id;
  SELECT jsonb_build_object('name',r.participant_name,'employeeId',r.employee_id,'nik',r.nik,'email',r.email,
      'phone',r.phone) INTO v_after FROM public.vaccination_registrations r WHERE r.id = p_id;
 END IF;
 IF v_before = v_after THEN RETURN jsonb_build_object('unchanged',true,'targetKind',p_kind,'targetId',p_id); END IF;
 INSERT INTO public.vaccination_identity_edit_audit_v627
  (target_kind,target_id,company_key,before_identity,after_identity,reason,changed_by)
 VALUES (p_kind,p_id,p_company_key,v_before,v_after,btrim(p_reason),btrim(p_actor));
 RETURN jsonb_build_object('saved',true,'targetKind',p_kind,'targetId',p_id);
END;
$$;
REVOKE ALL ON FUNCTION public.vaccination_family_identity_edit_v627(text,bigint,text,text,jsonb,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vaccination_family_identity_edit_v627(text,bigint,text,text,jsonb,text,text) TO service_role;
COMMIT;
