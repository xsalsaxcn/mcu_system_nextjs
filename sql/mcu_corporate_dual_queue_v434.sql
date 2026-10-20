-- MCU Corporate Dual Queue V434
-- Scope: MCU Corporate only. Does not modify vaccination tables or print-label tables.

CREATE TABLE IF NOT EXISTS mcu_queue_sessions (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL,
  package_id INTEGER NOT NULL,
  track_a_name TEXT NOT NULL DEFAULT 'Lab Darah',
  track_b_name TEXT NOT NULL DEFAULT 'Rontgen',
  public_token TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_mcu_queue_sessions_company_package
  ON mcu_queue_sessions(company_id, package_id);

CREATE TABLE IF NOT EXISTS mcu_queue_entries (
  id BIGSERIAL PRIMARY KEY,
  queue_session_id BIGINT NOT NULL REFERENCES mcu_queue_sessions(id) ON DELETE CASCADE,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,

  a_queue_number TEXT,
  a_queue_sequence BIGINT,
  a_status TEXT NOT NULL DEFAULT 'WAITING',
  a_called_at TIMESTAMPTZ,
  a_started_at TIMESTAMPTZ,
  a_finished_at TIMESTAMPTZ,
  a_cancelled_at TIMESTAMPTZ,

  b_queue_number TEXT,
  b_queue_sequence BIGINT,
  b_status TEXT NOT NULL DEFAULT 'WAITING',
  b_called_at TIMESTAMPTZ,
  b_started_at TIMESTAMPTZ,
  b_finished_at TIMESTAMPTZ,
  b_cancelled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(queue_session_id, participant_id),
  UNIQUE(queue_session_id, a_queue_sequence),
  UNIQUE(queue_session_id, b_queue_sequence)
);

CREATE INDEX IF NOT EXISTS idx_mcu_queue_entries_session_a_status
  ON mcu_queue_entries(queue_session_id, a_status, a_queue_sequence);

CREATE INDEX IF NOT EXISTS idx_mcu_queue_entries_session_b_status
  ON mcu_queue_entries(queue_session_id, b_status, b_queue_sequence);

-- Guard values to keep queue state predictable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mcu_queue_entries_a_status_check'
  ) THEN
    ALTER TABLE mcu_queue_entries
      ADD CONSTRAINT mcu_queue_entries_a_status_check
      CHECK (a_status IN ('WAITING','CALLED','IN_PROGRESS','DONE','SKIPPED','CANCELLED'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mcu_queue_entries_b_status_check'
  ) THEN
    ALTER TABLE mcu_queue_entries
      ADD CONSTRAINT mcu_queue_entries_b_status_check
      CHECK (b_status IN ('WAITING','CALLED','IN_PROGRESS','DONE','SKIPPED','CANCELLED'));
  END IF;
END $$;
