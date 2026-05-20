-- =========================================================
-- MCU CAPASKA ALL REFERENCE PARAMETERS v11
-- Berdasarkan reference Streamlit yang user kirim:
-- - single choice/radio untuk mayoritas parameter
-- - value/score otomatis untuk masing-masing field yang memiliki skor
-- - total score per post/section
--
-- Aman untuk peserta:
-- - data peserta tidak dihapus
-- - parameter lama CAPASKA dinonaktifkan
-- - mapping package CAPASKA diganti ke parameter reference aktif
-- =========================================================

BEGIN;

-- 1. Pastikan semua post CAPASKA ada.
WITH ref_posts(name, description, program_type, is_active) AS (
  VALUES
  ('Registrasi CAPASKA', 'Registrasi dan verifikasi identitas peserta CAPASKA', 'capaska', 1),
  ('Kesehatan Mata', 'Pemeriksaan mata CAPASKA sesuai reference', 'capaska', 1),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Pemeriksaan kesehatan gigi, mulut, dan dental panoramic sesuai reference', 'capaska', 1),
  ('Kesehatan THT', 'Pemeriksaan THT sesuai reference', 'capaska', 1),
  ('Penyakit Dalam', 'Pemeriksaan penyakit dalam sesuai reference', 'capaska', 1),
  ('Kesehatan Jantung dan Pembuluh Darah', 'Pemeriksaan kesehatan jantung dan pembuluh darah sesuai reference', 'capaska', 1),
  ('Ortopedi', 'Pemeriksaan ortopedi sesuai reference', 'capaska', 1),
  ('Radiologi', 'Pemeriksaan radiologi sesuai reference', 'capaska', 1)
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

WITH ref_posts(name, description, program_type, is_active) AS (
  VALUES
  ('Registrasi CAPASKA', 'Registrasi dan verifikasi identitas peserta CAPASKA', 'capaska', 1),
  ('Kesehatan Mata', 'Pemeriksaan mata CAPASKA sesuai reference', 'capaska', 1),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Pemeriksaan kesehatan gigi, mulut, dan dental panoramic sesuai reference', 'capaska', 1),
  ('Kesehatan THT', 'Pemeriksaan THT sesuai reference', 'capaska', 1),
  ('Penyakit Dalam', 'Pemeriksaan penyakit dalam sesuai reference', 'capaska', 1),
  ('Kesehatan Jantung dan Pembuluh Darah', 'Pemeriksaan kesehatan jantung dan pembuluh darah sesuai reference', 'capaska', 1),
  ('Ortopedi', 'Pemeriksaan ortopedi sesuai reference', 'capaska', 1),
  ('Radiologi', 'Pemeriksaan radiologi sesuai reference', 'capaska', 1)
)
UPDATE posts
SET
  description = ref_posts.description,
  program_type = ref_posts.program_type,
  is_active = ref_posts.is_active
FROM ref_posts
WHERE LOWER(posts.name) = LOWER(ref_posts.name)
  AND posts.program_type = ref_posts.program_type;

-- 2. Pastikan operator CAPASKA terhubung ke post benar.
WITH ref_users(full_name, username, password, role, post_name, program_type, is_active) AS (
  VALUES
  ('Operator CAPASKA Registrasi', 'capaska_registrasi', 'registrasi123', 'operator', 'Registrasi CAPASKA', 'capaska', 1),
  ('Operator CAPASKA Mata', 'capaska_mata', 'mata123', 'operator', 'Kesehatan Mata', 'capaska', 1),
  ('Operator CAPASKA Gigi', 'capaska_gigi', 'gigi123', 'operator', 'Kesehatan Gigi & Mulut + Dental panoramik', 'capaska', 1),
  ('Operator CAPASKA THT', 'capaska_tht', 'tht123', 'operator', 'Kesehatan THT', 'capaska', 1),
  ('Operator CAPASKA Penyakit Dalam', 'capaska_pd', 'pd123', 'operator', 'Penyakit Dalam', 'capaska', 1),
  ('Operator CAPASKA Jantung', 'capaska_jantung', 'jantung123', 'operator', 'Kesehatan Jantung dan Pembuluh Darah', 'capaska', 1),
  ('Operator CAPASKA Ortopedi', 'capaska_ortopedi', 'ortopedi123', 'operator', 'Ortopedi', 'capaska', 1),
  ('Operator CAPASKA Radiologi', 'capaska_radiologi', 'radiologi123', 'operator', 'Radiologi', 'capaska', 1)
)
INSERT INTO users (name, username, password, role, post_id, program_type, is_active)
SELECT
  ref_users.full_name,
  ref_users.username,
  ref_users.password,
  ref_users.role,
  posts.id,
  ref_users.program_type,
  ref_users.is_active
FROM ref_users
JOIN posts
  ON LOWER(posts.name) = LOWER(ref_users.post_name)
 AND posts.program_type = ref_users.program_type
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.username = ref_users.username
);

