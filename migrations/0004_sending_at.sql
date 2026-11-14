-- Set while a cron run is sending a message for this day, so an overlapping run doesn't send it too.
ALTER TABLE days ADD COLUMN sending_at INTEGER;
