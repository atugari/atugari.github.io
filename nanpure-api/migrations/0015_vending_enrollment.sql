-- Installation-specific worker credentials can be enrolled using a bounded,
-- owner-created capability. Existing devices, jobs and stock are unchanged.
CREATE TABLE vending_enrollments (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  max_devices INTEGER NOT NULL CHECK (max_devices BETWEEN 1 AND 30),
  created INTEGER NOT NULL,
  expires INTEGER,
  revoked INTEGER
);

CREATE TABLE vending_enrollment_members (
  device_id TEXT PRIMARY KEY REFERENCES vending_devices(id),
  enrollment_id TEXT NOT NULL REFERENCES vending_enrollments(id),
  created INTEGER NOT NULL
);
CREATE INDEX vending_enrollment_members_grant
  ON vending_enrollment_members (enrollment_id, device_id);
