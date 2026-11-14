-- V6342 READ ONLY: scoped identity and family audit before any reconciliation.
-- For Supabase SQL Editor. Never writes; results must be reviewed, not auto-applied.
WITH scope AS (
  SELECT id, company_name
  FROM public.vaccination_history_companies
  WHERE lower(company_name) LIKE '%bina nusantara%'
), profiles AS (
  SELECT 'MASTER_HISTORY'::text AS source, p.id::bigint AS source_id,
    p.participant_name::text AS participant_name,
    p.employee_id::text AS employee_or_family_id,
    right(coalesce(p.nik::text,''),4) AS nik_last4,
    p.email::text AS email,
    p.participant_type::text AS source_role,
    p.company_id::bigint AS company_id,
    p.active::text AS active,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('parent_id',r.parent_person_id,'relation_id',r.id,'relation_type',r.relationship_type))
      FROM public.vaccination_person_relationships r WHERE r.dependent_person_id=p.id AND r.active), '[]'::jsonb) AS parent_links
  FROM public.vaccination_persons p JOIN scope s ON s.id=p.company_id
  WHERE p.participant_name ILIKE ANY(ARRAY[
    '%Mikhael Nararya%', '%Raphael Narendra%', '%Sekar Wulan%', '%Emmanuel C%',
    '%Ekky Imanjaya%', '%Dian Anggraini%', '%Ghaiza Zafeera%', '%Keena Aaditri%', '%Henri Sekar%'
  ])
), registrations AS (
  SELECT 'REGISTRATION'::text AS source, r.id::bigint AS source_id,
    r.participant_name::text AS participant_name,
    r.employee_id::text AS employee_or_family_id,
    right(coalesce(r.nik::text,''),4) AS nik_last4,
    r.email::text AS email,
    r.family_role::text AS source_role,
    NULL::bigint AS company_id,
    NULL::text AS active,
    jsonb_build_array(jsonb_build_object('history_person_id',r.history_person_id,'session_id',r.session_id,'validation_status',r.validation_status)) AS parent_links
  FROM public.vaccination_registrations r
  WHERE r.participant_name ILIKE ANY(ARRAY[
    '%Mikhael Nararya%', '%Raphael Narendra%', '%Sekar Wulan%', '%Emmanuel C%',
    '%Ekky Imanjaya%', '%Dian Anggraini%', '%Ghaiza Zafeera%', '%Keena Aaditri%', '%Henri Sekar%'
  ])
)
SELECT * FROM profiles
UNION ALL SELECT * FROM registrations
ORDER BY participant_name, source, source_id;
