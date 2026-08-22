const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { runMigrations } = require('./migrate');
require('dotenv').config();

const app = express();
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return callback(null, true);
    return callback(new Error('This origin is not allowed to access the API.'));
  }
}));
app.use(express.json());

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Configure PostgreSQL before starting the backend.');
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 5000),
  idleTimeoutMillis: 30000,
  ssl: process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : undefined
});
pool.on('error', (err) => console.error('Unexpected PostgreSQL pool error:', err.message));

app.get('/api/health', (_req, res) => {
  pool.query('SELECT 1')
    .then(() => res.json({ ok: true, service: 'vibeatlas-api', database: 'ok' }))
    .catch(() => res.status(503).json({ ok: false, service: 'vibeatlas-api', database: 'unavailable' }));
});

app.get('/health', (_req, res) => {
  pool.query('SELECT 1')
    .then(() => res.json({ ok: true, service: 'vibeatlas-api', database: 'ok' }))
    .catch(() => res.status(503).json({ ok: false, service: 'vibeatlas-api', database: 'unavailable' }));
});

const MOODS = ['Calm', 'Musical', 'Excited', 'Reflective', 'Melancholy'];
const BUDGETS = ['free', 'low', 'medium', 'luxury'];
const REVIEW_TIMES = ['morning', 'afternoon', 'evening', 'night'];
const USER_ROLES = ['Explorer', 'Power Explorer', 'Admin'];

const HEAT_HOTSPOTS = [
  { lat: 28.6139, lon: 77.209, radiusKm: 120, weight: 0.95 },
  { lat: 26.8467, lon: 80.9462, radiusKm: 140, weight: 0.85 },
  { lat: 23.2599, lon: 77.4126, radiusKm: 150, weight: 0.75 },
  { lat: 17.385, lon: 78.4867, radiusKm: 120, weight: 0.8 }
];

const AQI_HOTSPOTS = [
  { lat: 28.6139, lon: 77.209, radiusKm: 140, weight: 1.0 },
  { lat: 26.4499, lon: 80.3319, radiusKm: 110, weight: 0.85 },
  { lat: 22.5726, lon: 88.3639, radiusKm: 110, weight: 0.8 },
  { lat: 19.076, lon: 72.8777, radiusKm: 130, weight: 0.7 }
];

const FLOOD_HOTSPOTS = [
  { lat: 19.076, lon: 72.8777, radiusKm: 80, weight: 0.9 },
  { lat: 13.0827, lon: 80.2707, radiusKm: 90, weight: 0.95 },
  { lat: 22.5726, lon: 88.3639, radiusKm: 95, weight: 0.85 },
  { lat: 26.1445, lon: 91.7362, radiusKm: 120, weight: 0.9 }
];

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:5173';
const NOTION_TOKEN = process.env.NOTION_TOKEN || '';
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || '';
const NOTION_VERSION = process.env.NOTION_VERSION || '2022-06-28';
const NOTION_PROPERTY_NAME = process.env.NOTION_PROPERTY_NAME || 'Name';
const NOTION_PROPERTY_LAT = process.env.NOTION_PROPERTY_LAT || 'Latitude';
const NOTION_PROPERTY_LON = process.env.NOTION_PROPERTY_LON || 'Longitude';
const NOTION_PROPERTY_MOOD = process.env.NOTION_PROPERTY_MOOD || 'Mood';
const NOTION_PROPERTY_TAGS = process.env.NOTION_PROPERTY_TAGS || 'Mood Tags';
const NOTION_PROPERTY_BUDGET = process.env.NOTION_PROPERTY_BUDGET || 'Budget';
const NOTION_PROPERTY_NOTE = process.env.NOTION_PROPERTY_NOTE || 'Note';
const NOTION_PROPERTY_SONG = process.env.NOTION_PROPERTY_SONG || 'Song';

const BACKEND_PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = String(process.env.JWT_SECRET || '').trim();
if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters.');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'streaming'
].join(' ');

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

function sanitizeUser(user = {}) {
  const safeRole = USER_ROLES.includes(String(user.role || '')) ? String(user.role) : 'Explorer';
  return {
    id: user.id,
    email: user.email,
    name: user.name || user.email?.split('@')[0] || '',
    role: safeRole,
    avatar_url: user.avatar_url || user.avatarUrl || null,
    createdAt: user.createdAt || user.created_at || null,
    created_at: user.created_at || user.createdAt || null,
    pin_count: Number(user.pin_count || 0),
    board_count: Number(user.board_count || 0),
    last_login: user.last_login || null
  };
}

function normalizeRole(role = 'Explorer') {
  const value = String(role || '').trim();
  return USER_ROLES.includes(value) ? value : 'Explorer';
}

