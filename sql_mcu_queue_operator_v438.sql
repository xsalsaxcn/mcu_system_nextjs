-- MCU Corporate Day-H Participant Control + Operator Link V438
-- Scope: MCU Corporate queue only.
-- Does not modify vaccination tables or MCU print/label tables.

ALTER TABLE mcu_queue_sessions
  ADD COLUMN IF NOT EXISTS operator_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mcu_queue_sessions_operator_token
  ON mcu_queue_sessions(operator_token)
  WHERE operator_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS mcu_queue_informed (
  id BIGSERIAL PRIMARY KEY,
  queue_session_id BIGINT NOT NULL
    REFERENCES mcu_queue_sessions(id)
    ON DELETE CASCADE,
  participant_id INTEGER NOT NULL
    REFERENCES participants(id)
    ON DELETE CASCADE,
  informed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  informed_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(queue_session_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_mcu_queue_informed_session
  ON mcu_queue_informed(queue_session_id);

CREATE INDEX IF NOT EXISTS idx_mcu_queue_informed_participant
  ON mcu_queue_informed(participant_id);
