CREATE TABLE work_items (
  id UUID PRIMARY KEY,
  component_id TEXT,
  error_type TEXT,
  severity TEXT,
  status TEXT,
  signal_count INT,
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);