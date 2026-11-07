-- Additive schema for the dedicated refill pipeline.
-- Does not alter or delete existing puzzle, daily-stock, or player data.
CREATE TABLE IF NOT EXISTS refill_profiles (
  profile_key TEXT PRIMARY KEY NOT NULL,
  descriptor TEXT NOT NULL,
  target_count INTEGER NOT NULL DEFAULT 100 CHECK(target_count BETWEEN 1 AND 10000),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  updated INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS refill_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  profile_key TEXT NOT NULL REFERENCES refill_profiles(profile_key),
  requested INTEGER NOT NULL CHECK(requested > 0),
  accepted INTEGER NOT NULL DEFAULT 0 CHECK(accepted >= 0),
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','completed','cancelled')),
  lease_owner TEXT,
  lease_token TEXT,
  lease_until INTEGER,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS refill_jobs_claim ON refill_jobs(state, lease_until, created);
CREATE INDEX IF NOT EXISTS refill_jobs_profile ON refill_jobs(profile_key, state);

CREATE TABLE IF NOT EXISTS refill_batches (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL REFERENCES refill_jobs(id),
  device_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('received','validated','partially_accepted','rejected')),
  submitted INTEGER NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS refill_batches_job ON refill_batches(job_id, submitted);

CREATE TABLE IF NOT EXISTS refill_items (
  fingerprint TEXT PRIMARY KEY NOT NULL,
  profile_key TEXT NOT NULL REFERENCES refill_profiles(profile_key),
  batch_id TEXT NOT NULL REFERENCES refill_batches(id),
  payload TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS refill_items_profile ON refill_items(profile_key, created);
