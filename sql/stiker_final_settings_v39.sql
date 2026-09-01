-- =========================================================
-- v39 FINAL STIKER LABEL 40x30
-- Jalankan di Supabase SQL Editor.
-- Aman dijalankan ulang.
-- =========================================================

CREATE TABLE IF NOT EXISTS package_label_print_settings (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  program_type TEXT DEFAULT 'capaska',
  station_key TEXT NOT NULL,
  station_label TEXT NOT NULL,
  short_code TEXT DEFAULT '',
  default_copies INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(package_id, station_key)
);

ALTER TABLE package_label_print_settings
ADD COLUMN IF NOT EXISTS font_size INTEGER DEFAULT 9;

ALTER TABLE package_label_print_settings
ADD COLUMN IF NOT EXISTS show_border INTEGER DEFAULT 0;

ALTER TABLE package_label_print_settings
ADD COLUMN IF NOT EXISTS show_qr INTEGER DEFAULT 1;

ALTER TABLE package_label_print_settings
ADD COLUMN IF NOT EXISTS show_footer_text INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_package_label_print_settings_package_v39
ON package_label_print_settings(package_id);

CREATE INDEX IF NOT EXISTS idx_package_label_print_settings_program_v39
ON package_label_print_settings(program_type);

-- Seed default station untuk semua paket aktif yang belum punya setting.
WITH station_defaults(station_key, station_label, short_code, default_copies) AS (
  VALUES
  ('registrasi_ulang', 'REGISTRASI ULANG', 'REG', 1),
  ('pemeriksaan_fisik', 'PEMERIKSAAN FISIK', 'FISIK', 1),
  ('darah', 'DARAH', 'DRH', 1),
  ('urine', 'URINE', 'URN', 1),
  ('dokter', 'DOKTER', 'DOK', 1),
  ('rontgen', 'RONTGEN', 'RO', 1),
  ('ekg_hasil', 'EKG - HASIL', 'EKG', 1),
  ('ekg_nakes', 'EKG - NAKES', 'EKG', 1),
  ('audio', 'AUDIO', 'AUD', 1),
  ('mata', 'MATA', 'MATA', 1),
  ('tht', 'THT', 'THT', 1),
  ('gigi', 'GIGI', 'GIGI', 2),
  ('penyakit_dalam', 'PENYAKIT DALAM', 'PD', 1),
  ('jantung', 'JANTUNG', 'JTG', 1),
  ('radiologi', 'RADIOLOGI', 'RAD', 1),
  ('ortopedi', 'ORTOPEDI', 'ORT', 1)
)
INSERT INTO package_label_print_settings (
  package_id,
  program_type,
  station_key,
  station_label,
  short_code,
  default_copies,
  font_size,
  show_border,
  show_qr,
  show_footer_text,
  is_active
)
SELECT
  packages.id,
  packages.program_type,
  station_defaults.station_key,
  station_defaults.station_label,
  station_defaults.short_code,
  station_defaults.default_copies,
  9,
  0,
  1,
  1,
  1
FROM packages
CROSS JOIN station_defaults
WHERE COALESCE(packages.is_active, 1) = 1
  AND NOT EXISTS (
    SELECT 1
    FROM package_label_print_settings existing
    WHERE existing.package_id = packages.id
      AND existing.station_key = station_defaults.station_key
  );

-- Final style setting untuk semua setting yang sudah ada.
-- Ini tidak mengubah jumlah print yang sudah pernah diatur; hanya style stiker.
UPDATE package_label_print_settings
SET
  font_size = 9,
  show_border = 0,
  show_qr = 1,
  show_footer_text = 1,
  updated_at = CURRENT_TIMESTAMP
WHERE COALESCE(is_active, 1) = 1;

NOTIFY pgrst, 'reload schema';
