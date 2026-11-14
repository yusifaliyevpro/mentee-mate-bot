-- A reminder skipped because its time had already passed (on joining or changing the time).
-- Kept apart from reminded_at so it doesn't count as a sent reminder for the 23:50 nudge.
ALTER TABLE days ADD COLUMN skipped_at INTEGER;
