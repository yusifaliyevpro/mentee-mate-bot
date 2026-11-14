-- The role a member was last welcomed as, so a repeat /start doesn't greet them again.
ALTER TABLE members ADD COLUMN welcomed_role TEXT;

-- Everyone already linked has seen the welcome.
UPDATE members SET welcomed_role = role WHERE tg_id IS NOT NULL;
