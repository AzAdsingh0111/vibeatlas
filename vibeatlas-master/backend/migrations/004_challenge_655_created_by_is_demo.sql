-- Migration 004: Challenge #655 explicit columns (created_by and is_demo)
ALTER TABLE vibes ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE vibes ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- Backfill created_by with user_id
UPDATE vibes SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE vibes SET user_id = created_by WHERE user_id IS NULL AND created_by IS NOT NULL;
