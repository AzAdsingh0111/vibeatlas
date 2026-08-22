const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migration1 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_initial.sql'), 'utf8');
const migration2 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '002_boards_and_preferences.sql'), 'utf8');
const migration3 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '003_google_oauth.sql'), 'utf8');
const migration4 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '004_challenge_655_created_by_is_demo.sql'), 'utf8');

test('initial migration creates persistent user-owned and audit tables', () => {
  for (const table of ['users', 'vibes', 'route_feedback', 'user_sessions', 'audit_events', 'schema_migrations']) {
    assert.match(migration1, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration1, /user_id BIGINT REFERENCES users\(id\)/);
  assert.doesNotMatch(migration1, /DROP\s+(TABLE|DATABASE)/i);
});

test('boards migration creates boards, board items, preferences and saved places tables', () => {
  for (const table of ['boards', 'board_items', 'user_preferences', 'saved_places', 'user_route_profiles']) {
    assert.match(migration2, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration2, /REFERENCES users\(id\)/);
  assert.match(migration2, /REFERENCES boards\(id\)/);
});

test('google oauth migration adds google_id and avatar_url to users table', () => {
  assert.match(migration3, /ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id/);
  assert.match(migration3, /ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url/);
});

test('challenge 655 migration ensures created_by and is_demo columns exist', () => {
  assert.match(migration4, /ALTER TABLE vibes ADD COLUMN IF NOT EXISTS created_by/);
  assert.match(migration4, /ALTER TABLE vibes ADD COLUMN IF NOT EXISTS is_demo/);
});
