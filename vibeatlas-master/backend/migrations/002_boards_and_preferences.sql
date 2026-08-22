CREATE TABLE IF NOT EXISTS boards (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS board_items (
  id BIGSERIAL PRIMARY KEY,
  board_id BIGINT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vibe_id BIGINT REFERENCES vibes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  mood TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system',
  default_mood TEXT NOT NULL DEFAULT 'Calm',
  route_mode TEXT NOT NULL DEFAULT 'walking',
  budget TEXT NOT NULL DEFAULT 'medium',
  voice_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  prefer_scenic BOOLEAN NOT NULL DEFAULT FALSE,
  minimize_stops BOOLEAN NOT NULL DEFAULT FALSE,
  return_to_start BOOLEAN NOT NULL DEFAULT FALSE,
  max_stops INT NOT NULL DEFAULT 5,
  custom_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_places (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  label TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  mood TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_route_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS boards_user_id_idx ON boards (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS board_items_board_id_idx ON board_items (board_id, created_at ASC);
CREATE INDEX IF NOT EXISTS board_items_user_id_idx ON board_items (user_id);
CREATE INDEX IF NOT EXISTS saved_places_user_id_slot_idx ON saved_places (user_id, slot);
CREATE INDEX IF NOT EXISTS user_route_profiles_user_id_idx ON user_route_profiles (user_id, created_at DESC);
