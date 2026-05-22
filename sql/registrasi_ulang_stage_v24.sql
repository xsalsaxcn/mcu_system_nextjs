-- =========================================================
-- v24 Registrasi Ulang Stage + Identity/Photo Columns
-- Jalankan di Supabase SQL Editor sebelum memakai menu Registrasi Ulang.
-- Aman dijalankan berulang.
-- =========================================================

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS employee_nik TEXT;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS birth_date DATE;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS date_of_birth DATE;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS age INTEGER;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS examination_date DATE;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS exam_date DATE;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS department TEXT;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS photo_url TEXT;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS photo_data_url TEXT;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS photo_updated_at TIMESTAMP DEFAULT NULL;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS registrasi_ulang_done INTEGER DEFAULT 0;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS registrasi_ulang_at TIMESTAMP DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_participants_employee_nik_v24
ON participants(employee_nik);

CREATE INDEX IF NOT EXISTS idx_participants_birth_date_v24
ON participants(birth_date);

CREATE INDEX IF NOT EXISTS idx_participants_date_of_birth_v24
ON participants(date_of_birth);

CREATE INDEX IF NOT EXISTS idx_participants_examination_date_v24
ON participants(examination_date);

CREATE INDEX IF NOT EXISTS idx_participants_registrasi_ulang_v24
ON participants(registrasi_ulang_done, registrasi_ulang_at);

-- =========================================================
-- Tambahkan stage Registrasi Ulang untuk CAPASKA dan Corporate
-- =========================================================

WITH ref_posts(name, description, program_type, is_active) AS (
  VALUES
  ('Registrasi Ulang', 'Retrieve data, foto peserta, edit identitas, dan print barcode registrasi ulang', 'capaska', 1),
  ('Registrasi Ulang', 'Retrieve data, foto peserta, edit identitas, dan print barcode registrasi ulang', 'corporate', 1)
)
INSERT INTO posts (name, description, program_type, is_active)
SELECT name, description, program_type, is_active
FROM ref_posts
WHERE NOT EXISTS (
  SELECT 1
  FROM posts p
  WHERE LOWER(p.name) = LOWER(ref_posts.name)
    AND p.program_type = ref_posts.program_type
);

WITH reg_posts AS (
  SELECT id, program_type
  FROM posts
  WHERE name = 'Registrasi Ulang'
),
ref_params AS (
  SELECT
    reg_posts.id AS post_id,
    reg_posts.program_type,
    'Status Registrasi Ulang'::TEXT AS name,
    'Registrasi Ulang'::TEXT AS category,
    ''::TEXT AS unit,
    'radio'::TEXT AS input_type,
    ''::TEXT AS normal_value,
    'Stage otomatis Done setelah admin klik Save pada menu Registrasi Ulang.'::TEXT AS reference_text,
    '["Done","Belum","Perlu Verifikasi"]'::TEXT AS config_json,
    1::INTEGER AS is_required,
    1::INTEGER AS is_active,
    10::INTEGER AS sort_order
  FROM reg_posts
  UNION ALL
  SELECT
    reg_posts.id,
    reg_posts.program_type,
    'Data Identitas Terverifikasi',
    'Registrasi Ulang',
    '',
    'radio',
    '',
    'Konfirmasi data identitas peserta sudah benar.',
    '["Ya","Tidak"]',
    0,
    1,
    20
  FROM reg_posts
  UNION ALL
  SELECT
    reg_posts.id,
    reg_posts.program_type,
    'Foto Registrasi Ulang',
    'Registrasi Ulang',
    '',
    'radio',
    '',
    'Konfirmasi foto peserta sudah tersedia.',
    '["Ada","Tidak Ada"]',
    0,
    1,
    30
  FROM reg_posts
)
INSERT INTO parameters (
  name, category, post_id, unit, input_type, normal_value,
  reference_text, config_json, is_required, is_active, sort_order, program_type
)
SELECT
  name, category, post_id, unit, input_type, normal_value,
  reference_text, config_json, is_required, is_active, sort_order, program_type
FROM ref_params
WHERE NOT EXISTS (
  SELECT 1
  FROM parameters p
  WHERE p.post_id = ref_params.post_id
    AND LOWER(p.name) = LOWER(ref_params.name)
    AND p.program_type = ref_params.program_type
);

-- Mapping parameter Registrasi Ulang ke semua package aktif sesuai program.
INSERT INTO package_parameters (package_id, parameter_id)
SELECT packages.id, parameters.id
FROM packages
JOIN parameters ON parameters.program_type = packages.program_type
JOIN posts ON posts.id = parameters.post_id
WHERE posts.name = 'Registrasi Ulang'
  AND COALESCE(packages.is_active, 1) = 1
  AND COALESCE(parameters.is_active, 1) = 1
  AND NOT EXISTS (
    SELECT 1
    FROM package_parameters pp
    WHERE pp.package_id = packages.id
      AND pp.parameter_id = parameters.id
  );