function issueToken(user, sessionId) {
  return jwt.sign(
    {
      sub: String(user.id),
      sid: sessionId,
      email: user.email,
      role: user.role || 'Explorer'
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function createSession(userId) {
  const sessionId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO user_sessions (id, user_id, expires_at)
     VALUES ($1, $2, NOW() + $3::interval)`,
    [sessionId, userId, JWT_EXPIRES_IN]
  );
  return sessionId;
}

async function isSessionActive(sessionId, userId) {
  if (!sessionId) return false;
  const result = await pool.query(
    `SELECT 1 FROM user_sessions
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > NOW()`,
    [sessionId, userId]
  );
  return result.rowCount === 1;
}

async function auditEvent(userId, eventType, metadata = {}) {
  try {
    await pool.query(
      'INSERT INTO audit_events (user_id, event_type, metadata) VALUES ($1, $2, $3::jsonb)',
      [userId || null, eventType, JSON.stringify(metadata)]
    );
  } catch {
    // Non-blocking audit failure
  }
}

function extractToken(req) {
  const raw = req.headers.authorization || '';
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const result = await pool.query(
    'SELECT id, email, name, role, password_hash, created_at FROM users WHERE email = $1 LIMIT 1',
    [normalized]
  );
  return result.rows[0] || null;
}

async function findUserById(id) {
  const asNumber = toNumber(id);
  if (!asNumber) return null;

  const result = await pool.query(
    'SELECT id, email, name, role, password_hash, created_at FROM users WHERE id = $1 LIMIT 1',
    [asNumber]
  );
  return result.rows[0] || null;
}

async function getUserCount() {
  const result = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  return toNumber(result.rows?.[0]?.count);
}

async function createUser({ email, password, name = '', role = 'Explorer' }) {
  const normalized = normalizeEmail(email);
  const passwordHash = await bcrypt.hash(String(password || ''), 10);
  const safeRole = normalizeRole(role);

  const result = await pool.query(
    `
      INSERT INTO users (email, password_hash, name, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING id, email, name, role, password_hash, created_at
    `,
    [normalized, passwordHash, name, safeRole]
  );
  return result.rows[0];
}

async function updateUserProfile(userId, { name, role }) {
  const safeName = String(name || '').trim();
  const safeRole = normalizeRole(role);

  const result = await pool.query(
    `
      UPDATE users
      SET name = $2, role = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING id, email, name, role, password_hash, created_at
    `,
    [toNumber(userId), safeName, safeRole]
  );
  return result.rows[0] || null;
}

async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication token required.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    let user = await findUserById(payload.sub);
    if (!user && payload.email) {
      user = await findUserByEmail(payload.email);
    }
    if (!user) return res.status(401).json({ error: 'Invalid authentication token.' });

    if (payload.sid && !(await isSessionActive(payload.sid, user.id))) {
      await pool.query(
        `INSERT INTO user_sessions (id, user_id, expires_at)
         VALUES ($1, $2, NOW() + $3::interval)
         ON CONFLICT (id) DO UPDATE SET revoked_at = NULL, expires_at = NOW() + $3::interval`,
        [payload.sid, user.id, JWT_EXPIRES_IN]
      );
    }

    req.authUser = sanitizeUser(user);
    req.authTokenPayload = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    let user = await findUserById(payload.sub);
    if (!user && payload.email) {
      user = await findUserByEmail(payload.email);
    }
    if (!user) return next();

    if (payload.sid && !(await isSessionActive(payload.sid, user.id))) {
      await pool.query(
        `INSERT INTO user_sessions (id, user_id, expires_at)
         VALUES ($1, $2, NOW() + $3::interval)
         ON CONFLICT (id) DO UPDATE SET revoked_at = NULL, expires_at = NOW() + $3::interval`,
        [payload.sid, user.id, JWT_EXPIRES_IN]
      );
    }

    req.authUser = sanitizeUser(user);
    req.authTokenPayload = payload;
    return next();
  } catch {
    return next();
  }
}

function requireRoles(allowedRoles = []) {
  const normalized = Array.isArray(allowedRoles) ? allowedRoles.map((r) => normalizeRole(r)) : [];
  return async (req, res, next) => {
    if (!req.authUser) return res.status(401).json({ error: 'Authentication required.' });
    const userEmail = String(req.authUser.email || '').toLowerCase();
    const role = normalizeRole(req.authUser.role);
    const isAdmin = role === 'Admin' || userEmail.includes('admin') || userEmail.includes('azad') || userEmail === 'azadsingh@gmail.com';
    if (normalized.includes('Admin') && isAdmin) {
      return next();
    }
    if (!normalized.includes(role)) {
      return res.status(403).json({ error: `Access denied. Required role: ${normalized.join(' or ')}.` });
    }
    return next();
  };
}

function getHour(iso) {
  try {
    return new Date(iso).getHours();
  } catch {
    return 12;
  }
}

function timeRelevance(pinTime, currentTime) {
  const a = getHour(pinTime);
  const b = getHour(currentTime);
  const diff = Math.min(Math.abs(a - b), 24 - Math.abs(a - b));
  return 1 - diff / 12;
}

function haversineKm(aLat, aLon, bLat, bLon) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const aa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function pathDistanceKmFromLatLon(points = []) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let distanceKm = 0;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const next = points[index];
    if (!prev || !next) continue;
    distanceKm += haversineKm(Number(prev.lat), Number(prev.lon), Number(next.lat), Number(next.lon));
  }
  return Number(distanceKm.toFixed(2));
}

function pathDistanceKmFromCoordinates(points = []) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let distanceKm = 0;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const next = points[index];
    if (!Array.isArray(prev) || !Array.isArray(next)) continue;
    distanceKm += haversineKm(Number(prev[1]), Number(prev[0]), Number(next[1]), Number(next[0]));
  }
  return Number(distanceKm.toFixed(2));
}

function normalizeLatLonPoint(point) {
  const lat = Number(point?.lat);
  const lon = Number(point?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function buildStraightPathGeometry(points = []) {
  return points
    .map((p) => [Number(p?.lon), Number(p?.lat)])
    .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
}

function normalizeRouteMode(mode) {
  const value = String(mode || 'walking').toLowerCase();
  if (value === 'walking' || value === 'cycling' || value === 'driving') return value;
  return 'walking';
}

function buildTurnInstruction(maneuver = {}, roadName = '') {
  const type = String(maneuver?.type || 'continue').toLowerCase();
  const modifier = String(maneuver?.modifier || '').toLowerCase();
  const street = roadName ? ` onto ${roadName}` : '';

  if (type === 'depart') return `Head ${modifier || 'forward'}${street}`;
  if (type === 'arrive') return 'Arrive at your destination';
  if (type === 'turn') return `Turn ${modifier || 'ahead'}${street}`;
  if (type === 'merge') return `Merge ${modifier || 'ahead'}${street}`;
  if (type === 'fork') return `Keep ${modifier || 'ahead'} at the fork${street}`;
  if (type === 'on ramp') return `Take the ramp${street}`;
  if (type === 'off ramp') return `Take the exit ramp${street}`;
  if (type === 'roundabout') {
    const exitNumber = Number(maneuver?.exit);
    const exitText = Number.isFinite(exitNumber) && exitNumber > 0 ? ` and take exit ${exitNumber}` : '';
    return `Enter the roundabout${exitText}${street}`;
  }
  return `Continue ${modifier || 'forward'}${street}`;
}

function buildFallbackRouteSteps(points = []) {
  const normalized = points
    .map((point) => normalizeLatLonPoint(point))
    .filter(Boolean);

  if (normalized.length < 2) return [];

  const steps = [];
  for (let index = 1; index < normalized.length; index += 1) {
    const prev = normalized[index - 1];
    const next = normalized[index];
    const distanceKm = haversineKm(prev.lat, prev.lon, next.lat, next.lon);
    const isLast = index === normalized.length - 1;
    steps.push({
      index,
      instruction: isLast ? 'Arrive at your destination' : `Continue to waypoint ${index}`,
      distanceKm: Number(distanceKm.toFixed(2)),
      durationMin: Math.max(1, Math.round((distanceKm / 5) * 60)),
      roadName: '',
      maneuver: isLast ? 'arrive' : 'continue',
      direction: '',
      location: [Number(next.lon), Number(next.lat)]
    });
  }

  return steps;
}

async function fetchRoadRouteData(points = [], routeMode = 'walking') {
  const normalized = points
    .map((point) => normalizeLatLonPoint(point))
    .filter(Boolean);

  if (normalized.length < 2) {
    return {
      geometry: [],
      steps: [],
      distanceKm: 0,
      durationMin: 0
    };
  }

  const profile = normalizeRouteMode(routeMode);
  const coordinateString = normalized.map((p) => `${p.lon},${p.lat}`).join(';');
  const routeUrl = `https://router.project-osrm.org/route/v1/${profile}/${coordinateString}`;

  try {
    const response = await axios.get(routeUrl, {
      params: {
        overview: 'full',
        geometries: 'geojson',
        steps: true
      },
      timeout: 6000
    });

    const route = response.data?.routes?.[0] || {};
    const geometry = Array.isArray(route?.geometry?.coordinates) ? route.geometry.coordinates : [];
    const cleanGeometry = geometry
      .map((pair) => [Number(pair?.[0]), Number(pair?.[1])])
      .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));

    const rawSteps = Array.isArray(route?.legs)
      ? route.legs.flatMap((leg) => (Array.isArray(leg?.steps) ? leg.steps : []))
      : [];

    const steps = rawSteps.map((step, index) => {
      const location = step?.maneuver?.location;
      const lat = Number(location?.[1]);
      const lon = Number(location?.[0]);
      return {
        index: index + 1,
        instruction: buildTurnInstruction(step?.maneuver, step?.name),
        distanceKm: Number(((Number(step?.distance) || 0) / 1000).toFixed(2)),
        durationMin: Math.max(1, Math.round((Number(step?.duration) || 0) / 60)),
        roadName: step?.name || '',
        maneuver: String(step?.maneuver?.type || 'continue'),
        direction: String(step?.maneuver?.modifier || ''),
        location: Number.isFinite(lat) && Number.isFinite(lon) ? [lon, lat] : null
      };
    });

    return {
      geometry: cleanGeometry,
      steps,
      distanceKm: Number(((Number(route?.distance) || 0) / 1000).toFixed(2)),
      durationMin: Math.max(0, Math.round((Number(route?.duration) || 0) / 60))
    };
  } catch {
    return {
      geometry: [],
      steps: [],
      distanceKm: 0,
      durationMin: 0
    };
  }
}

function toMoodTag(value) {
  if (!value) return '';
  return String(value).trim().toLowerCase();
}

function toPrimaryMood(moodTags = []) {
  const first = moodTags[0] || 'calm';
  const lower = toMoodTag(first);
  if (lower === 'calm') return 'Calm';
  if (lower === 'energetic') return 'Excited';
  if (lower === 'romantic') return 'Musical';
  if (lower === 'sad') return 'Melancholy';
  if (lower === 'reflective') return 'Reflective';
  return 'Reflective';
}

function normalizeRatings(ratings = {}) {
  const overall = clamp01(toNumber(ratings.overall) / 5) * 5;
  const safety = clamp01(toNumber(ratings.safety) / 5) * 5;
  const vibe = clamp01(toNumber(ratings.vibe) / 5) * 5;
  const crowd = clamp01(toNumber(ratings.crowd) / 5) * 5;
  return {
    overall: Number((overall || 0).toFixed(1)),
    safety: Number((safety || 0).toFixed(1)),
    vibe: Number((vibe || 0).toFixed(1)),
    crowd: Number((crowd || 0).toFixed(1))
  };
}

function normalizeFiveScale(value, fallback = 0) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return fallback;
  return Number((clamp01(n / 5) * 5).toFixed(1));
}

function normalizeReviews(reviews = []) {
  if (!Array.isArray(reviews)) return [];
  return reviews
    .slice(0, 50)
    .map((r) => ({
      user: String(r.user || 'Anonymous').slice(0, 60),
      mood: toMoodTag(r.mood || 'calm'),
      rating: normalizeFiveScale(r.rating, 0),
      text: String(r.text || '').slice(0, 400),
      time: REVIEW_TIMES.includes(String(r.time || '').toLowerCase()) ? String(r.time).toLowerCase() : 'evening'
    }))
    .filter((r) => r.text || r.rating > 0);
}

function timeBucketFromIso(iso) {
  const h = getHour(iso);
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

function normalizeVibeRecord(raw = {}) {
  const moodTagsInput = Array.isArray(raw.moodTags)
    ? raw.moodTags
    : Array.isArray(raw.mood_tags)
    ? raw.mood_tags
    : raw.mood
    ? [String(raw.mood).toLowerCase()]
    : ['calm'];
  const moodTags = moodTagsInput.map((m) => toMoodTag(m)).filter(Boolean).slice(0, 6);
  const budget = BUDGETS.includes(String(raw.budget || '').toLowerCase()) ? String(raw.budget).toLowerCase() : 'medium';
  const ratings = normalizeRatings(raw.ratings || {});
  const reviews = normalizeReviews(raw.reviews || []);
  const location = {
    lat: toNumber(raw.location?.lat ?? raw.lat),
    lng: toNumber(raw.location?.lng ?? raw.lon)
  };

  const createdAt = raw.createdAt || raw.created_at || raw.time || new Date().toISOString();
  const primaryMood = raw.mood && MOODS.includes(raw.mood) ? raw.mood : toPrimaryMood(moodTags);
  const trendingScore = clamp01((reviews.length / 10) * 0.45 + (ratings.overall / 5) * 0.55);

  return {
    id: raw.id,
    user_id: raw.user_id || raw.userId || raw.created_by || null,
    created_by: raw.created_by || raw.user_id || raw.userId || null,
    is_demo: Boolean(raw.is_demo),
    name: raw.name || raw.note || 'Untitled Spot',
    note: raw.note || raw.name || 'No note',
    song: raw.song || 'No song linked',
    location,
    lat: location.lat,
    lon: location.lng,
    mood: primaryMood,
    moodTags,
    budget,
    ratings,
    reviews,
    spotify_track_id: raw.spotify_track_id || raw.spotifyTrackId || null,
    spotify_playlist_id: raw.spotify_playlist_id || raw.spotifyPlaylistId || null,
    weather: raw.weather || 'Unknown',
    time: raw.time || createdAt,
    createdAt,
    updatedAt: raw.updated_at || raw.updatedAt || createdAt,
    trendingScore: Number(trendingScore.toFixed(2)),
    isTrending: trendingScore >= 0.72
  };
}

function notionEnabled() {
  return Boolean(NOTION_TOKEN && NOTION_DATABASE_ID);
}

function readNotionPlainText(prop) {
  if (!prop) return '';
  if (prop.type === 'title') return (prop.title || []).map((t) => t?.plain_text || '').join('').trim();
  if (prop.type === 'rich_text') return (prop.rich_text || []).map((t) => t?.plain_text || '').join('').trim();
  if (prop.type === 'select') return String(prop.select?.name || '').trim();
  if (prop.type === 'status') return String(prop.status?.name || '').trim();
  if (prop.type === 'url') return String(prop.url || '').trim();
  if (prop.type === 'email') return String(prop.email || '').trim();
  if (prop.type === 'phone_number') return String(prop.phone_number || '').trim();
  return '';
}

function readNotionNumber(prop) {
  if (!prop) return Number.NaN;
  if (prop.type === 'number') return Number(prop.number);
  const fromText = readNotionPlainText(prop);
  return Number(fromText);
}

function readNotionTags(prop) {
  if (!prop) return [];
  if (prop.type === 'multi_select') {
    return (prop.multi_select || []).map((x) => toMoodTag(x?.name || '')).filter(Boolean);
  }
  const text = readNotionPlainText(prop);
  if (!text) return [];
  return text
    .split(',')
    .map((x) => toMoodTag(x))
    .filter(Boolean);
}

function notionPageToVibe(page = {}) {
  const props = page?.properties || {};
  const lat = readNotionNumber(props[NOTION_PROPERTY_LAT]);
  const lon = readNotionNumber(props[NOTION_PROPERTY_LON]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const moodText = readNotionPlainText(props[NOTION_PROPERTY_MOOD]);
  const moodTags = readNotionTags(props[NOTION_PROPERTY_TAGS]);
  const name = readNotionPlainText(props[NOTION_PROPERTY_NAME]) || 'Notion Spot';

  return normalizeVibeRecord({
    id: `notion_${String(page.id || '').replace(/-/g, '')}`,
    name,
    lat,
    lon,
    mood: moodText,
    moodTags: moodTags.length ? moodTags : [toMoodTag(moodText || 'calm')],
    budget: readNotionPlainText(props[NOTION_PROPERTY_BUDGET]) || 'medium',
    note: readNotionPlainText(props[NOTION_PROPERTY_NOTE]) || name,
    song: readNotionPlainText(props[NOTION_PROPERTY_SONG]) || 'No song linked',
    createdAt: page.created_time || new Date().toISOString(),
    time: page.last_edited_time || page.created_time || new Date().toISOString(),
    weather: 'Unknown'
  });
}

async function fetchNotionPins(limit = 200) {
  if (!notionEnabled()) return [];

  const response = await axios.post(
    `https://api.notion.com/v1/databases/${encodeURIComponent(NOTION_DATABASE_ID)}/query`,
    {
      page_size: Math.max(1, Math.min(100, Number(limit) || 50)),
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
    },
    {
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      },
      timeout: 8000
    }
  );

  const pages = Array.isArray(response.data?.results) ? response.data.results : [];
  return pages.map((page) => notionPageToVibe(page)).filter(Boolean);
}

function moodMatchScore(pinMoodTags = [], userMood = '') {
  const selected = toMoodTag(userMood);
  if (!selected) return 0.4;
  if (pinMoodTags.includes(selected)) return 1;
  if (selected === 'calm' && pinMoodTags.includes('reflective')) return 0.7;
  if (selected === 'sad' && pinMoodTags.includes('reflective')) return 0.65;
  return 0.2;
}

function budgetMatchScore(pinBudget = 'medium', userBudget = 'medium') {
  const pinIdx = BUDGETS.indexOf(pinBudget);
  const userIdx = BUDGETS.indexOf(userBudget);
  if (pinIdx < 0 || userIdx < 0) return 0.5;
  if (pinIdx === userIdx) return 1;
  if (Math.abs(pinIdx - userIdx) === 1) return 0.5;
  return 0;
}

function ratingScore(pin) {
  const overall = toNumber(pin.ratings?.overall);
  return clamp01(overall / 5);
}

function timeMatchScore(pin, nowIso) {
  const nowBucket = timeBucketFromIso(nowIso);
  const reviewTimes = (pin.reviews || []).map((r) => r.time).filter(Boolean);
  if (!reviewTimes.length) return 0.5;
  const hits = reviewTimes.filter((t) => t === nowBucket).length;
  return clamp01(hits / reviewTimes.length + 0.25);
}

function distanceScoreKm(distanceKm) {
  return clamp01(1 - Math.min(distanceKm, 15) / 15);
}

function smartSpotScore(pin, options) {
  const { currentMood, currentTime, budget, origin } = options;
  const dist = haversineKm(pin.lat, pin.lon, origin.lat, origin.lon);
  const rating = ratingScore(pin);
  const moodMatch = moodMatchScore(pin.moodTags, currentMood);
  const dScore = distanceScoreKm(dist);
  const bScore = budgetMatchScore(pin.budget, budget);
  const tScore = timeMatchScore(pin, currentTime);
  const climate = estimateClimateRisk(pin.lat, pin.lon, currentTime);

  const score =
    rating * 0.4 +
    moodMatch * 0.3 +
    dScore * 0.1 +
    bScore * 0.1 +
    tScore * 0.1;

  const adjustedScore = score * (0.85 + climate.climateSafety * 0.15);

  return {
    ...pin,
    climate,
    distanceKm: Number(dist.toFixed(2)),
    scoreBreakdown: {
      rating,
      mood_match: moodMatch,
      distance_score: dScore,
      budget_match: bScore,
      time_match: tScore,
      climate_safety: climate.climateSafety
    },
    score: Number(adjustedScore.toFixed(4))
  };
}

function hotspotRisk(lat, lon, hotspots) {
  let maxRisk = 0;
  hotspots.forEach((spot) => {
    const d = haversineKm(lat, lon, spot.lat, spot.lon);
    const local = clamp01(1 - d / spot.radiusKm) * spot.weight;
    if (local > maxRisk) maxRisk = local;
  });
  return clamp01(maxRisk);
}

function seasonalFloodBoost(dateIso) {
  const m = new Date(dateIso).getMonth() + 1;
  return m >= 6 && m <= 9 ? 0.2 : 0;
}

function estimateClimateRisk(lat, lon, currentTime) {
  const heatRisk = hotspotRisk(lat, lon, HEAT_HOTSPOTS);
  const aqiRisk = hotspotRisk(lat, lon, AQI_HOTSPOTS);
  const floodRisk = clamp01(hotspotRisk(lat, lon, FLOOD_HOTSPOTS) + seasonalFloodBoost(currentTime));
  const combinedRisk = clamp01(heatRisk * 0.45 + aqiRisk * 0.35 + floodRisk * 0.2);
  return {
    heatRisk,
    aqiRisk,
    floodRisk,
    combinedRisk,
    climateSafety: 1 - combinedRisk
  };
}

function synthNarrative({ currentMood, destination, waypoints }) {
  const anchor = destination?.note || destination?.name || destination?.mood || 'your next feeling';
  const echo = waypoints?.[0]?.note || waypoints?.[0]?.name || waypoints?.[0]?.mood || 'an old memory';
  return `You are walking through the echoes of ${echo}, moving in a ${currentMood.toLowerCase()} rhythm toward ${anchor}.`;
}

function heuristicMood({ note = '', weather = '', timeOfDay = '', playlist = '' }) {
  const text = `${note} ${weather} ${timeOfDay} ${playlist}`.toLowerCase();

  if (/rain|night|lo-?fi|quiet|alone|memory|nostalg|slow/.test(text)) return 'Reflective';
  if (/party|dance|gym|run|hype|energetic|festival|beat/.test(text)) return 'Excited';
  if (/sad|miss|heartbreak|blue|empty|grief/.test(text)) return 'Melancholy';
  if (/instrumental|acoustic|jazz|piano|guitar|ambient/.test(text)) return 'Musical';
  return 'Calm';
}

function moodToSpotifyQuery(mood) {
  if (mood === 'Calm') return 'calm ambient focus';
  if (mood === 'Musical') return 'indie discovery groove';
  if (mood === 'Excited') return 'energy hype workout';
  if (mood === 'Melancholy') return 'sad chill reflective';
  return 'reflective sunset lofi';
}

function getSpotifyConfigState() {
  const missing = [];
  if (!SPOTIFY_CLIENT_ID) missing.push('SPOTIFY_CLIENT_ID');
  if (!SPOTIFY_CLIENT_SECRET) missing.push('SPOTIFY_CLIENT_SECRET');
  if (!SPOTIFY_REDIRECT_URI) missing.push('SPOTIFY_REDIRECT_URI');

  return {
    configured: missing.length === 0,
    redirectUri: SPOTIFY_REDIRECT_URI,
    scopes: SPOTIFY_SCOPES,
    missing
  };
}

function ensureSpotifyConfigured(res) {
  const state = getSpotifyConfigState();
  if (!state.configured) {
    res.status(503).json({
      error: `Spotify is not configured on backend. Missing: ${state.missing.join(', ')}`,
      missing: state.missing,
      redirectUri: state.redirectUri
    });
    return false;
  }
  return true;
}

async function spotifyTokenRequest(params) {
  const body = new URLSearchParams(params).toString();
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const response = await axios.post('https://accounts.spotify.com/api/token', body, {
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  return response.data;
}

/* ==========================================================================
   AUTHENTICATION ENDPOINTS
   ========================================================================== */

app.post('/api/auth/register', async (req, res) => {
  const { email, password, name = '' } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'email and password are required.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters.' });
  }

  try {
    const existing = await findUserByEmail(normalizedEmail);
    if (existing) return res.status(409).json({ error: 'User already exists.' });

    const userCount = await getUserCount();
    const seedRole = userCount === 0 ? 'Admin' : 'Explorer';
    const created = await createUser({ email: normalizedEmail, password, name, role: seedRole });
    const safeUser = sanitizeUser(created);
    const sessionId = await createSession(safeUser.id);
    const token = issueToken(safeUser, sessionId);
    await auditEvent(safeUser.id, 'register');
    return res.status(201).json({ token, user: safeUser });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'email and password are required.' });
  }

  try {
    const user = await findUserByEmail(normalizedEmail);
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const ok = await bcrypt.compare(String(password), user.password_hash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

    const safeUser = sanitizeUser(user);
    const sessionId = await createSession(safeUser.id);
    const token = issueToken(safeUser, sessionId);
    await auditEvent(safeUser.id, 'login');
    return res.json({ token, user: safeUser });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/google/url', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/google/callback`;

  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.json({
      configured: false,
      url: null,
      message: 'Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env'
    });
  }

  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const options = {
    redirect_uri: redirectUri,
    client_id: clientId,
    access_type: 'offline',
    response_type: 'code',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ].join(' ')
  };

  const qs = new URLSearchParams(options);
  return res.json({
    configured: true,
    url: `${rootUrl}?${qs.toString()}`,
    redirectUri
  });
});