WITH ref_users(full_name, username, password, role, post_name, program_type, is_active) AS (
  VALUES
  ('Operator CAPASKA Registrasi', 'capaska_registrasi', 'registrasi123', 'operator', 'Registrasi CAPASKA', 'capaska', 1),
  ('Operator CAPASKA Mata', 'capaska_mata', 'mata123', 'operator', 'Kesehatan Mata', 'capaska', 1),
  ('Operator CAPASKA Gigi', 'capaska_gigi', 'gigi123', 'operator', 'Kesehatan Gigi & Mulut + Dental panoramik', 'capaska', 1),
  ('Operator CAPASKA THT', 'capaska_tht', 'tht123', 'operator', 'Kesehatan THT', 'capaska', 1),
  ('Operator CAPASKA Penyakit Dalam', 'capaska_pd', 'pd123', 'operator', 'Penyakit Dalam', 'capaska', 1),
  ('Operator CAPASKA Jantung', 'capaska_jantung', 'jantung123', 'operator', 'Kesehatan Jantung dan Pembuluh Darah', 'capaska', 1),
  ('Operator CAPASKA Ortopedi', 'capaska_ortopedi', 'ortopedi123', 'operator', 'Ortopedi', 'capaska', 1),
  ('Operator CAPASKA Radiologi', 'capaska_radiologi', 'radiologi123', 'operator', 'Radiologi', 'capaska', 1)
)
UPDATE users
SET
  name = ref_users.full_name,
  role = ref_users.role,
  post_id = posts.id,
  program_type = ref_users.program_type,
  is_active = ref_users.is_active
FROM ref_users
JOIN posts
  ON LOWER(posts.name) = LOWER(ref_users.post_name)
 AND posts.program_type = ref_users.program_type
WHERE users.username = ref_users.username;

-- 3. Pastikan company dan package default CAPASKA ada.
INSERT INTO companies (name, address, pic_name)
SELECT 'BPIP / CAPASKA', '', ''
WHERE NOT EXISTS (
  SELECT 1 FROM companies WHERE LOWER(name) = LOWER('BPIP / CAPASKA')
);

INSERT INTO packages (name, description, company_id, is_active, program_type)
SELECT
  'CAPASKA 2025/2026',
  'Default package CAPASKA 2025/2026',
  companies.id,
  1,
  'capaska'
FROM companies
WHERE LOWER(companies.name) = LOWER('BPIP / CAPASKA')
  AND NOT EXISTS (
    SELECT 1 FROM packages
    WHERE LOWER(name) = LOWER('CAPASKA 2025/2026')
      AND program_type = 'capaska'
  );

UPDATE packages
SET is_active = 1,
    program_type = 'capaska'
WHERE program_type = 'capaska';

