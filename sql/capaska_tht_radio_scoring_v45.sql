-- =========================================================
-- CAPASKA THT radio/single-choice scoring v45
-- Aman untuk dijalankan setelah patch v45.
-- Scope: hanya parameter program_type = 'capaska' dan hanya parameter THT.
-- Tidak menghapus peserta, hasil pemeriksaan, Corporate MCU, atau Vaksinasi.
-- Value/Score fields tetap dibiarkan ada untuk kebutuhan backend/export, tetapi akan disembunyikan di UI operator.
-- =========================================================

BEGIN;

WITH tht_config(parameter_name, config_json) AS (
  VALUES
  ('Membran timpani', '{"options":[{"label":"Intak","value":"Intak","score":2,"is_critical":false,"note":""},{"label":"Tidak intak","value":"Tidak intak","score":-10,"is_critical":true,"note":"Tidak Direkomendasikan"}],"max_score":2,"scoring_type":"by_option","include_in_total_score":true}'),
  ('Serumen', '{"options":[{"label":"Tidak ada","value":"Tidak ada","score":2,"is_critical":false,"note":""},{"label":"Ada serumen","value":"Ada serumen","score":1,"is_critical":false,"note":""}],"max_score":2,"scoring_type":"by_option","include_in_total_score":true}'),
  ('Tonsil', '{"options":[{"label":"T0 / T1-T1","value":"T0 / T1-T1","score":2,"is_critical":false,"note":""},{"label":"Sudah tonsilektomi","value":"Sudah tonsilektomi","score":2,"is_critical":false,"note":""},{"label":"T2a-T2a","value":"T2a-T2a","score":1,"is_critical":false,"note":""},{"label":"T2b-T2b","value":"T2b-T2b","score":-1,"is_critical":false,"note":""},{"label":"T3-T3","value":"T3-T3","score":-10,"is_critical":true,"note":"Tidak Direkomendasikan"}],"max_score":2,"scoring_type":"by_option","include_in_total_score":true}'),
  ('Rhinitis Alergi (divide)', '{"options":[{"label":"Negatif / (-)","value":"Negatif","score":2,"is_critical":false,"note":""},{"label":"Positif / (+)","value":"Positif","score":1,"is_critical":false,"note":""}],"max_score":2,"scoring_type":"by_option","include_in_total_score":true}'),
  ('Rhinitis Alergi (lividae)', '{"options":[{"label":"Negatif / (-)","value":"Negatif","score":2,"is_critical":false,"note":""},{"label":"Positif / (+)","value":"Positif","score":1,"is_critical":false,"note":""}],"max_score":2,"scoring_type":"by_option","include_in_total_score":true}'),
  ('Rhinitis Alergi (Bividas)', '{"options":[{"label":"Negatif / (-)","value":"Negatif","score":2,"is_critical":false,"note":""},{"label":"Positif / (+)","value":"Positif","score":1,"is_critical":false,"note":""}],"max_score":2,"scoring_type":"by_option","include_in_total_score":true}'),
  ('Epistaksis 1 tahun terakhir', '{"options":[{"label":"Tidak ada","value":"Tidak Ada","score":1,"is_critical":false,"note":""},{"label":"Ada","value":"Ada","score":-1,"is_critical":false,"note":""}],"max_score":1,"scoring_type":"by_option","include_in_total_score":true}'),
  ('Tes Garputala (Weber) 512 Hz', '{"options":[{"label":"Normal","value":"Normal","score":1,"is_critical":false,"note":""},{"label":"Tidak normal","value":"Tidak Normal","score":-10,"is_critical":true,"note":"Tidak Direkomendasikan"}],"max_score":1,"scoring_type":"by_option","include_in_total_score":true}')
)
UPDATE parameters p
SET input_type = 'radio',
    config_json = tht_config.config_json
FROM tht_config
WHERE p.program_type = 'capaska'
  AND lower(p.name) = lower(tht_config.parameter_name);

COMMIT;
