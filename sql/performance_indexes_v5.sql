CREATE INDEX IF NOT EXISTS idx_participants_source_program_name
ON participants(source_id, program_type, name);

CREATE INDEX IF NOT EXISTS idx_participants_source_program_mcu
ON participants(source_id, program_type, mcu_id);

CREATE INDEX IF NOT EXISTS idx_participants_source_program_external
ON participants(source_id, program_type, external_id);

CREATE INDEX IF NOT EXISTS idx_participants_source_program_province
ON participants(source_id, program_type, province);

CREATE INDEX IF NOT EXISTS idx_participants_source_id_id
ON participants(source_id, id);

CREATE INDEX IF NOT EXISTS idx_participant_sources_program_created
ON participant_sources(program_type, created_at);
