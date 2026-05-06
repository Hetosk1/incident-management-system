CREATE TABLE IF NOT EXISTS work_items (
  id UUID PRIMARY KEY,
  component_id TEXT NOT NULL,
  error_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  signal_count INT NOT NULL DEFAULT 1,
  first_seen TIMESTAMP NOT NULL,
  last_seen TIMESTAMP NOT NULL,
  incident_start TIMESTAMP,
  incident_end TIMESTAMP,
  rca_category TEXT,
  fix_applied TEXT,
  prevention_steps TEXT,
  mttr BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE work_items ADD COLUMN IF NOT EXISTS incident_start TIMESTAMP;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS incident_end TIMESTAMP;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS rca_category TEXT;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS fix_applied TEXT;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS prevention_steps TEXT;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS mttr BIGINT;