-- 4. Nonaktifkan parameter CAPASKA lama supaya form lama seperti Visus OD/Telinga/Hidung tidak muncul.
UPDATE parameters
SET is_active = 0
WHERE program_type = 'capaska';

-- 5. Reset mapping semua package CAPASKA.
DELETE FROM package_parameters
WHERE package_id IN (
  SELECT id FROM packages WHERE program_type = 'capaska'
);

-- 6. Insert/update parameter reference.
WITH ref(post_name, parameter_name, category, unit, input_type, normal_value, reference_text, config_json, is_required, sort_order) AS (
  VALUES
  ('Registrasi CAPASKA', 'Status Registrasi CAPASKA', 'Registrasi CAPASKA', '', 'radio', '', '', '["Done", "Belum", "Perlu Verifikasi"]', 0, 10),
  ('Registrasi CAPASKA', 'Identitas Terverifikasi', 'Registrasi CAPASKA', '', 'radio', '', '', '["Ya", "Tidak"]', 0, 20),
  ('Registrasi CAPASKA', 'Barcode / Label Terpasang', 'Registrasi CAPASKA', '', 'radio', '', '', '["Ya", "Tidak"]', 0, 30),
  ('Registrasi CAPASKA', 'Catatan Registrasi', 'Registrasi CAPASKA', '', 'textarea', '', '', '[]', 0, 40),
  ('Kesehatan Mata', 'Lensakontak/ kaca mata', 'Pemeriksaan Mata', '', 'radio', '', '', '["Menggunakan", "Tidak menggunakan"]', 0, 10),
  ('Kesehatan Mata', 'Value Lensakontak/ kaca mata', 'Pemeriksaan Mata', '', 'number', '', '', '[]', 0, 20),
  ('Kesehatan Mata', 'Tes buta warna', 'Pemeriksaan Mata', '', 'radio', '', '', '["Tidak buta warna", "Buta warna parsial", "Buta warna total"]', 0, 30),
  ('Kesehatan Mata', 'Value buta warna', 'Pemeriksaan Mata', '', 'number', '', '', '[]', 0, 40),
  ('Kesehatan Mata', 'Strabismus / Juling', 'Pemeriksaan Mata', '', 'radio', '', '', '["(+) / (-)", "(-) / (+)", "(+) / (+)", "(-) / (-)"]', 0, 50),
  ('Kesehatan Mata', 'Value Strabismus / Juling', 'Pemeriksaan Mata', '', 'number', '', '', '[]', 0, 60),
  ('Kesehatan Mata', 'Pemeriksaan Visus OD  / OS', 'Pemeriksaan Mata', '', 'radio', '', '', '["Normal 6/6", "<6/6 - 6/12", "<6/12"]', 0, 70),
  ('Kesehatan Mata', 'Value Pemeriksaan Visus OD  / OS', 'Pemeriksaan Mata', '', 'number', '', '', '[]', 0, 80),
  ('Kesehatan Mata', 'Total Score Kesehatan mata', 'Pemeriksaan Mata', '', 'number', '0', '', '[]', 0, 90),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Karang Gigi', 'Pemeriksaan Kesehatan Gigi dan Mulut', '', 'radio', '', '', '["Positive", "Negative"]', 0, 10),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Value Karang Gigi', 'Pemeriksaan Kesehatan Gigi dan Mulut', '', 'number', '', '', '[]', 0, 20),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Caries Dentis', 'Pemeriksaan Kesehatan Gigi dan Mulut', '', 'radio', '', '', '["0 caries", "1 caries", "2 caries", "3 caries", ">3 caries"]', 0, 30),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Value Caries Dentis', 'Pemeriksaan Kesehatan Gigi dan Mulut', '', 'number', '', '', '[]', 0, 40),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Tumpatan Gigi', 'Pemeriksaan Kesehatan Gigi dan Mulut', '', 'radio', '', '', '["0 tumpatan", "<3 tumpatan", ">3 tumpatan"]', 0, 50),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Value Tumpatan Gigi', 'Pemeriksaan Kesehatan Gigi dan Mulut', '', 'number', '', '', '[]', 0, 60),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Impaksi gigi', 'Pemeriksaan Kesehatan Gigi dan Mulut', '', 'radio', '', '', '["0 gigi", "1 gigi", "2 gigi", ">2 gigi"]', 0, 70),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Value Impaksi gigi', 'Pemeriksaan Kesehatan Gigi dan Mulut', '', 'number', '', '', '[]', 0, 80),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Kehilangan Gigi (Baik depan maupun belakang)', 'Pemeriksaan Kesehatan Gigi dan Mulut', '', 'radio', '', '', '["0 gigi", "1 gigi", "2 gigi", ">2 gigi"]', 0, 90),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Value Kehilangan Gigi (Baik depan maupun belakang)', 'Pemeriksaan Kesehatan Gigi dan Mulut', '', 'number', '', '', '[]', 0, 100),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Infeksi Gusi', 'Pemeriksaan Kesehatan Gigi dan Mulut', '', 'radio', '', '', '["Positive", "Negative"]', 0, 110),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Value Infeksi Gusi', 'Pemeriksaan Kesehatan Gigi dan Mulut', '', 'number', '', '', '[]', 0, 120),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Dental panoramic', 'Pemeriksaan Kesehatan Gigi dan Mulut', '', 'radio', '', '', '["Normal", "ditemukan kelainan"]', 0, 130),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Value Dental panoramic', 'Pemeriksaan Kesehatan Gigi dan Mulut', '', 'number', '', '', '[]', 0, 140),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'bentuk kelainan Dental Panoramik', 'Pemeriksaan Kesehatan Gigi dan Mulut', '', 'text', '', '', '[]', 0, 150),
  ('Kesehatan Gigi & Mulut + Dental panoramik', 'Score total Pemeriksaan Kesehatan Gigi dan Mulut', 'Pemeriksaan Kesehatan Gigi dan Mulut', '', 'number', '0', '', '[]', 0, 160),
  ('Kesehatan THT', 'Membran timpani', 'Pemeriksaan Kesehatan THT', '', 'radio', '', '', '["Intak", "Tidak Intak"]', 0, 10),
  ('Kesehatan THT', 'Value Membran timpani', 'Pemeriksaan Kesehatan THT', '', 'number', '', '', '[]', 0, 20),
  ('Kesehatan THT', 'Serumen', 'Pemeriksaan Kesehatan THT', '', 'radio', '', '', '["Tidak ada", "Ada serumen"]', 0, 30),
  ('Kesehatan THT', 'Value Serumen', 'Pemeriksaan Kesehatan THT', '', 'number', '', '', '[]', 0, 40),
  ('Kesehatan THT', 'Tonsil', 'Pemeriksaan Kesehatan THT', '', 'radio', '', '', '["T0 - T1", "T0 - T2a", "T0 - T2b", "T2 - T3"]', 0, 50),
  ('Kesehatan THT', 'Value Tonsil', 'Pemeriksaan Kesehatan THT', '', 'number', '', '', '[]', 0, 60),
  ('Kesehatan THT', 'Rhinitis Alergi (divide)', 'Pemeriksaan Kesehatan THT', '', 'radio', '', '', '["Positive", "Negative"]', 0, 70),
  ('Kesehatan THT', 'Value Rhinitis Alergi (divide)', 'Pemeriksaan Kesehatan THT', '', 'number', '', '', '[]', 0, 80),
  ('Kesehatan THT', 'Epistaksis 1 tahun terakhir', 'Pemeriksaan Kesehatan THT', '', 'radio', '', '', '["Ada", "Tidak Ada"]', 0, 90),
  ('Kesehatan THT', 'Value Epistaksis 1 tahun terakhir', 'Pemeriksaan Kesehatan THT', '', 'number', '', '', '[]', 0, 100),
  ('Kesehatan THT', 'Tes Garputala (Weber) 512 Hz', 'Pemeriksaan Kesehatan THT', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 110),
  ('Kesehatan THT', 'Value Garputala (Weber) 512 Hz', 'Pemeriksaan Kesehatan THT', '', 'number', '', '', '[]', 0, 120),
  ('Kesehatan THT', 'Score total Pemeriksaan Kesehatan THT', 'Pemeriksaan Kesehatan THT', '', 'number', '0', '', '[]', 0, 130),
  ('Penyakit Dalam', 'Berat Badan (Kg)', 'Pemeriksaan Penyakit Dalam', '', 'radio', '', '', '["Sesuai juknis", "Tidak sesuai juknis"]', 0, 10),
  ('Penyakit Dalam', 'BB (Kg)', 'Pemeriksaan Penyakit Dalam', 'Kg', 'text', '', '', '[]', 0, 20),
  ('Penyakit Dalam', 'Value Berat Badan (Kg)', 'Pemeriksaan Penyakit Dalam', '', 'number', '', '', '[]', 0, 30),
  ('Penyakit Dalam', 'TB. (Cm)', 'Pemeriksaan Penyakit Dalam', '', 'radio', '', '', '["Sesuai juknis", "Tidak sesuai juknis"]', 0, 40),
  ('Penyakit Dalam', 'Tb (Cm)', 'Pemeriksaan Penyakit Dalam', 'Cm', 'text', '', '', '[]', 0, 50),
  ('Penyakit Dalam', 'Value TB. (Cm)', 'Pemeriksaan Penyakit Dalam', '', 'number', '', '', '[]', 0, 60),
  ('Penyakit Dalam', 'Tanda Vital', 'Pemeriksaan Penyakit Dalam', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 70),
  ('Penyakit Dalam', 'Suhu/Nadi/Napas/tekanan darah', 'Pemeriksaan Penyakit Dalam', '', 'text', '', '', '[]', 0, 80),
  ('Penyakit Dalam', 'Value Tanda Vital', 'Pemeriksaan Penyakit Dalam', '', 'number', '', '', '[]', 0, 90),
  ('Penyakit Dalam', 'Tato kulit', 'Pemeriksaan Penyakit Dalam', '', 'radio', '', '', '["Tidak ada tato", "Ada tato"]', 0, 100),
  ('Penyakit Dalam', 'Value Tato kulit', 'Pemeriksaan Penyakit Dalam', '', 'number', '', '', '[]', 0, 110),
  ('Penyakit Dalam', 'Tindik (selain anting) Wanita : hanya 1 / telinga', 'Pemeriksaan Penyakit Dalam', '', 'radio', '', '', '["Tidak ada", "Ada (pria) Wanita >1)"]', 0, 120),
  ('Penyakit Dalam', 'Value (selain anting) Wanita : hanya 1 / telinga', 'Pemeriksaan Penyakit Dalam', '', 'number', '', '', '[]', 0, 130),
  ('Penyakit Dalam', 'Pemeriksaan Fisik Jantung', 'Pemeriksaan Penyakit Dalam', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 140),
  ('Penyakit Dalam', 'Value Pemeriksaan Fisik Jantung', 'Pemeriksaan Penyakit Dalam', '', 'number', '', '', '[]', 0, 150),
  ('Penyakit Dalam', 'Pemeriksaan Fisik Paru', 'Pemeriksaan Penyakit Dalam', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 160),
  ('Penyakit Dalam', 'Value Pemeriksaan Fisik Paru', 'Pemeriksaan Penyakit Dalam', '', 'number', '', '', '[]', 0, 170),
  ('Penyakit Dalam', 'Hernia', 'Pemeriksaan Abdomen', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 180),
  ('Penyakit Dalam', 'NT Epigastrum', 'Pemeriksaan Abdomen', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 190),
  ('Penyakit Dalam', 'Benjolan', 'Pemeriksaan Abdomen', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 200),
  ('Penyakit Dalam', 'Liver', 'Pemeriksaan Abdomen', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 210),
  ('Penyakit Dalam', 'Bising Usus', 'Pemeriksaan Abdomen', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 220),
  ('Penyakit Dalam', 'Bekas Operasi (>6Bulan)', 'Pemeriksaan Abdomen', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 230),
  ('Penyakit Dalam', 'Score Abdomen', 'Pemeriksaan Abdomen', '', 'number', '0', '', '[]', 0, 240),
  ('Penyakit Dalam', 'Hemoroid eksterna', 'Pemeriksaan Anus & Rektum (Colok Dubur)', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 250),
  ('Penyakit Dalam', 'Hemoroid interna', 'Pemeriksaan Anus & Rektum (Colok Dubur)', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 260),
  ('Penyakit Dalam', 'Fisura ani', 'Pemeriksaan Anus & Rektum (Colok Dubur)', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 270),
  ('Penyakit Dalam', 'Struktur/Prolaps recti', 'Pemeriksaan Anus & Rektum (Colok Dubur)', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 280),
  ('Penyakit Dalam', 'Score Pemeriksaan Anus & Rektum (Colok Dubur)', 'Pemeriksaan Anus & Rektum (Colok Dubur)', '', 'number', '0', '', '[]', 0, 290),
  ('Penyakit Dalam', 'Hidronefrosis', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 300),
  ('Penyakit Dalam', 'Kelainan kongenital', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 310),
  ('Penyakit Dalam', 'Hipospadia', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 320),
  ('Penyakit Dalam', 'Hidrokel', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 330),
  ('Penyakit Dalam', 'Undescensus testis', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 340),
  ('Penyakit Dalam', 'Batu sal kemih', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 350),
  ('Penyakit Dalam', 'Cystitis akut / kronis', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 360),
  ('Penyakit Dalam', 'Post operasi varikokel', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 370),
  ('Penyakit Dalam', 'Phimosis', 'Pemeriksaan Urogenitalia', '', 'radio', '', '', '["Normal", "Tidak Normal"]', 0, 380),
  ('Penyakit Dalam', 'Score Urogenitalia', 'Pemeriksaan Urogenitalia', '', 'number', '0', '', '[]', 0, 390),
  ('Penyakit Dalam', 'Score total Pemeriksaan Penyakit Dalam', 'Pemeriksaan Penyakit Dalam', '', 'number', '0', '', '[]', 0, 400),
  ('Kesehatan Jantung dan Pembuluh Darah', 'Kelainan Anatomi Jantung', 'Pemeriksaan Kesehatan Jantung dan Pembuluh Darah', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 10),
  ('Kesehatan Jantung dan Pembuluh Darah', 'Value Kelainan Anatomi Jantung', 'Pemeriksaan Kesehatan Jantung dan Pembuluh Darah', '', 'number', '', '', '[]', 0, 20),
  ('Kesehatan Jantung dan Pembuluh Darah', 'Kelainan Irama Jantung', 'Pemeriksaan Kesehatan Jantung dan Pembuluh Darah', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 30),
  ('Kesehatan Jantung dan Pembuluh Darah', 'Value Kelainan Irama Jantung', 'Pemeriksaan Kesehatan Jantung dan Pembuluh Darah', '', 'number', '', '', '[]', 0, 40),
  ('Kesehatan Jantung dan Pembuluh Darah', 'Iskemik Miocardial', 'Pemeriksaan Kesehatan Jantung dan Pembuluh Darah', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 50),
  ('Kesehatan Jantung dan Pembuluh Darah', 'Value Iskemik Miocardial', 'Pemeriksaan Kesehatan Jantung dan Pembuluh Darah', '', 'number', '', '', '[]', 0, 60),
  ('Kesehatan Jantung dan Pembuluh Darah', 'Kelainan kongenital jantung', 'Pemeriksaan Kesehatan Jantung dan Pembuluh Darah', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 70),
  ('Kesehatan Jantung dan Pembuluh Darah', 'Value Kelainan kongenital jantung', 'Pemeriksaan Kesehatan Jantung dan Pembuluh Darah', '', 'number', '', '', '[]', 0, 80),
  ('Kesehatan Jantung dan Pembuluh Darah', 'Varises Tungkai (insufisiensi vena)', 'Pemeriksaan Kesehatan Jantung dan Pembuluh Darah', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 90),
  ('Kesehatan Jantung dan Pembuluh Darah', 'Value Varises Tungkai (insufisiensi vena)', 'Pemeriksaan Kesehatan Jantung dan Pembuluh Darah', '', 'number', '', '', '[]', 0, 100),
  ('Kesehatan Jantung dan Pembuluh Darah', 'Kelainan Arteri pada ekstremitas', 'Pemeriksaan Kesehatan Jantung dan Pembuluh Darah', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 110),
  ('Kesehatan Jantung dan Pembuluh Darah', 'Value Kelainan Arteri pada ekstremitas', 'Pemeriksaan Kesehatan Jantung dan Pembuluh Darah', '', 'number', '', '', '[]', 0, 120),
  ('Kesehatan Jantung dan Pembuluh Darah', 'Score total Pemeriksaan Kesehatan Jantung dan Pembuluh Darah', 'Pemeriksaan Kesehatan Jantung dan Pembuluh Darah', '', 'number', '0', '', '[]', 0, 130),
  ('Ortopedi', 'sindaktili', 'Pemeriksaan Anggota Gerak Atas', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 10),
  ('Ortopedi', 'polidaktili', 'Pemeriksaan Anggota Gerak Atas', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 20),
  ('Ortopedi', 'spina bifida', 'Pemeriksaan Anggota Gerak Atas', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 30),
  ('Ortopedi', 'mallet finger', 'Pemeriksaan Anggota Gerak Atas', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 40),
  ('Ortopedi', 'Hiperekstensi lengan', 'Pemeriksaan Anggota Gerak Atas', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 50),
  ('Ortopedi', 'Score Anggota Gerak Atas', 'Pemeriksaan Anggota Gerak Atas', '', 'number', '0', '', '[]', 0, 60),
  ('Ortopedi', 'Hammer toe', 'Pemeriksaan Anggota Gerak Bawah', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 70),
  ('Ortopedi', 'Hallux valgus', 'Pemeriksaan Anggota Gerak Bawah', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 80),
  ('Ortopedi', 'Webbed toe', 'Pemeriksaan Anggota Gerak Bawah', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 90),
  ('Ortopedi', 'O/X bean', 'Pemeriksaan Anggota Gerak Bawah', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 100),
  ('Ortopedi', 'Pes planus / kaki datar', 'Pemeriksaan Anggota Gerak Bawah', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 110),
  ('Ortopedi', 'Polidactily', 'Pemeriksaan Anggota Gerak Bawah', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 120),
  ('Ortopedi', 'Hiperekstensi kaki', 'Pemeriksaan Anggota Gerak Bawah', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 130),
  ('Ortopedi', 'General Laxity', 'Pemeriksaan Anggota Gerak Bawah', '', 'radio', '', '', '["Tidak Ada", "Ada"]', 0, 140),
  ('Ortopedi', 'Score Anggota Gerak Bawah', 'Pemeriksaan Anggota Gerak Bawah', '', 'number', '0', '', '[]', 0, 150),
  ('Ortopedi', 'Skoliosis', 'Pemeriksaan Vertebra / Tulang Belakang', '', 'radio', '', '', '["Tidak Ada", "Ada", "Ringan"]', 0, 160),
  ('Ortopedi', 'Kifosis', 'Pemeriksaan Vertebra / Tulang Belakang', '', 'radio', '', '', '["Tidak Ada", "Ada", "Ringan"]', 0, 170),
  ('Ortopedi', 'Lordosis', 'Pemeriksaan Vertebra / Tulang Belakang', '', 'radio', '', '', '["Tidak Ada", "Ada", "Ringan"]', 0, 180),
  ('Ortopedi', 'Score Vertebra / Tulang Belakang', 'Pemeriksaan Vertebra / Tulang Belakang', '', 'number', '0', '', '[]', 0, 190),
  ('Ortopedi', 'Score total Pemeriksaan Ortopedi', 'Pemeriksaan Ortopedi', '', 'number', '0', '', '[]', 0, 200),
  ('Radiologi', 'Rontgen Whole Spine AP Lateral >> Skoliosis', 'Rontgen Whole Spine AP Lateral', '', 'radio', '', '', '["Tidak Ada", "Ringan", "Sedang", "Berat"]', 0, 10),
  ('Radiologi', 'Rontgen Whole Spine AP Lateral >> Kifosis', 'Rontgen Whole Spine AP Lateral', '', 'radio', '', '', '["Tidak Ada", "Ringan", "Sedang", "Berat"]', 0, 20),
  ('Radiologi', 'Rontgen Whole Spine AP Lateral >> Lordosis', 'Rontgen Whole Spine AP Lateral', '', 'radio', '', '', '["Tidak Ada", "Ringan", "Sedang", "Berat"]', 0, 30),
  ('Radiologi', 'Score Rontgen Whole Spine AP Lateral', 'Rontgen Whole Spine AP Lateral', '', 'number', '0', '', '[]', 0, 40),
  ('Radiologi', 'Score total Pemeriksaan Penunjang Radiologi', 'Pemeriksaan Radiologi', '', 'number', '0', '', '[]', 0, 50)
),
updated AS (
  UPDATE parameters p
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
  WHERE p.post_id = posts.id
    AND LOWER(p.name) = LOWER(ref.parameter_name)
  RETURNING p.id
)
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
WHERE NOT EXISTS (
  SELECT 1
  FROM parameters p
  WHERE p.post_id = posts.id
    AND LOWER(p.name) = LOWER(ref.parameter_name)
);

