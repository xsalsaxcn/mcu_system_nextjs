-- =========================================================
-- CAPASKA REFERENCE PARAMETER SEED v8
-- Source: screenshot reference Pemeriksaan CAPASKA 2025
--
-- Cara pakai:
-- 1. Supabase > SQL Editor > New query
-- 2. Paste seluruh isi file ini
-- 3. Klik Run
--
-- Efek:
-- - Parameter CAPASKA lama dinonaktifkan, bukan dihapus.
-- - Parameter reference baru dibuat/diupdate dan diaktifkan.
-- - Semua package CAPASKA aktif otomatis dimapping ke parameter reference aktif.
-- =========================================================

BEGIN;

-- Nonaktifkan parameter CAPASKA lama supaya tidak tampil lagi di form operator.
UPDATE parameters
SET is_active = 0
WHERE program_type = 'capaska';

WITH ref(post_name, parameter_name, category, unit, input_type, normal_value, reference_text, config_json, is_required, sort_order) AS (
  VALUES
  ('Registrasi CAPASKA', 'Status Registrasi CAPASKA', 'Registrasi CAPASKA', '', 'radio', '', '', '["Done", "Belum", "Perlu Verifikasi"]'::jsonb::text, 0, 10),
('Registrasi CAPASKA', 'Identitas Terverifikasi', 'Registrasi CAPASKA', '', 'radio', '', '', '["Ya", "Tidak"]'::jsonb::text, 0, 20),
('Registrasi CAPASKA', 'Barcode / Label Terpasang', 'Registrasi CAPASKA', '', 'radio', '', '', '["Ya", "Tidak"]'::jsonb::text, 0, 30),
('Registrasi CAPASKA', 'Catatan Registrasi', 'Registrasi CAPASKA', '', 'textarea', '', '', '[]'::jsonb::text, 0, 40),
('Kesehatan Mata', 'Lensakontak / kaca mata', 'Kesehatan Mata', '', 'radio', '', '', '["Menggunakan", "Tidak menggunakan"]'::jsonb::text, 0, 10),
('Kesehatan Mata', 'Value Lensakontak / kaca mata', 'Kesehatan Mata', '', 'text', '', '', '[]'::jsonb::text, 0, 20),
('Kesehatan Mata', 'Tes buta warna', 'Kesehatan Mata', '', 'radio', '', '', '["Tidak buta warna", "Buta warna parsial", "Buta warna total"]'::jsonb::text, 0, 30),
('Kesehatan Mata', 'Value buta warna', 'Kesehatan Mata', '', 'text', '', '', '[]'::jsonb::text, 0, 40),
('Kesehatan Mata', 'Strabismus / Juling', 'Kesehatan Mata', '', 'radio', '', '', '["(+)/(-)", "(-)/(+)", "(+)/(+)", "(-)/(-)"]'::jsonb::text, 0, 50),
('Kesehatan Mata', 'Value Strabismus / Juling', 'Kesehatan Mata', '', 'text', '', '', '[]'::jsonb::text, 0, 60),
('Kesehatan Mata', 'Pemeriksaan Visus OD / OS', 'Kesehatan Mata', '', 'radio', '', '', '["Normal 6/6", "<6/6 - 6/12", "<6/12"]'::jsonb::text, 0, 70),
('Kesehatan Mata', 'Value Pemeriksaan Visus OD / OS', 'Kesehatan Mata', '', 'text', '', '', '[]'::jsonb::text, 0, 80),
('Kesehatan Mata', 'Total Score Kesehatan mata', 'Kesehatan Mata', '', 'number', '0', '', '[]'::jsonb::text, 0, 90),
('Penyakit Dalam', 'Berat Badan (Kg)', 'Penyakit Dalam', '', 'radio', '', '', '["Sesuai juknis", "Tidak sesuai juknis"]'::jsonb::text, 0, 10),
('Penyakit Dalam', 'BB (Kg)', 'Penyakit Dalam', 'Kg', 'number', '', '', '[]'::jsonb::text, 0, 20),
('Penyakit Dalam', 'Value Berat Badan (Kg)', 'Penyakit Dalam', '', 'text', '', '', '[]'::jsonb::text, 0, 30),
('Penyakit Dalam', 'TB. (Cm)', 'Penyakit Dalam', '', 'radio', '', '', '["Sesuai juknis", "Tidak sesuai juknis"]'::jsonb::text, 0, 40),
('Penyakit Dalam', 'Tb (Cm)', 'Penyakit Dalam', 'Cm', 'number', '', '', '[]'::jsonb::text, 0, 50),
('Penyakit Dalam', 'Value TB. (Cm)', 'Penyakit Dalam', '', 'text', '', '', '[]'::jsonb::text, 0, 60),
('Penyakit Dalam', 'Tanda Vital', 'Penyakit Dalam', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 70),
('Penyakit Dalam', 'Suhu/Nadi/Napas/tekanan darah', 'Penyakit Dalam', '', 'text', '', '', '[]'::jsonb::text, 0, 80),
('Penyakit Dalam', 'Value Tanda Vital', 'Penyakit Dalam', '', 'text', '', '', '[]'::jsonb::text, 0, 90),
('Penyakit Dalam', 'Tato kulit', 'Penyakit Dalam', '', 'radio', '', '', '["Tidak ada tato", "Ada tato"]'::jsonb::text, 0, 100),
('Penyakit Dalam', 'Value Tato kulit', 'Penyakit Dalam', '', 'text', '', '', '[]'::jsonb::text, 0, 110),
('Penyakit Dalam', 'Tindik (selain anting) Wanita : hanya 1 / telinga', 'Penyakit Dalam', '', 'radio', '', '', '["Tidak ada", "Ada (pria) (Wanita >1)"]'::jsonb::text, 0, 120),
('Penyakit Dalam', 'Value (selain anting) Wanita : hanya 1 / telinga', 'Penyakit Dalam', '', 'text', '', '', '[]'::jsonb::text, 0, 130),
('Penyakit Dalam', 'Pemeriksaan Fisik Jantung', 'Penyakit Dalam', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 140),
('Penyakit Dalam', 'Value Pemeriksaan Fisik Jantung', 'Penyakit Dalam', '', 'text', '', '', '[]'::jsonb::text, 0, 150),
('Penyakit Dalam', 'Pemeriksaan Fisik Paru', 'Penyakit Dalam', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 160),
('Penyakit Dalam', 'Value Pemeriksaan Fisik Paru', 'Penyakit Dalam', '', 'text', '', '', '[]'::jsonb::text, 0, 170),
('Penyakit Dalam', 'Abdomen - Hernia', 'Pemeriksaan Abdomen', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 180),
('Penyakit Dalam', 'Abdomen - NT Epigastrium', 'Pemeriksaan Abdomen', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 190),
('Penyakit Dalam', 'Abdomen - Benjolan', 'Pemeriksaan Abdomen', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 200),
('Penyakit Dalam', 'Abdomen - Liver', 'Pemeriksaan Abdomen', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 210),
('Penyakit Dalam', 'Abdomen - Bising Usus', 'Pemeriksaan Abdomen', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 220),
('Penyakit Dalam', 'Abdomen - Bekas Operasi (> 8 Bulan)', 'Pemeriksaan Abdomen', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 230),
('Penyakit Dalam', 'Score Abdomen', 'Penyakit Dalam', '', 'number', '0', '', '[]'::jsonb::text, 0, 240),
('Penyakit Dalam', 'Anus & Rektum - Hemoroid eksterna', 'Pemeriksaan Anus & Rektum (Colok Dubur)', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 250),
('Penyakit Dalam', 'Anus & Rektum - Hemoroid interna', 'Pemeriksaan Anus & Rektum (Colok Dubur)', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 260),
('Penyakit Dalam', 'Anus & Rektum - Fissura ani', 'Pemeriksaan Anus & Rektum (Colok Dubur)', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 270),
('Penyakit Dalam', 'Anus & Rektum - Striktur/Prolaps recti', 'Pemeriksaan Anus & Rektum (Colok Dubur)', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 280),
('Penyakit Dalam', 'Score Pemeriksaan Anus & Rektum (Colok Dubur)', 'Penyakit Dalam', '', 'number', '0', '', '[]'::jsonb::text, 0, 290),
('Penyakit Dalam', 'Urogenitalia - Hidronefrosis', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 300),
('Penyakit Dalam', 'Urogenitalia - Kelainan kongenital', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 310),
('Penyakit Dalam', 'Urogenitalia - Hipospadia', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 320),
('Penyakit Dalam', 'Urogenitalia - Hidrokel', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 330),
('Penyakit Dalam', 'Urogenitalia - Undescensus testis', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 340),
('Penyakit Dalam', 'Urogenitalia - Batu sal kemih', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 350),
('Penyakit Dalam', 'Urogenitalia - Cystitis akut/kronis', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 360),
('Penyakit Dalam', 'Urogenitalia - Post operasi varikokel', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 370),
('Penyakit Dalam', 'Urogenitalia - Phimosis', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 380),
('Penyakit Dalam', 'Score Urogenitalia', 'Penyakit Dalam', '', 'number', '0', '', '[]'::jsonb::text, 0, 390),
('Penyakit Dalam', 'Score total Pemeriksaan Penyakit Dalam', 'Penyakit Dalam', '', 'number', '0', '', '[]'::jsonb::text, 0, 400),
('Kesehatan Gigi & Mulut + Dental panoramik', 'Karang Gigi', 'Kesehatan Gigi & Mulut + Dental panoramik', '', 'radio', '', '', '["Positive", "Negative"]'::jsonb::text, 0, 10),
('Kesehatan Gigi & Mulut + Dental panoramik', 'Value Karang Gigi', 'Kesehatan Gigi & Mulut + Dental panoramik', '', 'text', '', '', '[]'::jsonb::text, 0, 20),
('Kesehatan Gigi & Mulut + Dental panoramik', 'Caries Dentis', 'Kesehatan Gigi & Mulut + Dental panoramik', '', 'radio', '', '', '["0 caries", "1 caries", "2 caries", "3 caries", ">3 caries"]'::jsonb::text, 0, 30),
('Kesehatan Gigi & Mulut + Dental panoramik', 'Value Caries Dentis', 'Kesehatan Gigi & Mulut + Dental panoramik', '', 'text', '', '', '[]'::jsonb::text, 0, 40),
('Kesehatan Gigi & Mulut + Dental panoramik', 'Tumpatan Gigi', 'Kesehatan Gigi & Mulut + Dental panoramik', '', 'radio', '', '', '["0 tumpatan", "<5 tumpatan", ">5 tumpatan"]'::jsonb::text, 0, 50),
('Kesehatan Gigi & Mulut + Dental panoramik', 'Value Tumpatan Gigi', 'Kesehatan Gigi & Mulut + Dental panoramik', '', 'text', '', '', '[]'::jsonb::text, 0, 60),
('Kesehatan Gigi & Mulut + Dental panoramik', 'Impaksi gigi', 'Kesehatan Gigi & Mulut + Dental panoramik', '', 'radio', '', '', '["0 gigi", "1 gigi", "2 gigi", ">2 gigi"]'::jsonb::text, 0, 70),
('Kesehatan Gigi & Mulut + Dental panoramik', 'Value Impaksi gigi', 'Kesehatan Gigi & Mulut + Dental panoramik', '', 'text', '', '', '[]'::jsonb::text, 0, 80),
('Kesehatan Gigi & Mulut + Dental panoramik', 'Kehilangan Gigi (Baik depan maupun belakang)', 'Kesehatan Gigi & Mulut + Dental panoramik', '', 'radio', '', '', '["0 gigi", "1 gigi", "2 gigi", ">2 gigi"]'::jsonb::text, 0, 90),
('Kesehatan Gigi & Mulut + Dental panoramik', 'Value Kehilangan Gigi (Baik depan maupun belakang)', 'Kesehatan Gigi & Mulut + Dental panoramik', '', 'text', '', '', '[]'::jsonb::text, 0, 100),
('Kesehatan Gigi & Mulut + Dental panoramik', 'Infeksi Gusi', 'Kesehatan Gigi & Mulut + Dental panoramik', '', 'radio', '', '', '["Positive", "Negative"]'::jsonb::text, 0, 110),
('Kesehatan Gigi & Mulut + Dental panoramik', 'Value Infeksi Gusi', 'Kesehatan Gigi & Mulut + Dental panoramik', '', 'text', '', '', '[]'::jsonb::text, 0, 120),
('Kesehatan Gigi & Mulut + Dental panoramik', 'Dental panoramik', 'Kesehatan Gigi & Mulut + Dental panoramik', '', 'radio', '', '', '["Normal", "ditemukan kelainan"]'::jsonb::text, 0, 130),
('Kesehatan Gigi & Mulut + Dental panoramik', 'Value Dental panoramic', 'Kesehatan Gigi & Mulut + Dental panoramik', '', 'text', '', '', '[]'::jsonb::text, 0, 140),
('Kesehatan Gigi & Mulut + Dental panoramik', 'bentuk kelainan Dental Panoramik', 'Kesehatan Gigi & Mulut + Dental panoramik', '', 'text', '', '', '[]'::jsonb::text, 0, 150),
('Kesehatan Gigi & Mulut + Dental panoramik', 'Score total Pemeriksaan Kesehatan Gigi dan Mulut', 'Kesehatan Gigi & Mulut + Dental panoramik', '', 'number', '0', '', '[]'::jsonb::text, 0, 160),
('Kesehatan THT', 'Membran timpani', 'Kesehatan THT', '', 'radio', '', '', '["Intak", "Tidak Intak"]'::jsonb::text, 0, 10),
('Kesehatan THT', 'Value Membran timpani', 'Kesehatan THT', '', 'text', '', '', '[]'::jsonb::text, 0, 20),
('Kesehatan THT', 'Serumen', 'Kesehatan THT', '', 'radio', '', '', '["Tidak ada", "Ada serumen"]'::jsonb::text, 0, 30),
('Kesehatan THT', 'Value Serumen', 'Kesehatan THT', '', 'text', '', '', '[]'::jsonb::text, 0, 40),
('Kesehatan THT', 'Tonsil', 'Kesehatan THT', '', 'radio', '', '', '["T0:T1 - T1 / Sudah tonsilektomi", "T1:T2 - T1", "T2:T2 - T2b", "T0:T2 - T2"]'::jsonb::text, 0, 50),
('Kesehatan THT', 'Value Tonsil', 'Kesehatan THT', '', 'text', '', '', '[]'::jsonb::text, 0, 60),
('Kesehatan THT', 'Rhinitis Alergi (Bividas)', 'Kesehatan THT', '', 'radio', '', '', '["Positive", "Negative"]'::jsonb::text, 0, 70),
('Kesehatan THT', 'Value Rhinitis Alergi (Bividas)', 'Kesehatan THT', '', 'text', '', '', '[]'::jsonb::text, 0, 80),
('Kesehatan THT', 'Epistaksis 1 tahun terakhir', 'Kesehatan THT', '', 'radio', '', '', '["Ada", "Tidak Ada"]'::jsonb::text, 0, 90),
('Kesehatan THT', 'Value Epistaksis 1 tahun terakhir', 'Kesehatan THT', '', 'text', '', '', '[]'::jsonb::text, 0, 100),
('Kesehatan THT', 'Tes Garputala (Weber) 512 Hz', 'Kesehatan THT', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 110),
('Kesehatan THT', 'Value Garputala (Weber) 512 Hz', 'Kesehatan THT', '', 'text', '', '', '[]'::jsonb::text, 0, 120),
('Kesehatan THT', 'Score total Pemeriksaan Kesehatan THT', 'Kesehatan THT', '', 'number', '0', '', '[]'::jsonb::text, 0, 130),
('Kesehatan Jantung dan Pembuluh Darah', 'Kelainan Anatomi Jantung', 'Kesehatan Jantung dan Pembuluh Darah', '', 'radio', '', '', '["Tidak Ada", "Ada"]'::jsonb::text, 0, 10),
('Kesehatan Jantung dan Pembuluh Darah', 'Value Kelainan Anatomi Jantung', 'Kesehatan Jantung dan Pembuluh Darah', '', 'text', '', '', '[]'::jsonb::text, 0, 20),
('Kesehatan Jantung dan Pembuluh Darah', 'Kelainan Irama Jantung', 'Kesehatan Jantung dan Pembuluh Darah', '', 'radio', '', '', '["Tidak Ada", "Ada"]'::jsonb::text, 0, 30),
('Kesehatan Jantung dan Pembuluh Darah', 'Value Kelainan Irama Jantung', 'Kesehatan Jantung dan Pembuluh Darah', '', 'text', '', '', '[]'::jsonb::text, 0, 40),
('Kesehatan Jantung dan Pembuluh Darah', 'Iskemik Miocardial', 'Kesehatan Jantung dan Pembuluh Darah', '', 'radio', '', '', '["Tidak Ada", "Ada"]'::jsonb::text, 0, 50),
('Kesehatan Jantung dan Pembuluh Darah', 'Value Iskemik Miocardial', 'Kesehatan Jantung dan Pembuluh Darah', '', 'text', '', '', '[]'::jsonb::text, 0, 60),
('Kesehatan Jantung dan Pembuluh Darah', 'Kelainan kongenital jantung', 'Kesehatan Jantung dan Pembuluh Darah', '', 'radio', '', '', '["Tidak Ada", "Ada"]'::jsonb::text, 0, 70),
('Kesehatan Jantung dan Pembuluh Darah', 'Value Kelainan kongenital jantung', 'Kesehatan Jantung dan Pembuluh Darah', '', 'text', '', '', '[]'::jsonb::text, 0, 80),
('Kesehatan Jantung dan Pembuluh Darah', 'Varises Tungkai (insufisiensi vena)', 'Kesehatan Jantung dan Pembuluh Darah', '', 'radio', '', '', '["Tidak Ada", "Ada"]'::jsonb::text, 0, 90),
('Kesehatan Jantung dan Pembuluh Darah', 'Value Varises Tungkai (insufisiensi vena)', 'Kesehatan Jantung dan Pembuluh Darah', '', 'text', '', '', '[]'::jsonb::text, 0, 100),
('Kesehatan Jantung dan Pembuluh Darah', 'Kelainan Arteri pada ekstremitas', 'Kesehatan Jantung dan Pembuluh Darah', '', 'radio', '', '', '["Tidak Ada", "Ada"]'::jsonb::text, 0, 110),
('Kesehatan Jantung dan Pembuluh Darah', 'Value Kelainan Arteri pada ekstremitas', 'Kesehatan Jantung dan Pembuluh Darah', '', 'text', '', '', '[]'::jsonb::text, 0, 120),
('Kesehatan Jantung dan Pembuluh Darah', 'Score total Pemeriksaan Kesehatan Jantung dan Pembuluh Darah', 'Kesehatan Jantung dan Pembuluh Darah', '', 'number', '0', '', '[]'::jsonb::text, 0, 130),
('Ortopedi', 'Pemeriksaan Ortopedi', 'Ortopedi', '', 'radio', '', '', '["Normal", "Tidak Normal"]'::jsonb::text, 0, 10),
('Ortopedi', 'Catatan Ortopedi', 'Ortopedi', '', 'textarea', '', '', '[]'::jsonb::text, 0, 20),
('Ortopedi', 'Score total Pemeriksaan Ortopedi', 'Ortopedi', '', 'number', '0', '', '[]'::jsonb::text, 0, 30),
('Radiologi', 'Foto Thorax', 'Radiologi', '', 'radio', '', '', '["Normal", "Abnormal", "Belum Ada"]'::jsonb::text, 0, 10),
('Radiologi', 'Catatan Radiologi', 'Radiologi', '', 'textarea', '', '', '[]'::jsonb::text, 0, 20),
('Radiologi', 'Score total Pemeriksaan Radiologi', 'Radiologi', '', 'number', '0', '', '[]'::jsonb::text, 0, 30)
),
upserted AS (
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
    ref.parameter_name,
    ref.category,
    posts.id,
    ref.unit,
    ref.input_type,
    ref.normal_value,
    ref.reference_text,
    '',
    ref.config_json,
    ref.is_required,
    1,
    ref.sort_order,
    'capaska'
  FROM ref
  JOIN posts
    ON LOWER(posts.name) = LOWER(ref.post_name)
   AND posts.program_type = 'capaska'
  ON CONFLICT DO NOTHING
  RETURNING id
)
UPDATE parameters
SET
  category = ref.category,
  unit = ref.unit,
  input_type = ref.input_type,
  normal_value = ref.normal_value,
  reference_text = ref.reference_text,
  config_json = ref.config_json,
  is_required = ref.is_required,
  is_active = 1,
  sort_order = ref.sort_order,
  program_type = 'capaska'
