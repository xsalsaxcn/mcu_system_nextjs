-- =========================================================
-- Label Search Performance v21
-- Jalankan di Supabase SQL Editor.
--
-- Ini penting kalau search nama/MCU terasa berat.
-- Normal btree index tidak efektif untuk ILIKE '%keyword%'.
-- pg_trgm + GIN index membuat search nama jauh lebih cepat.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_participants_name_trgm_v21
ON participants USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_participants_mcu_id_trgm_v21
ON participants USING gin (mcu_id gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_participants_external_id_trgm_v21
ON participants USING gin (external_id gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_participants_barcode_value_trgm_v21
ON participants USING gin (barcode_value gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_participants_nik_trgm_v21
ON participants USING gin (nik gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_participants_program_source_name_v21
ON participants(program_type, source_id, name);

CREATE INDEX IF NOT EXISTS idx_participants_program_source_mcu_v21
ON participants(program_type, source_id, mcu_id);
