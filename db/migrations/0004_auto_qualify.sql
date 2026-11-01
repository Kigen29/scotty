-- Scotty sorts what Discovery finds into qualified or dismissed, with a reason; this is its switch.
ALTER TABLE scotty.settings ADD COLUMN auto_qualify_enabled boolean NOT NULL DEFAULT true;