FROM ref
JOIN posts
  ON LOWER(posts.name) = LOWER(ref.post_name)
 AND posts.program_type = 'capaska'
WHERE parameters.post_id = posts.id
  AND LOWER(parameters.name) = LOWER(ref.parameter_name);

-- Reset mapping untuk semua package CAPASKA aktif.
DELETE FROM package_parameters
WHERE package_id IN (
  SELECT id FROM packages WHERE program_type = 'capaska'
);

INSERT INTO package_parameters (package_id, parameter_id, sort_order)
SELECT
  packages.id AS package_id,
  parameters.id AS parameter_id,
  parameters.sort_order
FROM packages
JOIN parameters
  ON parameters.program_type = 'capaska'
 AND parameters.is_active = 1
WHERE packages.program_type = 'capaska'
  AND packages.is_active = 1
ON CONFLICT (package_id, parameter_id) DO NOTHING;

COMMIT;

-- Cek hasil
SELECT
  posts.name AS post,
  COUNT(parameters.id) AS total_parameter_aktif
FROM posts
LEFT JOIN parameters
  ON parameters.post_id = posts.id
 AND parameters.program_type = 'capaska'
 AND parameters.is_active = 1
WHERE posts.program_type = 'capaska'
GROUP BY posts.name
ORDER BY MIN(parameters.sort_order);
