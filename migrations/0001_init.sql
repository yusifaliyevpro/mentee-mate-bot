-- Allowlist and per-mentee settings. A row is claimed (tg_id set) when that username first presses Start.
CREATE TABLE members (
  username TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'mentee' CHECK (role IN ('mentee', 'mentor')),
  tg_id INTEGER UNIQUE,
  name TEXT,
  remind_at INTEGER NOT NULL DEFAULT 1260,
  weekdays INTEGER NOT NULL DEFAULT 127,
  message TEXT,
  paused INTEGER NOT NULL DEFAULT 0,
  awaiting TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- One row per mentee per logical day (04:00 to 04:00 local time).
CREATE TABLE days (
  tg_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  reminded_at INTEGER,
  snooze_until INTEGER,
  nudged_at INTEGER,
  done_at INTEGER,
  PRIMARY KEY (tg_id, day)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
