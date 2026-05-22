-- =========================================================
-- v33 Parameter Kelulusan + Dashboard Lulus/Tidak Lulus
-- Jalankan di Supabase SQL Editor.
-- =========================================================

CREATE TABLE IF NOT EXISTS graduation_rules (
  id SERIAL PRIMARY KEY,
  package_id INTEGER UNIQUE REFERENCES packages(id) ON DELETE CASCADE,
  program_type TEXT DEFAULT 'capaska',
  pass_min_score NUMERIC DEFAULT 0,
  pass_max_score NUMERIC DEFAULT 999999,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_graduation_rules_program_v33
ON graduation_rules(program_type);

CREATE INDEX IF NOT EXISTS idx_graduation_rules_package_v33
ON graduation_rules(package_id);

-- Seed default rule untuk semua paket aktif.
-- Default range dibuat longgar: 0 - 999999.
-- Admin bisa ubah di menu Parameter Kelulusan.
INSERT INTO graduation_rules (
  package_id,
  program_type,
  pass_min_score,
  pass_max_score,
  description,
  is_active
)
SELECT
  packages.id,
  packages.program_type,
  0,
  999999,
  'Default: ubah range ini di menu Parameter Kelulusan',
  1
FROM packages
WHERE COALESCE(packages.is_active, 1) = 1
  AND NOT EXISTS (
    SELECT 1
    FROM graduation_rules existing
    WHERE existing.package_id = packages.id
  );

NOTIFY pgrst, 'reload schema';