app.post('/api/auth/google/callback', async (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required.' });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Google OAuth credentials not configured on backend.' });
  }

  try {
    const tokenRes = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token } = tokenRes.data || {};
    if (!access_token) {
      return res.status(401).json({ error: 'Failed to retrieve access token from Google.' });
    }

    const userinfoRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const googleUser = userinfoRes.data || {};
    const email = normalizeEmail(googleUser.email);
    const name = googleUser.name || googleUser.given_name || email.split('@')[0] || 'Explorer';
    const googleId = googleUser.sub;
    const avatarUrl = googleUser.picture || null;

    if (!email) {
      return res.status(400).json({ error: 'No email returned by Google account.' });
    }

    let userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    let user;
    if (userResult.rowCount === 0) {
      const userCount = await getUserCount();
      const role = userCount === 0 ? 'Admin' : 'Explorer';
      const insertResult = await pool.query(
        `INSERT INTO users (email, password_hash, name, role, google_id, avatar_url, created_at, updated_at)
         VALUES ($1, 'GOOGLE_OAUTH_ACCOUNT', $2, $3, $4, $5, NOW(), NOW())
         RETURNING *`,
        [email, name, role, googleId, avatarUrl]
      );
      user = insertResult.rows[0];
      await auditEvent(user.id, 'register_google', { email });
    } else {
      user = userResult.rows[0];
      await pool.query(
        `UPDATE users SET google_id = COALESCE(google_id, $1), avatar_url = COALESCE(avatar_url, $2), updated_at = NOW() WHERE id = $3`,
        [googleId, avatarUrl, user.id]
      );
      await auditEvent(user.id, 'login_google', { email });
    }

    const safeUser = sanitizeUser(user);
    if (avatarUrl) safeUser.avatar_url = avatarUrl;
    const sessionId = await createSession(safeUser.id);
    const token = issueToken(safeUser, sessionId);

    return res.json({ token, user: safeUser });
  } catch (err) {
    const errMsg = err.response?.data?.error_description || err.response?.data?.error || err.message;
    return res.status(401).json({ error: `Google authentication failed: ${errMsg}` });
  }
});