-- 7. Mapping ulang semua package CAPASKA aktif ke parameter reference aktif.
INSERT INTO package_parameters (package_id, parameter_id, sort_order)
SELECT
  packages.id,
  parameters.id,
  parameters.sort_order
FROM packages
JOIN parameters
  ON parameters.program_type = 'capaska'
 AND parameters.is_active = 1
WHERE packages.program_type = 'capaska'
  AND packages.is_active = 1
  AND NOT EXISTS (
    SELECT 1
    FROM package_parameters pp
    WHERE pp.package_id = packages.id
      AND pp.parameter_id = parameters.id
  );

COMMIT;

-- 8. Cek hasil.
SELECT
  posts.name AS post_pemeriksaan,
  COUNT(parameters.id) AS total_parameter_aktif
FROM posts
LEFT JOIN parameters
  ON parameters.post_id = posts.id
 AND parameters.program_type = 'capaska'
 AND parameters.is_active = 1
WHERE posts.program_type = 'capaska'
GROUP BY posts.name
ORDER BY MIN(parameters.sort_order);

-- Detail cepat untuk cek Mata dan THT:
SELECT
  posts.name AS post,
  parameters.sort_order,
  parameters.category,
  parameters.name,
  parameters.input_type,
  parameters.config_json
FROM parameters
JOIN posts ON posts.id = parameters.post_id
WHERE parameters.program_type = 'capaska'
  AND parameters.is_active = 1
  AND posts.name IN ('Kesehatan Mata', 'Kesehatan THT')
ORDER BY posts.name, parameters.sort_order;
