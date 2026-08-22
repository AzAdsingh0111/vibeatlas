const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const storePath = path.join(__dirname, 'local-store.json');
const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
const pool = new Pool({ connectionString: databaseUrl });

async function migrate() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS postgis');
  await pool.query("DO $$ BEGIN CREATE TYPE vibe_mood AS ENUM ('Calm', 'Musical', 'Excited', 'Reflective', 'Melancholy'); EXCEPTION WHEN duplicate_object THEN null; END $$");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      name TEXT, role TEXT NOT NULL DEFAULT 'Explorer', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS vibes (
      id BIGSERIAL PRIMARY KEY, lat DOUBLE PRECISION NOT NULL, lon DOUBLE PRECISION NOT NULL,
      mood vibe_mood NOT NULL, note TEXT, song TEXT, spotify_track_id TEXT,
      spotify_playlist_id TEXT, weather TEXT, time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      geom GEOGRAPHY(POINT, 4326), name TEXT, mood_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      budget TEXT NOT NULL DEFAULT 'medium', ratings JSONB NOT NULL DEFAULT '{}'::jsonb,
      reviews JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id BIGINT REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS route_feedback (
      id BIGSERIAL PRIMARY KEY, route_id TEXT NOT NULL, before_mood TEXT NOT NULL,
      after_mood TEXT NOT NULL, improvement_score DOUBLE PRECISION NOT NULL,
      feedback_rating DOUBLE PRECISION, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id BIGINT REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const client = await pool.connect();
  const userIds = new Map();
  try {
    await client.query('BEGIN');
    for (const user of store.users || []) {
      const result = await client.query(
        `INSERT INTO users (email, password_hash, name, role, created_at)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()))
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING id`,
        [String(user.email).toLowerCase(), user.password_hash, user.name || '', user.role || 'Explorer', user.createdAt || null]
      );
      userIds.set(String(user.id), result.rows[0].id);
    }

    for (const vibe of store.vibes || []) {
      await client.query(
        `INSERT INTO vibes (lat, lon, mood, name, mood_tags, budget, ratings, reviews, note, song,
          spotify_track_id, spotify_playlist_id, weather, time, created_at, user_id, geom)
         SELECT $1, $2, $3::vibe_mood, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13,
          COALESCE($14::timestamptz, NOW()), COALESCE($15::timestamptz, NOW()), $16,
          ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography`,
        [vibe.lat, vibe.lon, vibe.mood, vibe.name || 'Untitled Spot', JSON.stringify(vibe.moodTags || []), vibe.budget || 'medium',
          JSON.stringify(vibe.ratings || {}), JSON.stringify(vibe.reviews || []), vibe.note || '', vibe.song || '',
          vibe.spotify_track_id || null, vibe.spotify_playlist_id || null, vibe.weather || 'Unknown', vibe.time || null,
          vibe.createdAt || null, userIds.get(String(vibe.userId)) || null]
      );
    }

    for (const feedback of store.routeFeedback || []) {
      await client.query(
        `INSERT INTO route_feedback (user_id, route_id, before_mood, after_mood, improvement_score, feedback_rating, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))`,
        [userIds.get(String(feedback.userId)) || null, feedback.routeId, feedback.beforeMood, feedback.afterMood,
          feedback.improvementScore || 0, feedback.feedbackRating || 0, feedback.createdAt || null]
      );
    }
    await client.query('COMMIT');
    console.log(`Migrated ${(store.users || []).length} users, ${(store.vibes || []).length} vibes, ${(store.routeFeedback || []).length} feedback records.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

migrate().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());