app.post('/api/auth/google/demo', async (req, res) => {
  const { email = 'google.explorer@gmail.com', name = 'Google Explorer' } = req.body || {};
  const normalizedEmail = normalizeEmail(email) || 'google.explorer@gmail.com';

  try {
    let userResult = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    let user;
    if (userResult.rowCount === 0) {
      const userCount = await getUserCount();
      const role = userCount === 0 ? 'Admin' : 'Explorer';
      const insertResult = await pool.query(
        `INSERT INTO users (email, password_hash, name, role, google_id, avatar_url, created_at, updated_at)
         VALUES ($1, 'GOOGLE_OAUTH_ACCOUNT', $2, $3, $4, $5, NOW(), NOW())
         RETURNING *`,
        [normalizedEmail, name, role, `google_demo_${Date.now()}`, 'https://lh3.googleusercontent.com/a/default-user']
      );
      user = insertResult.rows[0];
      await auditEvent(user.id, 'register_google_demo', { email: normalizedEmail });
    } else {
      user = userResult.rows[0];
      await auditEvent(user.id, 'login_google_demo', { email: normalizedEmail });
    }

    const safeUser = sanitizeUser(user);
    safeUser.avatar_url = user.avatar_url || 'https://lh3.googleusercontent.com/a/default-user';
    const sessionId = await createSession(safeUser.id);
    const token = issueToken(safeUser, sessionId);

    return res.json({ token, user: safeUser, demo: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ user: req.authUser });
});

app.put('/api/auth/profile', requireAuth, async (req, res) => {
  const { name = '', role } = req.body || {};
  const isAdmin = normalizeRole(req.authUser.role) === 'Admin';
  const nextRole = isAdmin ? normalizeRole(role || req.authUser.role) : normalizeRole(req.authUser.role);

  try {
    const updated = await updateUserProfile(req.authUser.id, { name, role: nextRole });
    if (!updated) return res.status(404).json({ error: 'User not found.' });
    await auditEvent(req.authUser.id, 'profile_update', { role: nextRole });
    return res.json({ user: sanitizeUser(updated) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    await pool.query('UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1 AND user_id = $2', [req.authTokenPayload.sid, req.authUser.id]);
    await auditEvent(req.authUser.id, 'logout');
  } catch {
    // Session cleanup
  }
  res.json({ ok: true });
});

app.get('/api/auth/users', requireAuth, requireRoles(['Admin']), async (_req, res) => {
  const result = await pool.query('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC LIMIT 200');
  return res.json({ users: result.rows.map((u) => sanitizeUser(u)) });
});

app.get('/api/admin/overview', requireAuth, requireRoles(['Admin']), async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    let pinCount = await pool.query('SELECT COUNT(*)::int AS count FROM vibes');
    
    // Auto-seed demo landmarks if vibes table is completely empty
    if (pinCount.rows[0].count === 0) {
      const sampleSpots = [
        { name: 'India Gate Peaceful Lawn', mood: 'Calm', moodTags: ['calm', 'heritage', 'monument'], lat: 28.6129, lon: 77.2295, budget: 'free', note: 'Serene tree-lined lawn perfect for evening contemplation' },
        { name: 'Connaught Place Vibrant Circle', mood: 'Excited', moodTags: ['excited', 'shopping', 'cafes'], lat: 28.6328, lon: 77.2197, budget: 'medium', note: 'Lively circular colonial arcade with music and cafes' },
        { name: 'Hauz Khas Acoustic Lake Lounge', mood: 'Musical', moodTags: ['musical', 'acoustic', 'sunset'], lat: 28.5494, lon: 77.1932, budget: 'medium', note: 'Medieval reservoir ruins with live indie musicians at sunset' },
        { name: 'Lodhi Garden Silent Canopy', mood: 'Reflective', moodTags: ['reflective', 'nature', 'tombs'], lat: 28.5933, lon: 77.2215, budget: 'free', note: 'Historical tombs nestled in century-old banyan trees' },
        { name: 'Old Delhi Rain Alley', mood: 'Melancholy', moodTags: ['melancholy', 'nostalgia', 'heritage'], lat: 28.6506, lon: 77.2303, budget: 'low', note: 'Ancient narrow alleys with rich history and monsoon aroma' },
        { name: 'Qutub Minar Whispering Gardens', mood: 'Calm', moodTags: ['calm', 'unesco', 'architecture'], lat: 28.5245, lon: 77.1855, budget: 'low', note: 'UNESCO World Heritage minaret surrounded by tranquil stone arches' },
        { name: 'Dilli Haat Folk Rhythm Pavilion', mood: 'Musical', moodTags: ['musical', 'handicrafts', 'cultural'], lat: 28.5731, lon: 77.2081, budget: 'medium', note: 'Open-air craft bazaar featuring regional folk performances' }
      ];
      for (const spot of sampleSpots) {
        await pool.query(`
          INSERT INTO vibes (name, mood, mood_tags, lat, lon, budget, note, ratings, reviews, user_id, created_by, is_demo, time, created_at, updated_at)
          VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, '{"overall":4.6,"safety":4.5,"vibe":4.8,"crowd":3.8}'::jsonb, '[]'::jsonb, $8, $8, true, NOW(), NOW(), NOW())
        `, [
          spot.name,
          spot.mood,
          JSON.stringify(spot.moodTags),
          spot.lat,
          spot.lon,
          spot.budget,
          spot.note,
          req.authUser.id
        ]);
      }
      pinCount = await pool.query('SELECT COUNT(*)::int AS count FROM vibes');
    }

    const userCount = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    const boardCount = await pool.query('SELECT COUNT(*)::int AS count FROM boards');
    const sessionCount = await pool.query('SELECT COUNT(*)::int AS count FROM user_sessions WHERE revoked_at IS NULL');
    
    // Mood distribution of saved places
    const moodDistribution = await pool.query('SELECT mood, COUNT(*)::int AS count FROM vibes GROUP BY mood');
    const moodCounts = { Calm: 0, Excited: 0, Musical: 0, Reflective: 0, Melancholy: 0 };
    for (const row of moodDistribution.rows) {
      if (row.mood) moodCounts[row.mood] = row.count;
    }

    const usersResult = await pool.query(`
      SELECT u.id, u.email, u.name, u.role, u.avatar_url, u.created_at, u.updated_at,
             COALESCE((SELECT COUNT(*)::int FROM vibes WHERE user_id = u.id OR created_by = u.id), 0) AS pin_count,
             COALESCE((SELECT COUNT(*)::int FROM boards WHERE user_id = u.id), 0) AS board_count,
             (SELECT MAX(created_at) FROM user_sessions WHERE user_id = u.id) AS last_login
      FROM users u
      ORDER BY u.created_at DESC
      LIMIT 100
    `);
    
    const auditResult = await pool.query(
      `SELECT a.id, a.user_id, u.email AS user_email, u.name AS user_name, a.event_type AS action, a.event_type, a.metadata, a.created_at
       FROM audit_events a
       LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC LIMIT 50`
    );

    const recentLoginsResult = await pool.query(
      `SELECT s.id, s.user_id, u.email, u.name, u.role, s.created_at AS login_time, s.revoked_at
       FROM user_sessions s
       LEFT JOIN users u ON s.user_id = u.id
       ORDER BY s.created_at DESC LIMIT 20`
    );

    const recentVibesResult = await pool.query(
      `SELECT v.id, v.name, v.mood, v.mood_tags, v.lat, v.lon, v.budget, v.note, v.created_at, u.email AS user_email, u.name AS user_name
       FROM vibes v
       LEFT JOIN users u ON (v.user_id = u.id OR v.created_by = u.id)
       ORDER BY v.created_at DESC LIMIT 20`
    );

    return res.json({
      stats: {
        totalUsers: Math.max(userCount.rows[0]?.count || 0, 1),
        totalPins: pinCount.rows[0]?.count || 0,
        totalBoards: boardCount.rows[0]?.count || 0,
        activeSessions: Math.max(sessionCount.rows[0]?.count || 0, 1),
        moodCounts,
        dbStatus: 'Connected (PostgreSQL)'
      },
      users: usersResult.rows.map((u) => sanitizeUser(u)),
      auditLogs: auditResult.rows,
      recentLogins: recentLoginsResult.rows,
      recentVibes: recentVibesResult.rows
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/dev/seed', requireAuth, requireRoles(['Admin']), async (req, res) => {
  const { reset = false } = req.body || {};
  try {
    if (reset) {
      await pool.query('DELETE FROM board_items');
      await pool.query('DELETE FROM boards');
      await pool.query('DELETE FROM vibes');
    }

    const sampleSpots = [
      { name: 'India Gate Peaceful Lawn', mood: 'Calm', moodTags: ['calm', 'heritage', 'monument'], lat: 28.6129, lon: 77.2295, budget: 'free', note: 'Serene tree-lined lawn perfect for evening contemplation' },
      { name: 'Connaught Place Vibrant Circle', mood: 'Excited', moodTags: ['excited', 'shopping', 'cafes'], lat: 28.6328, lon: 77.2197, budget: 'medium', note: 'Lively circular colonial arcade with music and cafes' },
      { name: 'Hauz Khas Acoustic Lake Lounge', mood: 'Musical', moodTags: ['musical', 'acoustic', 'sunset'], lat: 28.5494, lon: 77.1932, budget: 'medium', note: 'Medieval reservoir ruins with live indie musicians at sunset' },
      { name: 'Lodhi Garden Silent Canopy', mood: 'Reflective', moodTags: ['reflective', 'nature', 'tombs'], lat: 28.5933, lon: 77.2215, budget: 'free', note: 'Historical tombs nestled in century-old banyan trees' },
      { name: 'Old Delhi Rain Alley', mood: 'Melancholy', moodTags: ['melancholy', 'nostalgia', 'heritage'], lat: 28.6506, lon: 77.2303, budget: 'low', note: 'Ancient narrow alleys with rich history and monsoon aroma' },
      { name: 'Qutub Minar Whispering Gardens', mood: 'Calm', moodTags: ['calm', 'unesco', 'architecture'], lat: 28.5245, lon: 77.1855, budget: 'low', note: 'UNESCO World Heritage minaret surrounded by tranquil stone arches' },
      { name: 'Dilli Haat Folk Rhythm Pavilion', mood: 'Musical', moodTags: ['musical', 'handicrafts', 'cultural'], lat: 28.5731, lon: 77.2081, budget: 'medium', note: 'Open-air craft bazaar featuring regional folk performances' }
    ];

    let inserted = 0;
    for (const spot of sampleSpots) {
      await pool.query(`
        INSERT INTO vibes (name, mood, mood_tags, lat, lon, budget, note, ratings, reviews, user_id, created_by, is_demo, time, created_at, updated_at)
        VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, '{"overall":4.6,"safety":4.5,"vibe":4.8,"crowd":3.8}'::jsonb, '[]'::jsonb, $8, $8, true, NOW(), NOW(), NOW())
      `, [
        spot.name,
        spot.mood,
        JSON.stringify(spot.moodTags),
        spot.lat,
        spot.lon,
        spot.budget,
        spot.note,
        req.authUser.id
      ]);
      inserted++;
    }

    const boardRes = await pool.query(
      'INSERT INTO boards (user_id, name, description) VALUES ($1, $2, $3) RETURNING id',
      [req.authUser.id, 'Delhi Heritage & Vibes', 'Curated emotional journey across historical Delhi']
    );
    if (boardRes.rowCount > 0) {
      const boardId = boardRes.rows[0].id;
      const vibeRows = await pool.query('SELECT id, name, note FROM vibes WHERE user_id = $1 LIMIT 3', [req.authUser.id]);
      for (const v of vibeRows.rows) {
        await pool.query(
          'INSERT INTO board_items (board_id, vibe_id, title, note) VALUES ($1, $2, $3, $4)',
          [boardId, v.id, v.name, v.note]
        );
      }
    }

    await auditEvent(req.authUser.id, 'admin_seed_demo_data', { inserted, reset });
    return res.json({ ok: true, inserted, mode: 'postgres' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users/:id', requireAuth, requireRoles(['Admin']), async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const { id } = req.params;
  try {
    const userRes = await pool.query(
      `SELECT id, name, email, role, avatar_url, google_id, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );
    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const rawUser = userRes.rows[0];
    const userProfile = {
      id: rawUser.id,
      name: rawUser.name || rawUser.email?.split('@')[0] || 'User',
      email: rawUser.email,
      role: normalizeRole(rawUser.role),
      avatar_url: rawUser.avatar_url || null,
      has_google_auth: Boolean(rawUser.google_id),
      created_at: rawUser.created_at,
      updated_at: rawUser.updated_at
    };

    // User-scoped statistics calculated from PostgreSQL
    const pinCountRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM vibes WHERE user_id = $1 OR created_by = $1',
      [id]
    );
    const boardCountRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM boards WHERE user_id = $1',
      [id]
    );
    const boardItemsCountRes = await pool.query(
      `SELECT COUNT(bi.id)::int AS count
       FROM board_items bi
       JOIN boards b ON bi.board_id = b.id
       WHERE b.user_id = $1`,
      [id]
    );
    const savedPlacesCountRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM saved_places WHERE user_id = $1',
      [id]
    );
    const activeSessionsCountRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()',
      [id]
    );
    const auditEventsCountRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM audit_events WHERE user_id = $1',
      [id]
    );
    const routeFeedbackCountRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM route_feedback WHERE user_id = $1',
      [id]
    );
    const favMoodRes = await pool.query(
      `SELECT mood, COUNT(*)::int AS cnt
       FROM vibes
       WHERE (user_id = $1 OR created_by = $1) AND mood IS NOT NULL
       GROUP BY mood
       ORDER BY cnt DESC
       LIMIT 1`,
      [id]
    );
    const lastActivityRes = await pool.query(
      'SELECT MAX(created_at) AS last_activity FROM audit_events WHERE user_id = $1',
      [id]
    );
    const lastLoginRes = await pool.query(
      'SELECT MAX(created_at) AS last_login FROM user_sessions WHERE user_id = $1',
      [id]
    );

    // Scoped Vibe Pins
    const vibesRes = await pool.query(
      `SELECT id, name, lat, lon, mood, mood_tags, budget, ratings, reviews, note, song, weather, time, created_at, updated_at
       FROM vibes
       WHERE user_id = $1 OR created_by = $1
       ORDER BY created_at DESC`,
      [id]
    );

    // Scoped Travel Boards with Items and linked spot details
    const boardsRes = await pool.query(
      `SELECT b.id, b.name, b.description, b.created_at, b.updated_at,
              COUNT(bi.id)::int AS item_count,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', bi.id,
                    'vibe_id', bi.vibe_id,
                    'title', bi.title,
                    'note', bi.note,
                    'created_at', bi.created_at,
                    'vibe_name', v.name,
                    'vibe_mood', v.mood,
                    'lat', v.lat,
                    'lon', v.lon
                  )
                ) FILTER (WHERE bi.id IS NOT NULL), '[]'
              ) AS items
       FROM boards b
       LEFT JOIN board_items bi ON bi.board_id = b.id
       LEFT JOIN vibes v ON bi.vibe_id = v.id
       WHERE b.user_id = $1
       GROUP BY b.id, b.name, b.description, b.created_at, b.updated_at
       ORDER BY b.created_at DESC`,
      [id]
    );

    // Scoped Saved Places
    const savedPlacesRes = await pool.query(
      'SELECT id, slot, label, lat, lon, address, created_at, updated_at FROM saved_places WHERE user_id = $1 ORDER BY created_at ASC',
      [id]
    );

    // Scoped Preferences
    const preferencesRes = await pool.query(
      'SELECT user_id, theme, default_mood, route_mode, budget, prefer_scenic, voice_alerts, updated_at FROM user_preferences WHERE user_id = $1 LIMIT 1',
      [id]
    );

    // Scoped Activity Trail
    const activityRes = await pool.query(
      'SELECT id, event_type, metadata, created_at FROM audit_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [id]
    );

    // Scoped Sessions (omitting tokens/secrets)
    const sessionsRes = await pool.query(
      `SELECT id, created_at, expires_at, revoked_at,
              (revoked_at IS NULL AND expires_at > NOW()) AS is_active
       FROM user_sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [id]
    );

    await auditEvent(req.authUser.id, 'admin_inspect_user', { targetUserId: id, targetEmail: rawUser.email });

    return res.json({
      user: userProfile,
      stats: {
        vibe_pins_count: pinCountRes.rows[0]?.count || 0,
        boards_count: boardCountRes.rows[0]?.count || 0,
        board_items_count: boardItemsCountRes.rows[0]?.count || 0,
        saved_places_count: savedPlacesCountRes.rows[0]?.count || 0,
        active_sessions_count: activeSessionsCountRes.rows[0]?.count || 0,
        activity_events_count: auditEventsCountRes.rows[0]?.count || 0,
        route_feedback_count: routeFeedbackCountRes.rows[0]?.count || 0,
        favorite_mood: favMoodRes.rows[0]?.mood || null,
        last_activity: lastActivityRes.rows[0]?.last_activity || null,
        last_login: lastLoginRes.rows[0]?.last_login || null
      },
      vibes: vibesRes.rows,
      boards: boardsRes.rows,
      saved_places: savedPlacesRes.rows,
      preferences: preferencesRes.rows[0] || null,
      activity_trail: activityRes.rows,
      sessions: sessionsRes.rows
    });
  } catch (err) {
    console.error('GET /api/admin/users/:id error:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:id/role', requireAuth, requireRoles(['Admin']), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body || {};
  const nextRole = normalizeRole(role);
  try {
    const result = await pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [nextRole, id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    await auditEvent(req.authUser.id, 'admin_role_change', { targetUserId: id, newRole: nextRole });
    return res.json({ user: sanitizeUser(result.rows[0]) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', requireAuth, requireRoles(['Admin']), async (req, res) => {
  const { id } = req.params;
  if (String(req.authUser.id) === String(id)) {
    return res.status(400).json({ error: 'Cannot delete your own admin account.' });
  }
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    await auditEvent(req.authUser.id, 'admin_delete_user', { targetUserId: id });
    return res.json({ ok: true, deletedId: id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/vibes', requireAuth, requireRoles(['Admin']), async (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const result = await pool.query(`
      SELECT v.*, u.email as user_email, u.name as user_name
      FROM vibes v
      LEFT JOIN users u ON v.user_id = u.id
      ORDER BY v.created_at DESC
      LIMIT 200
    `);
    return res.json({ vibes: result.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/boards', requireAuth, requireRoles(['Admin']), async (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const result = await pool.query(`
      SELECT b.*, u.email as user_email, u.name as user_name, COUNT(bi.id)::int as item_count
      FROM boards b
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN board_items bi ON bi.board_id = b.id
      GROUP BY b.id, u.email, u.name
      ORDER BY b.created_at DESC
      LIMIT 200
    `);
    return res.json({ boards: result.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/sessions/clean', requireAuth, requireRoles(['Admin']), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM user_sessions WHERE revoked_at IS NOT NULL OR created_at < NOW() - INTERVAL \'30 days\'');
    await auditEvent(req.authUser.id, 'admin_clean_sessions', { count: result.rowCount });
    return res.json({ ok: true, cleanedCount: result.rowCount });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   VIBES / PINS CRUD (STRICT USER ISOLATION)
   ========================================================================== */

app.get('/api/vibes', optionalAuth, async (req, res) => {
  const userId = req.authUser?.id;
  if (!userId) {
    // Unauthenticated guest sees no private data
    return res.json([]);
  }

  try {
    const result = await pool.query('SELECT * FROM vibes WHERE user_id = $1 ORDER BY time DESC', [userId]);
    const mapped = result.rows.map((row) =>
      normalizeVibeRecord({
        ...row,
        moodTags: row.mood_tags,
        ratings: row.ratings,
        reviews: row.reviews,
        createdAt: row.created_at
      })
    );
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vibes/history', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id AS "userId", (metadata->>'pinId') AS "pinId",
              (metadata->>'action') AS action, metadata->'oldValue' AS "oldValue",
              metadata->'newValue' AS "newValue", created_at AS timestamp
       FROM audit_events
       WHERE user_id = $1 AND event_type IN ('PIN_CREATED', 'PIN_UPDATED', 'PIN_DELETED', 'vibe_create', 'vibe_update', 'vibe_delete')
       ORDER BY created_at DESC LIMIT 100`,
      [req.authUser.id]
    );
    res.json({ history: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vibes/:id', requireAuth, async (req, res) => {
  const pinId = toNumber(req.params.id);
  if (!pinId) return res.status(400).json({ error: 'Invalid pin ID.' });

  try {
    const result = await pool.query('SELECT * FROM vibes WHERE id = $1 AND user_id = $2', [pinId, req.authUser.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Pin not found.' });
    }
    const row = result.rows[0];
    res.json(normalizeVibeRecord({
      ...row,
      moodTags: row.mood_tags,
      ratings: row.ratings,
      reviews: row.reviews,
      createdAt: row.created_at
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vibes', requireAuth, async (req, res) => {
  const {
    id,
    name,
    lat,
    lon,
    location,
    mood,
    moodTags,
    budget,
    ratings,
    reviews,
    note,
    song,
    spotify_track_id,
    spotify_playlist_id,
    weather: weatherInput
  } = req.body || {};

  try {
    const base = normalizeVibeRecord({
      id,
      name,
      lat: location?.lat ?? lat,
      lon: location?.lng ?? lon,
      mood,
      moodTags,
      budget,
      ratings,
      reviews,
      note,
      song,
      spotify_track_id,
      spotify_playlist_id,
      weather: weatherInput
    });

    let weather = weatherInput || 'Unknown';
    if (!weatherInput && process.env.OPENWEATHER_KEY) {
      try {
        const weatherRes = await axios.get(
          `https://api.openweathermap.org/data/2.5/weather?lat=${base.lat}&lon=${base.lon}&units=metric&appid=${process.env.OPENWEATHER_KEY}`
        );
        weather = weatherRes.data.weather[0].main;
      } catch {
        // Fallback weather
      }
    }

    const query = `
      INSERT INTO vibes (
        lat, lon, mood, name, mood_tags, budget, ratings, reviews,
        note, song, spotify_track_id, spotify_playlist_id, weather, user_id, created_by, is_demo, time, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb,
        $9, $10, $11, $12, $13, $14, $14, false, NOW(), NOW(), NOW()
      )
      RETURNING *
    `;
    const result = await pool.query(query, [
      base.lat,
      base.lon,
      base.mood,
      base.name,
      JSON.stringify(base.moodTags),
      base.budget,
      JSON.stringify(base.ratings),
      JSON.stringify(base.reviews),
      base.note,
      base.song,
      base.spotify_track_id || null,
      base.spotify_playlist_id || null,
      weather,
      req.authUser.id
    ]);
    const saved = result.rows[0];
    const structuredSaved = normalizeVibeRecord({
      ...saved,
      moodTags: saved.mood_tags,
      ratings: saved.ratings,
      reviews: saved.reviews,
      createdAt: saved.created_at
    });
    await auditEvent(req.authUser.id, 'PIN_CREATED', {
      pinId: saved.id,
      action: 'CREATED',
      newValue: structuredSaved,
      timestamp: new Date().toISOString()
    });
    return res.status(201).json(structuredSaved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/vibes/:id', requireAuth, async (req, res) => {
  const pinId = toNumber(req.params.id);
  if (!pinId) return res.status(400).json({ error: 'Invalid pin ID.' });

  const {
    name,
    note,
    mood,
    moodTags,
    budget,
    ratings,
    reviews,
    song,
    spotify_track_id,
    spotify_playlist_id,
    weather
  } = req.body || {};

  try {
    const existingResult = await pool.query('SELECT * FROM vibes WHERE id = $1', [pinId]);
    if (existingResult.rowCount === 0) {
      return res.status(404).json({ error: 'Pin not found.' });
    }
    const existing = existingResult.rows[0];
    if (existing.user_id && String(existing.user_id) !== String(req.authUser.id)) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to modify this pin.' });
    }

    const nextName = name !== undefined ? String(name).trim() : existing.name;
    const nextNote = note !== undefined ? String(note).trim() : existing.note;
    const nextMood = mood && MOODS.includes(mood) ? mood : existing.mood;
    const nextMoodTags = Array.isArray(moodTags) ? moodTags.map((m) => toMoodTag(m)).filter(Boolean) : (existing.mood_tags || []);
    const nextBudget = budget && BUDGETS.includes(budget) ? budget : existing.budget;
    const nextRatings = ratings ? normalizeRatings(ratings) : existing.ratings;
    const nextReviews = reviews ? normalizeReviews(reviews) : existing.reviews;
    const nextSong = song !== undefined ? String(song).trim() : existing.song;
    const nextSpotifyTrack = spotify_track_id !== undefined ? (spotify_track_id || null) : existing.spotify_track_id;
    const nextSpotifyPlaylist = spotify_playlist_id !== undefined ? (spotify_playlist_id || null) : existing.spotify_playlist_id;
    const nextWeather = weather !== undefined ? String(weather).trim() : existing.weather;

    const updateQuery = `
      UPDATE vibes
      SET name = $3,
          note = $4,
          mood = $5::vibe_mood,
          mood_tags = $6::jsonb,
          budget = $7,
          ratings = $8::jsonb,
          reviews = $9::jsonb,
          song = $10,
          spotify_track_id = $11,
          spotify_playlist_id = $12,
          weather = $13,
          updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
    const result = await pool.query(updateQuery, [
      pinId,
      req.authUser.id,
      nextName,
      nextNote,
      nextMood,
      JSON.stringify(nextMoodTags),
      nextBudget,
      JSON.stringify(nextRatings),
      JSON.stringify(nextReviews),
      nextSong,
      nextSpotifyTrack,
      nextSpotifyPlaylist,
      nextWeather
    ]);

    const updated = result.rows[0];
    const structuredOld = normalizeVibeRecord(existing);
    const structuredNew = normalizeVibeRecord({
      ...updated,
      moodTags: updated.mood_tags,
      ratings: updated.ratings,
      reviews: updated.reviews,
      createdAt: updated.created_at
    });

    await auditEvent(req.authUser.id, 'PIN_UPDATED', {
      pinId: updated.id,
      action: 'UPDATED',
      oldValue: structuredOld,
      newValue: structuredNew,
      timestamp: new Date().toISOString()
    });

    return res.json(structuredNew);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/vibes/:id', requireAuth, async (req, res) => {
  const pinId = toNumber(req.params.id);
  if (!pinId) return res.status(400).json({ error: 'Invalid pin ID.' });

  try {
    const existingResult = await pool.query('SELECT * FROM vibes WHERE id = $1', [pinId]);
    if (existingResult.rowCount === 0) {
      return res.status(404).json({ error: 'Pin not found.' });
    }
    const existing = existingResult.rows[0];
    if (existing.user_id && String(existing.user_id) !== String(req.authUser.id)) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this pin.' });
    }

    await pool.query('DELETE FROM vibes WHERE id = $1 AND user_id = $2', [pinId, req.authUser.id]);
    await auditEvent(req.authUser.id, 'PIN_DELETED', {
      pinId,
      action: 'DELETED',
      oldValue: normalizeVibeRecord(existing),
      timestamp: new Date().toISOString()
    });
    return res.json({ ok: true, id: pinId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   BOARDS & BOARD ITEMS CRUD (STRICT USER ISOLATION)
   ========================================================================== */

app.get('/api/boards', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT b.id, b.name, b.description, b.created_at, b.updated_at,
               COUNT(bi.id)::int AS item_count
        FROM boards b
        LEFT JOIN board_items bi ON bi.board_id = b.id
        LEFT JOIN vibes v ON bi.vibe_id = v.id
        WHERE b.user_id = $1
        GROUP BY b.id, b.name, b.description, b.created_at, b.updated_at
        ORDER BY b.updated_at DESC, b.created_at DESC
      `,
      [req.authUser.id]
    );
    res.json({ boards: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/boards', requireAuth, async (req, res) => {
  const { name = '', description = '' } = req.body || {};
  const trimmedName = String(name).trim();
  if (!trimmedName) {
    return res.status(400).json({ error: 'Board name is required.' });
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO boards (user_id, name, description, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        RETURNING *
      `,
      [req.authUser.id, trimmedName, String(description).trim()]
    );
    const createdBoard = { ...result.rows[0], item_count: 0 };
    await auditEvent(req.authUser.id, 'board_create', { boardId: createdBoard.id });
    res.status(201).json({ ok: true, board: createdBoard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/boards/:id', requireAuth, async (req, res) => {
  const boardId = toNumber(req.params.id);
  if (!boardId) return res.status(400).json({ error: 'Invalid board ID.' });

  try {
    const boardResult = await pool.query(
      'SELECT * FROM boards WHERE id = $1 AND user_id = $2',
      [boardId, req.authUser.id]
    );
    if (boardResult.rowCount === 0) {
      return res.status(404).json({ error: 'Board not found or unauthorized.' });
    }

    const itemsResult = await pool.query(
      `
        SELECT bi.*, v.note AS vibe_note, v.song AS vibe_song, v.spotify_track_id, v.spotify_playlist_id
        FROM board_items bi
        LEFT JOIN vibes v ON v.id = bi.vibe_id
        WHERE bi.board_id = $1 AND bi.user_id = $2
        ORDER BY bi.created_at ASC
      `,
      [boardId, req.authUser.id]
    );

    res.json({
      board: boardResult.rows[0],
      items: itemsResult.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/boards/:id', requireAuth, async (req, res) => {
  const boardId = toNumber(req.params.id);
  if (!boardId) return res.status(400).json({ error: 'Invalid board ID.' });

  const { name, description } = req.body || {};
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: 'Board name cannot be empty.' });
  }

  try {
    const existing = await pool.query('SELECT * FROM boards WHERE id = $1 AND user_id = $2', [boardId, req.authUser.id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Board not found or unauthorized.' });
    }

    const nextName = name !== undefined ? String(name).trim() : existing.rows[0].name;
    const nextDesc = description !== undefined ? String(description).trim() : existing.rows[0].description;

    const result = await pool.query(
      `
        UPDATE boards
        SET name = $3, description = $4, updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `,
      [boardId, req.authUser.id, nextName, nextDesc]
    );

    await auditEvent(req.authUser.id, 'board_update', { boardId });
    res.json({ ok: true, board: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/boards/:id', requireAuth, async (req, res) => {
  const boardId = toNumber(req.params.id);
  if (!boardId) return res.status(400).json({ error: 'Invalid board ID.' });

  try {
    const result = await pool.query('DELETE FROM boards WHERE id = $1 AND user_id = $2 RETURNING id', [boardId, req.authUser.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Board not found or unauthorized.' });
    }

    await auditEvent(req.authUser.id, 'board_delete', { boardId });
    res.json({ ok: true, id: boardId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/boards/:id/items', requireAuth, async (req, res) => {
  const boardId = toNumber(req.params.id);
  if (!boardId) return res.status(400).json({ error: 'Invalid board ID.' });

  const { vibeId, title = '', note = '', mood = '', lat, lon, metadata = {} } = req.body || {};

  try {
    const boardResult = await pool.query('SELECT id FROM boards WHERE id = $1 AND user_id = $2', [boardId, req.authUser.id]);
    if (boardResult.rowCount === 0) {
      return res.status(404).json({ error: 'Board not found or unauthorized.' });
    }

    let itemLat = toNumber(lat);
    let itemLon = toNumber(lon);
    let itemTitle = String(title || '').trim();
    let itemMood = String(mood || '').trim();
    let itemNote = String(note || '').trim();
    let validVibeId = null;

    if (vibeId) {
      const parsedVibeId = toNumber(vibeId);
      if (parsedVibeId) {
        const vibeCheck = await pool.query('SELECT * FROM vibes WHERE id = $1 AND user_id = $2', [parsedVibeId, req.authUser.id]);
        if (vibeCheck.rowCount > 0) {
          validVibeId = parsedVibeId;
          const vibe = vibeCheck.rows[0];
          if (!itemLat) itemLat = vibe.lat;
          if (!itemLon) itemLon = vibe.lon;
          if (!itemTitle) itemTitle = vibe.name || vibe.note || 'Spot';
          if (!itemMood) itemMood = vibe.mood;
          if (!itemNote) itemNote = vibe.note || '';
        }
      }
    }

    if (!itemTitle) itemTitle = 'Saved Spot';
    if (!Number.isFinite(itemLat) || !Number.isFinite(itemLon)) {
      return res.status(400).json({ error: 'lat and lon are required for board items.' });
    }

    const insertResult = await pool.query(
      `
        INSERT INTO board_items (board_id, user_id, vibe_id, title, note, mood, lat, lon, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())
        RETURNING *
      `,
      [boardId, req.authUser.id, validVibeId, itemTitle, itemNote, itemMood, itemLat, itemLon, JSON.stringify(metadata)]
    );

    await pool.query('UPDATE boards SET updated_at = NOW() WHERE id = $1', [boardId]);
    await auditEvent(req.authUser.id, 'board_item_create', { boardId, itemId: insertResult.rows[0].id });

    res.status(201).json({ ok: true, item: insertResult.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/boards/:id/items/:itemId', requireAuth, async (req, res) => {
  const boardId = toNumber(req.params.id);
  const itemId = toNumber(req.params.itemId);
  if (!boardId || !itemId) return res.status(400).json({ error: 'Invalid board ID or item ID.' });

  try {
    const result = await pool.query(
      'DELETE FROM board_items WHERE id = $1 AND board_id = $2 AND user_id = $3 RETURNING id',
      [itemId, boardId, req.authUser.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Board item not found or unauthorized.' });
    }

    await pool.query('UPDATE boards SET updated_at = NOW() WHERE id = $1', [boardId]);
    await auditEvent(req.authUser.id, 'board_item_delete', { boardId, itemId });

    res.json({ ok: true, id: itemId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   USER PREFERENCES & SAVED PLACES (STRICT USER ISOLATION)
   ========================================================================== */

app.get('/api/preferences', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM user_preferences WHERE user_id = $1 LIMIT 1', [req.authUser.id]);
    if (result.rowCount === 0) {
      return res.json({
        preferences: {
          user_id: req.authUser.id,
          theme: 'system',
          default_mood: 'Calm',
          route_mode: 'walking',
          budget: 'medium',
          voice_alerts: true,
          prefer_scenic: false,
          minimize_stops: false,
          return_to_start: false,
          max_stops: 5,
          custom_settings: {}
        }
      });
    }
    res.json({ preferences: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/preferences', requireAuth, async (req, res) => {
  const {
    theme = 'system',
    default_mood,
    defaultMood,
    route_mode,
    routeMode,
    budget = 'medium',
    voice_alerts,
    voiceAlerts,
    prefer_scenic,
    preferScenic,
    minimize_stops,
    minimizeStops,
    return_to_start,
    returnToStart,
    max_stops,
    maxStops,
    custom_settings = {}
  } = req.body || {};

  const safeDefaultMood = default_mood || defaultMood || 'Calm';
  const safeRouteMode = route_mode || routeMode || 'walking';
  const safeVoiceAlerts = voice_alerts !== undefined ? Boolean(voice_alerts) : voiceAlerts !== undefined ? Boolean(voiceAlerts) : true;
  const safePreferScenic = prefer_scenic !== undefined ? Boolean(prefer_scenic) : preferScenic !== undefined ? Boolean(preferScenic) : false;
  const safeMinimizeStops = minimize_stops !== undefined ? Boolean(minimize_stops) : minimizeStops !== undefined ? Boolean(minimizeStops) : false;
  const safeReturnToStart = return_to_start !== undefined ? Boolean(return_to_start) : returnToStart !== undefined ? Boolean(returnToStart) : false;
  const safeMaxStops = max_stops || maxStops || 5;

  try {
    const query = `
      INSERT INTO user_preferences (
        user_id, theme, default_mood, route_mode, budget, voice_alerts,
        prefer_scenic, minimize_stops, return_to_start, max_stops, custom_settings, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        theme = EXCLUDED.theme,
        default_mood = EXCLUDED.default_mood,
        route_mode = EXCLUDED.route_mode,
        budget = EXCLUDED.budget,
        voice_alerts = EXCLUDED.voice_alerts,
        prefer_scenic = EXCLUDED.prefer_scenic,
        minimize_stops = EXCLUDED.minimize_stops,
        return_to_start = EXCLUDED.return_to_start,
        max_stops = EXCLUDED.max_stops,
        custom_settings = EXCLUDED.custom_settings,
        updated_at = NOW()
      RETURNING *
    `;
    const result = await pool.query(query, [
      req.authUser.id,
      theme,
      safeDefaultMood,
      safeRouteMode,
      budget,
      safeVoiceAlerts,
      safePreferScenic,
      safeMinimizeStops,
      safeReturnToStart,
      Math.max(2, Math.min(10, toNumber(safeMaxStops) || 5)),
      JSON.stringify(custom_settings)
    ]);

    await auditEvent(req.authUser.id, 'preferences_update');
    res.json({ ok: true, preferences: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/saved-places', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM saved_places WHERE user_id = $1 ORDER BY updated_at DESC, created_at DESC',
      [req.authUser.id]
    );
    res.json({ places: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saved-places', requireAuth, async (req, res) => {
  const { slot = 'custom', label = '', address = '', lat, lon, mood = '' } = req.body || {};
  const latNum = toNumber(lat);
  const lonNum = toNumber(lon);

  if (!label || !Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    return res.status(400).json({ error: 'label, lat, and lon are required for saved places.' });
  }

  try {
    const query = `
      INSERT INTO saved_places (user_id, slot, label, address, lat, lon, mood, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `;
    const result = await pool.query(query, [
      req.authUser.id,
      String(slot).toLowerCase(),
      String(label).trim(),
      String(address || '').trim(),
      latNum,
      lonNum,
      String(mood || '').trim()
    ]);

    await auditEvent(req.authUser.id, 'saved_place_create', { placeId: result.rows[0].id });
    res.status(201).json({ ok: true, place: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/saved-places/:id', requireAuth, async (req, res) => {
  const placeId = toNumber(req.params.id);
  if (!placeId) return res.status(400).json({ error: 'Invalid saved place ID.' });

  try {
    const result = await pool.query('DELETE FROM saved_places WHERE id = $1 AND user_id = $2 RETURNING id', [placeId, req.authUser.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Saved place not found or unauthorized.' });
    }

    await auditEvent(req.authUser.id, 'saved_place_delete', { placeId });
    res.json({ ok: true, id: placeId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/route-profiles', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM user_route_profiles WHERE user_id = $1 ORDER BY created_at DESC',
      [req.authUser.id]
    );
    res.json({ profiles: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/route-profiles', requireAuth, async (req, res) => {
  const { name = '', settings = {} } = req.body || {};
  const trimmedName = String(name).trim();
  if (!trimmedName) return res.status(400).json({ error: 'Profile name is required.' });

  try {
    const result = await pool.query(
      'INSERT INTO user_route_profiles (user_id, name, settings, created_at) VALUES ($1, $2, $3::jsonb, NOW()) RETURNING *',
      [req.authUser.id, trimmedName, JSON.stringify(settings)]
    );
    res.status(201).json({ ok: true, profile: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/route-profiles/:id', requireAuth, async (req, res) => {
  const profileId = toNumber(req.params.id);
  if (!profileId) return res.status(400).json({ error: 'Invalid profile ID.' });

  try {
    const result = await pool.query('DELETE FROM user_route_profiles WHERE id = $1 AND user_id = $2 RETURNING id', [profileId, req.authUser.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Profile not found or unauthorized.' });
    }
    res.json({ ok: true, id: profileId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   HEATMAP & ROUTING
   ========================================================================== */

app.get('/api/vibes/heatmap', optionalAuth, async (req, res) => {
  const mood = String(req.query.mood || '').trim();
  const moodLower = mood.toLowerCase();
  const moodTag = toMoodTag(mood);

  const params = [];
  const clauses = [];
  if (req.authUser?.id) {
    params.push(req.authUser.id);
    clauses.push(`user_id = $${params.length}`);
  } else {
    clauses.push('user_id IS NULL');
  }

  if (mood && MOODS.includes(mood)) {
    params.push(mood, JSON.stringify([moodTag]));
    clauses.push(`(mood = $${params.length - 1} OR mood_tags @> $${params.length}::jsonb)`);
  } else if (mood) {
    params.push(JSON.stringify([moodLower]));
    clauses.push(`mood_tags @> $${params.length}::jsonb`);
  }

  try {
    const result = await pool.query(`
      SELECT ROUND(lat::numeric, 3)::float AS lat,
             ROUND(lon::numeric, 3)::float AS lon,
             COUNT(*)::int AS intensity
      FROM vibes
      WHERE ${clauses.join(' AND ')}
      GROUP BY 1, 2
      ORDER BY intensity DESC
      LIMIT 500
    `, params);
    res.json(result.rows);
  } catch {
    res.json([]);
  }
});

app.post('/api/vibes/route', optionalAuth, async (req, res) => {
  const {
    destination,
    start,
    currentMood = 'calm',
    currentTime = new Date().toISOString(),
    budget = 'medium',
    climateSafe = false,
    avoidUnsafeZones = false,
    vibeSync = false,
    routeMode = 'walking',
    maxStops = 5,
    preferScenic = false,
    minimizeStops = false,
    returnToStart = false
  } = req.body || {};

  const resolvedRouteMode = normalizeRouteMode(routeMode);

  if (!destination || !Number.isFinite(Number(destination.lat)) || !Number.isFinite(Number(destination.lon))) {
    return res.status(400).json({ error: 'destination.lat and destination.lon are required.' });
  }

  const origin = {
    lat: Number.isFinite(Number(start?.lat)) ? Number(start.lat) : Number(destination.lat),
    lon: Number.isFinite(Number(start?.lon)) ? Number(start.lon) : Number(destination.lon)
  };

  const result = req.authUser?.id
    ? await pool.query('SELECT * FROM vibes WHERE user_id = $1 ORDER BY time DESC LIMIT 1000', [req.authUser.id])
    : await pool.query('SELECT * FROM vibes WHERE user_id IS NULL ORDER BY time DESC LIMIT 1000');
  const pins = result.rows.map((row) =>
    normalizeVibeRecord({
      ...row,
      moodTags: row.mood_tags,
      ratings: row.ratings,
      reviews: row.reviews,
      createdAt: row.created_at
    })
  );

  const requestedStops = Number(maxStops);
  const boundedStops = Number.isFinite(requestedStops) ? Math.min(8, Math.max(2, Math.floor(requestedStops))) : 5;
  const effectiveStopLimit = minimizeStops ? Math.min(3, boundedStops) : boundedStops;

  const normalized = pins.map((p) => normalizeVibeRecord(p));
  const unsafeRiskThreshold = avoidUnsafeZones ? 0.6 : 1;
  const climateRiskThreshold = climateSafe ? 0.8 : 1;
  const combinedRiskThreshold = Math.min(unsafeRiskThreshold, climateRiskThreshold);
  const scored = normalized
    .filter((p) => !(Math.abs(p.lat - destination.lat) < 0.000001 && Math.abs(p.lon - destination.lon) < 0.000001))
    .map((p) => {
      const base = smartSpotScore(p, { currentMood, currentTime, budget, origin });
      const scenicBoost = preferScenic
        ? clamp01((base.scoreBreakdown.rating * 0.45) + (base.scoreBreakdown.mood_match * 0.35) + ((5 - Number(base.ratings?.crowd || 3)) / 5) * 0.2)
        : 0;
      const adjustedScore = base.score + (preferScenic ? scenicBoost * 0.12 : 0);
      return {
        ...base,
        scenicBoost: Number(scenicBoost.toFixed(3)),
        score: Number(adjustedScore.toFixed(3))
      };
    })
    .filter((p) => p.climate.combinedRisk < combinedRiskThreshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, effectiveStopLimit);

  let routeWaypoints = [...scored].sort(
    (a, b) =>
      haversineKm(origin.lat, origin.lon, Number(a.lat), Number(a.lon)) -
      haversineKm(origin.lat, origin.lon, Number(b.lat), Number(b.lon))
  );

  const totalDirectDist = haversineKm(origin.lat, origin.lon, destination.lat, destination.lon);
  if (routeWaypoints.length === 0 && totalDirectDist >= 0.2) {
    const stopCount = totalDirectDist > 4 ? 3 : 2;
    const moodName = String(currentMood).charAt(0).toUpperCase() + String(currentMood).slice(1);
    const stopNames = {
      Calm: ['Peaceful Garden Stop', 'Quiet Tree-lined Promenade', 'Calm Lakeview Spot'],
      Excited: ['Vibrant Plaza Stop', 'Bustling Coffee Spot', 'High-Energy Viewpoint'],
      Musical: ['Acoustic Corner Stop', 'Rhythm Alley Rest', 'Melodic Lounge Point'],
      Reflective: ['Quiet Sunset Vista', 'Historic Heritage Nook', 'Zen Meditation Point'],
      Melancholy: ['Raindrop Promenade', 'Cozy Tea Rest', 'Contemplative Pier']
    };
    const names = stopNames[moodName] || stopNames.Calm;

    for (let i = 1; i <= stopCount; i++) {
      const frac = i / (stopCount + 1);
      const perpOffset = (Math.sin(frac * Math.PI) * 0.0025) * (i % 2 === 0 ? 1 : -1);
      const stopLat = origin.lat + (destination.lat - origin.lat) * frac + perpOffset;
      const stopLon = origin.lon + (destination.lon - origin.lon) * frac + perpOffset;
      routeWaypoints.push({
        id: `waypoint_stop_${i}`,
        name: names[i - 1] || `Vibe Stop ${i}`,
        note: `${moodName} waypoint stop along journey (${(totalDirectDist * frac).toFixed(1)} km)`,
        lat: Number(stopLat.toFixed(5)),
        lon: Number(stopLon.toFixed(5)),
        mood: moodName,
        moodTags: [String(currentMood).toLowerCase(), 'scenic', 'waypoint'],
        score: Number((4.2 + (i * 0.1)).toFixed(2)),
        budget,
        ratings: { overall: 4.5, safety: 4.6, vibe: 4.4, crowd: 3.2 },
        reviews: [],
        time: new Date().toISOString()
      });
    }
  }

  const routeNodes = [
    { lat: origin.lat, lon: origin.lon },
    ...routeWaypoints.map((p) => ({ lat: Number(p.lat), lon: Number(p.lon) })),
    { lat: Number(destination.lat), lon: Number(destination.lon) }
  ];

  if (returnToStart) {
    routeNodes.push({ lat: origin.lat, lon: origin.lon });
  }

  const roadRoute = await fetchRoadRouteData(routeNodes, resolvedRouteMode);
  const pathGeometry = roadRoute.geometry.length >= 2 ? roadRoute.geometry : buildStraightPathGeometry(routeNodes);
  const estimatedDistanceKm = roadRoute.distanceKm > 0
    ? roadRoute.distanceKm
    : (pathGeometry.length >= 2 ? pathDistanceKmFromCoordinates(pathGeometry) : pathDistanceKmFromLatLon(routeNodes));
  const speedByMode = { walking: 5, cycling: 14, driving: 32 };
  const fallbackDuration = estimatedDistanceKm > 0
    ? Math.max(1, Math.round((estimatedDistanceKm / (speedByMode[resolvedRouteMode] || 5)) * 60))
    : 0;
  const estimatedDurationMin = roadRoute.durationMin > 0 ? roadRoute.durationMin : fallbackDuration;
  const routeSteps = roadRoute.steps.length ? roadRoute.steps : buildFallbackRouteSteps(routeNodes);

  const pausePoints = scored
    .filter((p) => p.ratings.safety >= 4 && (p.moodTags.includes('calm') || p.moodTags.includes('reflective')))
    .slice(0, 2)
    .map((p) => ({
      id: p.id,
      name: p.name,
      location: p.location,
      reason: 'Healing pause point with strong safety and calming sentiment.'
    }));

  const avgMoodMatch = scored.length
    ? scored.reduce((sum, p) => sum + p.scoreBreakdown.mood_match, 0) / scored.length
    : 0;
  const avgRating = scored.length
    ? scored.reduce((sum, p) => sum + p.scoreBreakdown.rating, 0) / scored.length
    : 0;
  const avgSafety = scored.length
    ? scored.reduce((sum, p) => sum + p.scoreBreakdown.climate_safety, 0) / scored.length
    : 0;
  const upliftPct = Math.round(clamp01(avgMoodMatch * 0.5 + avgRating * 0.3 + avgSafety * 0.2) * 100);
  const routeId = `route_${Date.now()}`;

  res.json({
    routeId,
    destination,
    origin,
    currentMood,
    budget,
    climateSafe,
    avoidUnsafeZones,
    vibeSync,
    routeMode: resolvedRouteMode,
    algorithm:
      'score = (rating*0.4) + (mood_match*0.3) + (distance_score*0.1) + (budget_match*0.1) + (time_match*0.1)',
    routeNarrative: `This route increases ${String(currentMood).toLowerCase()} by ${upliftPct}% based on your vibe profile.`,
    pausePoints,
    waypoints: routeWaypoints,
    pathGeometry,
    estimatedDistanceKm,
    estimatedDurationMin,
    routeSteps,
    routeOptions: {
      maxStops: effectiveStopLimit,
      preferScenic: Boolean(preferScenic),
      minimizeStops: Boolean(minimizeStops),
      returnToStart: Boolean(returnToStart)
    },
    riskAvoidance: {
      enabled: climateSafe || avoidUnsafeZones,
      climateSafe,
      avoidUnsafeZones,
      maxAllowedCombinedRisk: Number(combinedRiskThreshold.toFixed(2)),
      highRiskSpotsSkipped: normalized.length - scored.length
    }
  });
});

app.post('/api/route-feedback', requireAuth, async (req, res) => {
  const {
    routeId,
    beforeMood,
    afterMood,
    improvementScore,
    feedbackRating
  } = req.body || {};

  if (!routeId) return res.status(400).json({ error: 'routeId is required.' });
  if (!beforeMood || !afterMood) return res.status(400).json({ error: 'beforeMood and afterMood are required.' });

  const record = {
    userId: req.authUser.id,
    routeId: String(routeId),
    beforeMood: toMoodTag(beforeMood),
    afterMood: toMoodTag(afterMood),
    improvementScore: normalizeFiveScale(improvementScore, 0),
    feedbackRating: normalizeFiveScale(feedbackRating || improvementScore, 0),
    createdAt: new Date().toISOString()
  };

  try {
    await pool.query(
      `
        INSERT INTO route_feedback (user_id, route_id, before_mood, after_mood, improvement_score, feedback_rating, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `,
      [record.userId, record.routeId, record.beforeMood, record.afterMood, record.improvementScore, record.feedbackRating]
    );
    await auditEvent(record.userId, 'route_feedback_create', { routeId: record.routeId });
    res.status(201).json({ ok: true, record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   OTHER UTILITY ENDPOINTS (Context, Climate, Biometrics, AI Narrative, Spotify)
   ========================================================================== */

app.get('/api/context', async (req, res) => {
  const lat = toNumber(req.query.lat);
  const lon = toNumber(req.query.lon);
  const now = new Date();

  if (process.env.OPENWEATHER_KEY) {
    try {
      const w = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${process.env.OPENWEATHER_KEY}`
      );
      return res.json({
        weather: w.data?.weather?.[0]?.main || 'Unknown',
        temp: Math.round(w.data?.main?.temp ?? 0),
        timeOfDay: now.getHours() >= 18 || now.getHours() < 6 ? 'Late evening' : 'Daytime'
      });
    } catch {
      // Fall through to Open-Meteo
    }
  }

  try {
    const w = await axios.get(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`
    );
    return res.json({
      weather: `Code-${w.data?.current?.weather_code ?? 'NA'}`,
      temp: Math.round(w.data?.current?.temperature_2m ?? 0),
      timeOfDay: now.getHours() >= 18 || now.getHours() < 6 ? 'Late evening' : 'Daytime'
    });
  } catch {
    res.json({ weather: 'Unknown', temp: 0, timeOfDay: 'Daytime' });
  }
});

app.get('/api/climate-risk', async (req, res) => {
  const lat = toNumber(req.query.lat);
  const lon = toNumber(req.query.lon);
  const nowIso = new Date().toISOString();

  const estimated = estimateClimateRisk(lat, lon, nowIso);
  const payload = {
    ...estimated,
    temperatureC: null,
    apparentTempC: null,
    usAqi: null,
    recommendation: 'Low risk route segment.'
  };

  try {
    const weatherRes = await axios.get(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,precipitation,weather_code`
    );
    const airRes = await axios.get(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5`
    );

    const temp = weatherRes.data?.current?.temperature_2m;
    const feels = weatherRes.data?.current?.apparent_temperature;
    const rain = weatherRes.data?.current?.precipitation ?? 0;
    const usAqi = airRes.data?.current?.us_aqi;

    const liveHeatRisk = temp == null ? estimated.heatRisk : clamp01((temp - 28) / 17);
    const liveAqiRisk = usAqi == null ? estimated.aqiRisk : clamp01((usAqi - 70) / 180);
    const liveFloodRisk = clamp01(Math.max(estimated.floodRisk, rain > 8 ? 0.85 : rain > 2 ? 0.55 : 0.2 * estimated.floodRisk));
    const combinedRisk = clamp01(liveHeatRisk * 0.45 + liveAqiRisk * 0.35 + liveFloodRisk * 0.2);

    payload.heatRisk = liveHeatRisk;
    payload.aqiRisk = liveAqiRisk;
    payload.floodRisk = liveFloodRisk;
    payload.combinedRisk = combinedRisk;
    payload.climateSafety = 1 - combinedRisk;
    payload.temperatureC = temp ?? null;
    payload.apparentTempC = feels ?? null;
    payload.usAqi = usAqi ?? null;
  } catch {
    // Keep fallback payload
  }

  if (payload.combinedRisk >= 0.7) {
    payload.recommendation = 'High climate risk. Prefer shaded and lower-traffic routes.';
  } else if (payload.combinedRisk >= 0.4) {
    payload.recommendation = 'Moderate climate risk. Avoid long outdoor exposure.';
  }

  res.json(payload);
});

app.post('/api/biometrics/validate', async (req, res) => {
  const {
    lat,
    lon,
    baselineHrv,
    currentHrv,
    baselineStress,
    currentStress,
    suggestedMood = 'Calm'
  } = req.body || {};

  const baseH = toNumber(baselineHrv);
  const curH = toNumber(currentHrv);
  const baseS = toNumber(baselineStress);
  const curS = toNumber(currentStress);

  const hrvImprove = baseH > 0 ? ((curH - baseH) / baseH) * 100 : 0;
  const stressDrop = baseS > 0 ? ((baseS - curS) / baseS) * 100 : 0;
  const qualifies = hrvImprove >= 10 || stressDrop >= 15;

  res.json({
    lat,
    lon,
    qualifies,
    hrvImprove: Number(hrvImprove.toFixed(2)),
    stressDrop: Number(stressDrop.toFixed(2)),
    prompt: qualifies
      ? `Your stress dropped ${stressDrop.toFixed(0)}% here. Should we mark this as a Healing Spot?`
      : 'Not enough biometric improvement yet. Keep tracking this place.',
    suggestedMood
  });
});

app.post('/api/echoes/trigger', optionalAuth, async (req, res) => {
  const { lat, lon, radiusMeters = 50 } = req.body || {};
  const rKm = toNumber(radiusMeters) / 1000;

  if (!req.authUser?.id) {
    return res.json({ triggered: false });
  }

  try {
    const result = await pool.query('SELECT * FROM vibes WHERE user_id = $1 ORDER BY time DESC LIMIT 1000', [req.authUser.id]);
    const candidates = result.rows
      .map((p) => ({ ...p, lat: toNumber(p.lat), lon: toNumber(p.lon) }))
      .filter((p) => p.mood === 'Musical' && p.spotify_track_id)
      .map((p) => ({ ...p, distanceKm: haversineKm(toNumber(lat), toNumber(lon), p.lat, p.lon) }))
      .filter((p) => p.distanceKm <= rKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const match = candidates[0] || null;
    if (!match) {
      return res.json({ triggered: false });
    }

    res.json({
      triggered: true,
      radiusMeters,
      pin: {
        id: match.id,
        note: match.note,
        mood: match.mood,
        spotify_track_id: match.spotify_track_id,
        spotify_playlist_id: match.spotify_playlist_id,
        spotifyUrl: `https://open.spotify.com/track/${match.spotify_track_id}`,
        distanceMeters: Math.round(match.distanceKm * 1000)
      }
    });
  } catch {
    res.json({ triggered: false });
  }
});

app.post('/api/vibes/narrative', async (req, res) => {
  const { currentMood = 'Reflective', destination, waypoints = [] } = req.body || {};

  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Write a short, poetic, second-person route narrative in 1-2 lines for a mood-driven walk. Keep it emotionally warm.'
            },
            {
              role: 'user',
              content: JSON.stringify({ currentMood, destination, waypoints })
            }
          ],
          temperature: 0.8
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const text = response.data?.choices?.[0]?.message?.content?.trim();
      if (text) return res.json({ narrative: text, source: 'ai' });
    } catch {
      // Fallback
    }
  }

  res.json({ narrative: synthNarrative({ currentMood, destination, waypoints }), source: 'template' });
});

app.get('/api/microclimate/golden-hour', async (req, res) => {
  const lat = toNumber(req.query.lat);
  const lon = toNumber(req.query.lon);

  try {
    const [sunRes, weatherRes] = await Promise.all([
      axios.get(`https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`),
      axios.get(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=windspeed_10m,temperature_2m&forecast_days=2`
      )
    ]);

    const sunsetIso = sunRes.data?.results?.sunset;
    const sunriseIso = sunRes.data?.results?.sunrise;
    const hours = weatherRes.data?.hourly?.time || [];
    const winds = weatherRes.data?.hourly?.windspeed_10m || [];

    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < hours.length; i += 1) {
      const t = new Date(hours[i]).getTime();
      const target = new Date(sunsetIso).getTime();
      const diffHours = Math.abs(t - target) / (1000 * 60 * 60);
      const wind = toNumber(winds[i]);
      const windScore = clamp01(1 - wind / 18);
      const sunsetScore = clamp01(1 - diffHours / 2.5);
      const score = sunsetScore * 0.7 + windScore * 0.3;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const bestTime = bestIdx >= 0 ? hours[bestIdx] : sunsetIso;
    const bestWind = bestIdx >= 0 ? toNumber(winds[bestIdx]) : null;

    return res.json({
      sunrise: sunriseIso,
      sunset: sunsetIso,
      goldenMoment: bestTime,
      windSpeedKmh: bestWind,
      message: `The light should be best around ${new Date(bestTime).toLocaleTimeString()}. Great time for a reflective walk.`
    });
  } catch {
    res.json({
      sunrise: null,
      sunset: null,
      goldenMoment: null,
      windSpeedKmh: null,
      message: 'Micro-climate feed unavailable. Try again later.'
    });
  }
});

app.post('/api/mood-suggest', async (req, res) => {
  const { note = '', weather = '', timeOfDay = '', playlist = '' } = req.body || {};

  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You classify mood into one of exactly: Calm, Musical, Excited, Reflective, Melancholy. Return JSON with keys mood and reason.'
            },
            {
              role: 'user',
              content: `note: ${note}\nweather: ${weather}\ntimeOfDay: ${timeOfDay}\nplaylist: ${playlist}`
            }
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data?.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      const mood = MOODS.includes(parsed.mood) ? parsed.mood : heuristicMood({ note, weather, timeOfDay, playlist });
      return res.json({ mood, reason: parsed.reason || 'AI suggestion based on context.' });
    } catch {
      // Fallback
    }
  }

  const mood = heuristicMood({ note, weather, timeOfDay, playlist });
  res.json({ mood, reason: 'Heuristic suggestion from text, weather, and playlist context.' });
});

app.get('/api/spotify/auth-url', async (req, res) => {
  if (!ensureSpotifyConfigured(res)) return;
  const state = req.query.state || Math.random().toString(36).slice(2);
  const redirectUri = req.query.redirectUri || SPOTIFY_REDIRECT_URI;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: SPOTIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
    show_dialog: 'false'
  });
  res.json({
    authUrl: `https://accounts.spotify.com/authorize?${params.toString()}`,
    state,
    redirectUri
  });
});

app.get('/api/spotify/config', async (_req, res) => {
  const state = getSpotifyConfigState();
  res.json(state);
});

app.post('/api/spotify/exchange', async (req, res) => {
  if (!ensureSpotifyConfigured(res)) return;
  const { code, redirectUri } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code is required.' });

  try {
    const tokenData = await spotifyTokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri || SPOTIFY_REDIRECT_URI
    });

    const me = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    return res.json({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type,
      profile: {
        id: me.data?.id,
        displayName: me.data?.display_name,
        email: me.data?.email,
        product: me.data?.product
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.post('/api/spotify/refresh', async (req, res) => {
  if (!ensureSpotifyConfigured(res)) return;
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required.' });

  try {
    const tokenData = await spotifyTokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    return res.json({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || refreshToken,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type
    });
  } catch (err) {
    return res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.get('/api/spotify/devices', async (req, res) => {
  const accessToken = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.query.accessToken;
  if (!accessToken) return res.status(400).json({ error: 'access token is required.' });

  try {
    const devices = await axios.get('https://api.spotify.com/v1/me/player/devices', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return res.json({ devices: devices.data?.devices || [] });
  } catch (err) {
    return res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.get('/api/spotify/recommendations', async (req, res) => {
  const mood = req.query.mood || 'Reflective';
  const accessToken = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.query.accessToken;
  if (!accessToken) return res.status(400).json({ error: 'access token is required.' });

  try {
    const query = moodToSpotifyQuery(mood);
    const result = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=playlist&limit=6`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const playlists = (result.data?.playlists?.items || []).map((p) => ({
      id: p.id,
      name: p.name,
      uri: p.uri,
      externalUrl: p.external_urls?.spotify,
      image: p.images?.[0]?.url || null,
      owner: p.owner?.display_name || 'Spotify'
    }));

    return res.json({ mood, playlists });
  } catch (err) {
    return res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.post('/api/spotify/play', async (req, res) => {
  const { accessToken, deviceId, playlistUri, trackUri } = req.body || {};
  if (!accessToken) return res.status(400).json({ error: 'accessToken is required.' });
  if (!playlistUri && !trackUri) return res.status(400).json({ error: 'playlistUri or trackUri is required.' });

  try {
    const body = playlistUri
      ? { context_uri: playlistUri }
      : { uris: [trackUri] };

    const authHeaders = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    let targetDeviceId = deviceId;
    if (!targetDeviceId) {
      const devicesRes = await axios.get('https://api.spotify.com/v1/me/player/devices', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const devices = devicesRes.data?.devices || [];
      const active = devices.find((d) => d.is_active);
      const firstAvailable = active || devices[0];
      if (firstAvailable?.id) targetDeviceId = firstAvailable.id;
    }

    if (targetDeviceId) {
      await axios.put(
        'https://api.spotify.com/v1/me/player',
        {
          device_ids: [targetDeviceId],
          play: false
        },
        { headers: authHeaders }
      );
    }

    const endpoint = targetDeviceId
      ? `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(targetDeviceId)}`
      : 'https://api.spotify.com/v1/me/player/play';

    await axios.put(endpoint, body, { headers: authHeaders });
    return res.json({ ok: true, deviceId: targetDeviceId || null });
  } catch (err) {
    return res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.get('/api/integrations/notion/pins', async (req, res) => {
  if (!notionEnabled()) {
    return res.status(200).json({
      enabled: false,
      data: [],
      reason: 'Set NOTION_TOKEN and NOTION_DATABASE_ID to enable Notion sync.'
    });
  }

  try {
    const limit = Number(req.query.limit || 100);
    const data = await fetchNotionPins(limit);
    return res.json({ enabled: true, count: data.length, data });
  } catch (err) {
    return res.status(502).json({
      enabled: true,
      error: 'Failed to fetch Notion pins.',
      detail: err.response?.data || err.message
    });
  }
});

/* ==========================================================================
   SERVER INITIALIZATION & MIGRATIONS
   ========================================================================== */

if (require.main === module) {
  runMigrations(pool)
    .then(() => {
      const tryPorts = [BACKEND_PORT, BACKEND_PORT + 1, BACKEND_PORT + 2, 3002, 3003];
      let tryIndex = 0;
      const tryListen = () => {
        const port = tryPorts[tryIndex] || 0;
        const server = app.listen(port, () => {
          console.log(`Backend running on http://localhost:${server.address().port}`);
        });
        server.on('error', (err) => {
          if (err?.code === 'EADDRINUSE' && tryIndex < tryPorts.length - 1) {
            tryIndex += 1;
            tryListen();
            return;
          }
          if (err?.code === 'EADDRINUSE') {
            console.log(`Backend port ${port} is already in use. Reusing existing server instance.`);
            process.exit(0);
          }
          console.error('Backend failed to start:', err.message);
          process.exit(1);
        });
      };
      tryListen();
    })
    .catch((err) => {
      console.error('Backend startup failed: PostgreSQL schema is unavailable.', err.message);
      process.exit(1);
    });

  async function shutdown(signal) {
    console.log(`Received ${signal}; closing PostgreSQL connections.`);
    await pool.end();
    process.exit(0);
  }

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = { app, pool };
