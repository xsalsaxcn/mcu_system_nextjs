-- =========================================================
-- v38 Registrasi Ulang Progress Fix
-- Jalankan di Supabase SQL Editor.
-- =========================================================

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS registrasi_ulang_done INTEGER DEFAULT 0;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS registrasi_ulang_at TIMESTAMP;

ALTER TABLE participants
ALTER COLUMN registrasi_ulang_done SET DEFAULT 0;

UPDATE participants
SET registrasi_ulang_done = 0
WHERE registrasi_ulang_done IS NULL;

-- Pastikan parameter marker Registrasi Ulang ada untuk semua program/post yang sudah dibuat.
-- Jika post "Registrasi Ulang" belum ada, query ini tidak membuat post baru.
INSERT INTO parameters (
  name,
  category,
  post_id,
  unit,
  input_type,
  normal_value,
  reference_text,
  reference_image_path,
  config_json,
  is_required,
  is_active,
  sort_order,
  program_type
)
SELECT
  'Status Registrasi Ulang',
  'Registrasi Ulang',
  posts.id,
  '',
  'select',
  'Done',
  'Marker otomatis ketika tim registrasi klik Save.',
  '',
  '["Done"]',
  1,
  1,
  1,
  posts.program_type
FROM posts
WHERE LOWER(posts.name) = 'registrasi ulang'
  AND NOT EXISTS (
    SELECT 1
    FROM parameters
    WHERE parameters.post_id = posts.id
      AND LOWER(parameters.name) = 'status registrasi ulang'
  );

NOTIFY pgrst, 'reload schema';
