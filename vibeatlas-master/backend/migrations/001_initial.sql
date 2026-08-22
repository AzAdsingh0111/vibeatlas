DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS postgis;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vibe_mood') THEN
    CREATE TYPE vibe_mood AS ENUM ('Calm', 'Musical', 'Excited', 'Reflective', 'Melancholy');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'Explorer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vibes (
  id BIGSERIAL PRIMARY KEY,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  mood vibe_mood NOT NULL,
  note TEXT,
  song TEXT,
  spotify_track_id TEXT,
  spotify_playlist_id TEXT,
  weather TEXT,
  time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name TEXT,
  mood_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  budget TEXT NOT NULL DEFAULT 'medium',
  ratings JSONB NOT NULL DEFAULT '{"overall":4,"safety":4,"vibe":4,"crowd":4}'::jsonb,
  reviews JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS route_feedback (
  id BIGSERIAL PRIMARY KEY,
  route_id TEXT NOT NULL,
  before_mood TEXT NOT NULL,
  after_mood TEXT NOT NULL,
  improvement_score DOUBLE PRECISION NOT NULL,
  feedback_rating DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vibes ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE route_feedback ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS vibes_user_id_time_idx ON vibes (user_id, time DESC);
CREATE INDEX IF NOT EXISTS route_feedback_user_id_created_at_idx ON route_feedback (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions (user_id, expires_at);
CREATE INDEX IF NOT EXISTS audit_events_user_id_created_at_idx ON audit_events (user_id, created_at DESC);
