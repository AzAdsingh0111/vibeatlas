const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const useDatabase = Boolean(process.env.DATABASE_URL);
const pool = useDatabase ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
const localVibes = [];
const localRouteFeedback = [];
const localUsers = [];
const LOCAL_STORE_FILE = path.join(__dirname, 'local-store.json');
const MOODS = ['Calm', 'Musical', 'Excited', 'Reflective', 'Melancholy'];
const BUDGETS = ['low', 'medium', 'luxury'];
const REVIEW_TIMES = ['morning', 'afternoon', 'evening', 'night'];
const USER_ROLES = ['Explorer', 'Power Explorer', 'Admin'];
const DEMO_SEED_SPOTS = [
  {
    id: 'pin_101',
    name: 'Lake View Spot',
    location: { lat: 12.9719, lng: 77.5937 },
    moodTags: ['calm', 'reflective', 'solo'],
    budget: 'low',
    ratings: { overall: 4.6, safety: 4.3, vibe: 4.8, crowd: 3.5 },
    reviews: [
      { user: 'Neil', mood: 'calm', rating: 5, text: 'Perfect for evening peace', time: 'evening' },
      { user: 'Asha', mood: 'reflective', rating: 4.5, text: 'Quiet and restorative', time: 'morning' }
    ],
    note: 'Golden light and gentle breeze near the water.',
    song: 'Evening Ambient Set'
  },
  {
    id: 'pin_102',
    name: 'Hidden Garden Bench',
    location: { lat: 12.9622, lng: 77.5992 },
    moodTags: ['romantic', 'calm'],
    budget: 'medium',
    ratings: { overall: 4.4, safety: 4.1, vibe: 4.7, crowd: 3.2 },
    reviews: [
      { user: 'Riya', mood: 'romantic', rating: 4.5, text: 'Great date spot at sunset', time: 'evening' }
    ],
    note: 'Tree cover, privacy, and soft city sounds.',
    song: 'Soft Acoustic Trails'
  },
  {
    id: 'pin_103',
    name: 'Sunrise Jog Loop',
    location: { lat: 12.9842, lng: 77.6056 },
    moodTags: ['energetic'],
    budget: 'low',
    ratings: { overall: 4.2, safety: 4.0, vibe: 4.1, crowd: 3.9 },
    reviews: [
      { user: 'Karan', mood: 'energetic', rating: 4.3, text: 'Best before 7 AM', time: 'morning' }
    ],
    note: 'Long loop with open air and active crowd.',
    song: 'Morning Energy Boost'
  },
  {
    id: 'pin_104',
    name: 'Rainy Window Cafe',
    location: { lat: 12.9344, lng: 77.6118 },
    moodTags: ['sad', 'reflective'],
    budget: 'medium',
    ratings: { overall: 4.3, safety: 4.4, vibe: 4.6, crowd: 2.9 },
    reviews: [
      { user: 'Mina', mood: 'sad', rating: 4.4, text: 'Calm corner and warm tea', time: 'afternoon' }
    ],
    note: 'Good place to reset when overwhelmed.',
    song: 'Rain Day LoFi'
  },
  {
    id: 'pin_105',
    name: 'Skyline Terrace',
    location: { lat: 12.9265, lng: 77.6402 },
    moodTags: ['romantic', 'energetic'],
    budget: 'luxury',
    ratings: { overall: 4.7, safety: 4.5, vibe: 4.9, crowd: 3.8 },
    reviews: [
      { user: 'Vik', mood: 'romantic', rating: 4.8, text: 'Amazing night vibe and lights', time: 'night' }
    ],
    note: 'Premium rooftop with city panorama.',
    song: 'Night Skyline Sessions'
  },
  {
    id: 'pin_106',
    name: 'Community Art Street',
    location: { lat: 12.9489, lng: 77.5735 },
    moodTags: ['energetic', 'solo'],
    budget: 'low',
    ratings: { overall: 4.1, safety: 3.8, vibe: 4.4, crowd: 4.2 },
    reviews: [
      { user: 'Dev', mood: 'energetic', rating: 4.1, text: 'Colorful and lively in evenings', time: 'evening' }
    ],
    note: 'Murals and open spaces for creative breaks.',
    song: 'Street Art Beats'
  },
  {
    id: 'pin_107',
    name: 'Temple Steps Viewpoint',
    location: { lat: 12.9441, lng: 77.5663 },
    moodTags: ['reflective', 'calm'],
    budget: 'low',
    ratings: { overall: 4.5, safety: 4.6, vibe: 4.7, crowd: 3.0 },
    reviews: [
      { user: 'Ishita', mood: 'reflective', rating: 4.6, text: 'Feels peaceful at dawn', time: 'morning' }
    ],
    note: 'Stillness and elevated view over old streets.',
    song: 'Dawn Reflection'
  },
  {
    id: 'pin_108',
    name: 'River Bridge Walk',
    location: { lat: 12.9994, lng: 77.6583 },
    moodTags: ['calm', 'solo'],
    budget: 'medium',
    ratings: { overall: 4.4, safety: 4.2, vibe: 4.5, crowd: 3.6 },
    reviews: [
      { user: 'Rohit', mood: 'calm', rating: 4.3, text: 'Good breeze after work', time: 'evening' }
    ],
    note: 'Great for decompression walks after busy days.',
    song: 'Flow State Calm'
  }
];

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
const JWT_SECRET = process.env.JWT_SECRET || 'dev_super_secret_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'streaming'
].join(' ');

function loadLocalStore() {
  if (useDatabase) return;
  try {
    if (!fs.existsSync(LOCAL_STORE_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(LOCAL_STORE_FILE, 'utf8'));
    if (Array.isArray(parsed?.vibes)) localVibes.push(...parsed.vibes);
    if (Array.isArray(parsed?.routeFeedback)) localRouteFeedback.push(...parsed.routeFeedback);
    if (Array.isArray(parsed?.users)) localUsers.push(...parsed.users);
  } catch {
    // Continue with empty local store if file is unavailable or corrupted.
  }
}

function persistLocalStore() {
  if (useDatabase) return;
  try {
    fs.writeFileSync(
      LOCAL_STORE_FILE,
      JSON.stringify(
        {
          vibes: localVibes,
          routeFeedback: localRouteFeedback,
          users: localUsers,
          updatedAt: new Date().toISOString()
        },
        null,
        2
      ),
      'utf8'
    );
  } catch {
    // Non-blocking local persistence.
  }
}

loadLocalStore();

if (!useDatabase) {
  console.log('Backend running in local persistent mode (file storage).');
}

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
    name: user.name || '',
    role: safeRole,
    createdAt: user.createdAt || user.created_at || null
  };
}

function normalizeRole(role = 'Explorer') {
  const value = String(role || '').trim();
  return USER_ROLES.includes(value) ? value : 'Explorer';
}

function issueToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      role: user.role || 'Explorer'
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function extractToken(req) {
  const raw = req.headers.authorization || '';
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  if (pool) {
    try {
      const result = await pool.query(
        'SELECT id, email, name, role, password_hash, created_at FROM users WHERE email = $1 LIMIT 1',
        [normalized]
      );
      if (result.rows[0]) return result.rows[0];
    } catch {
      // fallback to in-memory
    }
  }

  return localUsers.find((u) => normalizeEmail(u.email) === normalized) || null;
}

async function findUserById(id) {
  const asNumber = toNumber(id);
  if (!asNumber) return null;

  if (pool) {
    try {
      const result = await pool.query(
        'SELECT id, email, name, role, password_hash, created_at FROM users WHERE id = $1 LIMIT 1',
        [asNumber]
      );
      if (result.rows[0]) return result.rows[0];
    } catch {
      // fallback to in-memory
    }
  }

  return localUsers.find((u) => toNumber(u.id) === asNumber) || null;
}

async function getUserCount() {
  if (pool) {
    try {
      const result = await pool.query('SELECT COUNT(*)::int AS count FROM users');
      return toNumber(result.rows?.[0]?.count);
    } catch {
      // fallback
    }
  }
  return localUsers.length;
}

async function createUser({ email, password, name = '', role = 'Explorer' }) {
  const normalized = normalizeEmail(email);
  const passwordHash = await bcrypt.hash(String(password || ''), 10);
  const safeRole = normalizeRole(role);

  if (pool) {
    try {
      const result = await pool.query(
        `
          INSERT INTO users (email, password_hash, name, role, created_at)
          VALUES ($1, $2, $3, $4, NOW())
          RETURNING id, email, name, role, password_hash, created_at
        `,
        [normalized, passwordHash, name, safeRole]
      );
      return result.rows[0];
    } catch {
      // fallback to in-memory
    }
  }

  const user = {
    id: localUsers.length ? Math.max(...localUsers.map((u) => toNumber(u.id))) + 1 : 1,
    email: normalized,
    password_hash: passwordHash,
    name,
    role: safeRole,
    createdAt: new Date().toISOString()
  };
  localUsers.push(user);
  persistLocalStore();
  return user;
}

async function updateUserProfile(userId, { name, role }) {
  const safeName = String(name || '').trim();
  const safeRole = normalizeRole(role);

  if (pool) {
    try {
      const result = await pool.query(
        `
          UPDATE users
          SET name = $2, role = $3
          WHERE id = $1
          RETURNING id, email, name, role, password_hash, created_at
        `,
        [toNumber(userId), safeName, safeRole]
      );
      return result.rows[0] || null;
    } catch {
      // fallback to in-memory
    }
  }

  const idx = localUsers.findIndex((u) => toNumber(u.id) === toNumber(userId));
  if (idx < 0) return null;
  localUsers[idx] = {
    ...localUsers[idx],
    name: safeName,
    role: safeRole
  };
  persistLocalStore();
  return localUsers[idx];
}

async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication token required.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Invalid authentication token.' });
    req.authUser = sanitizeUser(user);
    req.authTokenPayload = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

function requireRoles(allowedRoles = []) {
  const normalized = Array.isArray(allowedRoles) ? allowedRoles.map((r) => normalizeRole(r)) : [];
  return async (req, res, next) => {
    if (!req.authUser) return res.status(401).json({ error: 'Authentication required.' });
    const role = normalizeRole(req.authUser.role);
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

  const createdAt = raw.createdAt || raw.time || new Date().toISOString();
  const primaryMood = toPrimaryMood(moodTags);
  const trendingScore = clamp01((reviews.length / 10) * 0.45 + (ratings.overall / 5) * 0.55);

  return {
    id: raw.id || `pin_${Date.now()}`,
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
    spotify_track_id: raw.spotify_track_id || null,
    spotify_playlist_id: raw.spotify_playlist_id || null,
    weather: raw.weather || 'Unknown',
    time: raw.time || createdAt,
    createdAt,
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

function buildDemoSeedVibes() {
  const now = Date.now();
  return DEMO_SEED_SPOTS.map((spot, idx) =>
    normalizeVibeRecord({
      ...spot,
      createdAt: new Date(now - idx * 1000 * 60 * 45).toISOString(),
      time: new Date(now - idx * 1000 * 60 * 45).toISOString(),
      weather: idx % 3 === 0 ? 'Clear' : idx % 3 === 1 ? 'Cloudy' : 'Rain'
    })
  );
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

function scoreVibe(pin, destination, currentMood, currentTime) {
  const dist = haversineKm(pin.lat, pin.lon, destination.lat, destination.lon);
  const distanceScore = 1 / (1 + dist);
  const moodScore = pin.mood === currentMood ? 1 : 0;
  const timeScore = timeRelevance(pin.time, currentTime);

  return {
    ...pin,
    scoreBreakdown: {
      mood_match: moodScore,
      distance: distanceScore,
      time_relevance: timeScore
    },
    score: moodScore * 0.5 + distanceScore * 0.3 + timeScore * 0.2
  };
}

function scoreVibeClimateSafe(pin, destination, currentMood, currentTime) {
  const dist = haversineKm(pin.lat, pin.lon, destination.lat, destination.lon);
  const distanceScore = 1 / (1 + dist);
  const moodScore = pin.mood === currentMood ? 1 : 0;
  const timeScore = timeRelevance(pin.time, currentTime);
  const climate = estimateClimateRisk(pin.lat, pin.lon, currentTime);

  return {
    ...pin,
    scoreBreakdown: {
      mood_match: moodScore,
      distance: distanceScore,
      time_relevance: timeScore,
      climate_safety: climate.climateSafety,
      heat_risk: climate.heatRisk,
      aqi_risk: climate.aqiRisk,
      flood_risk: climate.floodRisk
    },
    score: moodScore * 0.35 + distanceScore * 0.25 + timeScore * 0.15 + climate.climateSafety * 0.25
  };
}

function scenicAffinity(pin) {
  const text = `${pin.note || ''} ${pin.song || ''}`.toLowerCase();
  let score = 0;
  if (/park|garden|lake|river|water|bridge|sunset|quiet|green|tree/.test(text)) score += 0.7;
  if (/traffic|crowd|noisy|horn|smoke/.test(text)) score -= 0.4;
  return clamp01((score + 0.5) / 1.2);
}

function vibeSyncScore(pin, destination, currentMood, allPins, currentTime) {
  const dist = haversineKm(pin.lat, pin.lon, destination.lat, destination.lon);
  const distanceScore = 1 / (1 + dist);
  const moodScore = pin.mood === currentMood ? 1 : 0;
  const timeScore = timeRelevance(pin.time, currentTime);

  const scenicDeviationScore = scenicAffinity(pin);
  const nearbyMoodBoost = clamp01(
    allPins
      .filter((p) => p.id !== pin.id && p.mood === currentMood)
      .map((p) => 1 / (1 + haversineKm(pin.lat, pin.lon, p.lat, p.lon)))
      .reduce((a, b) => a + b, 0)
  );

  return {
    ...pin,
    scoreBreakdown: {
      mood_match: moodScore,
      distance: distanceScore,
      time_relevance: timeScore,
      scenic_deviation: scenicDeviationScore,
      nearby_mood_boost: nearbyMoodBoost
    },
    score:
      moodScore * 0.3 +
      distanceScore * 0.2 +
      timeScore * 0.1 +
      scenicDeviationScore * 0.25 +
      nearbyMoodBoost * 0.15
  };
}

function synthNarrative({ currentMood, destination, waypoints }) {
  const anchor = destination?.note || destination?.mood || 'your next feeling';
  const echo = waypoints?.[0]?.note || waypoints?.[0]?.mood || 'an old memory';
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

async function ensureSchema() {
  if (!pool) return;
  await pool.query('CREATE EXTENSION IF NOT EXISTS postgis;');
  await pool.query("DO $$ BEGIN CREATE TYPE vibe_mood AS ENUM ('Calm', 'Musical', 'Excited', 'Reflective', 'Melancholy'); EXCEPTION WHEN duplicate_object THEN null; END $$;");
  await pool.query(`
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
      geom GEOGRAPHY(POINT, 4326)
    );
  `);

  await pool.query(`
    ALTER TABLE vibes
      ADD COLUMN IF NOT EXISTS name TEXT,
      ADD COLUMN IF NOT EXISTS mood_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS budget TEXT NOT NULL DEFAULT 'medium',
      ADD COLUMN IF NOT EXISTS ratings JSONB NOT NULL DEFAULT '{"overall":4,"safety":4,"vibe":4,"crowd":4}'::jsonb,
      ADD COLUMN IF NOT EXISTS reviews JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS route_feedback (
      id BIGSERIAL PRIMARY KEY,
      route_id TEXT NOT NULL,
      before_mood TEXT NOT NULL,
      after_mood TEXT NOT NULL,
      improvement_score DOUBLE PRECISION NOT NULL,
      feedback_rating DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'Explorer',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

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
    const token = issueToken(safeUser);
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
    const token = issueToken(safeUser);
    return res.json({ token, user: safeUser });
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
    return res.json({ user: sanitizeUser(updated) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  res.json({ ok: true });
});

app.get('/api/auth/users', requireAuth, requireRoles(['Admin']), async (req, res) => {
  if (pool) {
    try {
      const result = await pool.query('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC LIMIT 200');
      return res.json({ users: result.rows.map((u) => sanitizeUser(u)) });
    } catch {
      // fallback
    }
  }

  return res.json({ users: localUsers.map((u) => sanitizeUser(u)) });
});

async function seedDemoData({ reset = false } = {}) {
  const demo = buildDemoSeedVibes();

  if (pool) {
    try {
      if (reset) {
        await pool.query('DELETE FROM vibes');
      }

      const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM vibes');
      const count = toNumber(countResult.rows?.[0]?.count);
      if (count > 0 && !reset) {
        return { mode: 'database', inserted: 0, skipped: true, total: count };
      }

      for (const vibe of demo) {
        await pool.query(
          `
            INSERT INTO vibes (
              lat, lon, mood, name, mood_tags, budget, ratings, reviews,
              note, song, spotify_track_id, spotify_playlist_id, weather, time, created_at, geom
            ) VALUES (
              $1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb,
              $9, $10, $11, $12, $13, $14, $15, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
            )
          `,
          [
            vibe.lat,
            vibe.lon,
            vibe.mood,
            vibe.name,
            JSON.stringify(vibe.moodTags),
            vibe.budget,
            JSON.stringify(vibe.ratings),
            JSON.stringify(vibe.reviews),
            vibe.note,
            vibe.song,
            vibe.spotify_track_id,
            vibe.spotify_playlist_id,
            vibe.weather,
            vibe.time,
            vibe.createdAt
          ]
        );
      }

      return { mode: 'database', inserted: demo.length, skipped: false, total: demo.length };
    } catch {
      // Fall through to in-memory seeding.
    }
  }

  if (reset) {
    localVibes.splice(0, localVibes.length);
    persistLocalStore();
  }

  if (localVibes.length > 0 && !reset) {
    return { mode: 'memory', inserted: 0, skipped: true, total: localVibes.length };
  }

  localVibes.unshift(...demo);
  persistLocalStore();
  return { mode: 'memory', inserted: demo.length, skipped: false, total: localVibes.length };
}

app.post('/api/dev/seed', requireAuth, requireRoles(['Admin']), async (req, res) => {
  const reset = Boolean(req.body?.reset);
  try {
    const result = await seedDemoData({ reset });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

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
      // Fall through to Open-Meteo below.
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
    // Keep hotspot-based fallback payload.
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

app.post('/api/echoes/trigger', async (req, res) => {
  const { lat, lon, radiusMeters = 50 } = req.body || {};
  const rKm = toNumber(radiusMeters) / 1000;

  let pins = localVibes;
  if (pool) {
    try {
      const result = await pool.query('SELECT * FROM vibes ORDER BY time DESC LIMIT 3000');
      pins = result.rows;
    } catch {
      // fallback to local
    }
  }

  const candidates = pins
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
      // fallback below
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
      // Fallback to heuristic model.
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

app.get('/api/spotify/config', async (req, res) => {
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

    await axios.put(endpoint, body, {
      headers: authHeaders
    });

    return res.json({ ok: true, deviceId: targetDeviceId || null });
  } catch (err) {
    return res.status(500).json({ error: err.response?.data || err.message });
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
        // Keep unknown weather when weather API is not configured or unavailable.
      }
    }

    if (pool) {
      try {
        const query = `
          INSERT INTO vibes (
            lat, lon, mood, name, mood_tags, budget, ratings, reviews,
            note, song, spotify_track_id, spotify_playlist_id, weather, time, created_at, geom
          )
          VALUES (
            $1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb,
            $9, $10, $11, $12, $13, NOW(), NOW(), ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
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
          weather
        ]);
        const saved = result.rows[0];
        return res.status(201).json(
          normalizeVibeRecord({
            ...saved,
            moodTags: saved.mood_tags,
            ratings: saved.ratings,
            reviews: saved.reviews,
            createdAt: saved.created_at
          })
        );
      } catch {
        // Fall back to in-memory mode if database connection fails at runtime.
      }
    }

    const vibe = normalizeVibeRecord({ ...base, weather, time: new Date().toISOString(), id: base.id || `pin_${Date.now()}` });
    localVibes.unshift(vibe);
    persistLocalStore();
    res.status(201).json(vibe);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

app.get('/api/vibes', async (req, res) => {
  if (pool) {
    try {
      const result = await pool.query('SELECT * FROM vibes ORDER BY time DESC');
      const mapped = result.rows.map((row) =>
        normalizeVibeRecord({
          ...row,
          moodTags: row.mood_tags,
          ratings: row.ratings,
          reviews: row.reviews,
          createdAt: row.created_at
        })
      );
      return res.json(mapped);
    } catch {
      // Fall through to local storage when DB is unavailable.
    }
  }

  res.json(localVibes.map((v) => normalizeVibeRecord(v)));
});

app.get('/api/vibes/heatmap', async (req, res) => {
  const mood = String(req.query.mood || '').trim();
  const moodLower = mood.toLowerCase();
  const moodTag = toMoodTag(mood);

  if (pool) {
    try {
      const params = [];
      let where = '';
      if (mood && MOODS.includes(mood)) {
        params.push(mood, JSON.stringify([moodTag]));
        where = 'WHERE mood = $1 OR mood_tags @> $2::jsonb';
      } else if (mood) {
        params.push(JSON.stringify([moodLower]));
        where = 'WHERE mood_tags @> $1::jsonb';
      }
      const q = `
        SELECT ROUND(lat::numeric, 3)::float AS lat,
               ROUND(lon::numeric, 3)::float AS lon,
               COUNT(*)::int AS intensity
        FROM vibes
        ${where}
        GROUP BY 1, 2
        ORDER BY intensity DESC
        LIMIT 500
      `;
      const result = await pool.query(q, params);
      return res.json(result.rows);
    } catch {
      // fall through
    }
  }

  const grouped = {};
  localVibes.forEach((v) => {
    const normalized = normalizeVibeRecord(v);
    if (mood) {
      const moodTitle = mood.charAt(0).toUpperCase() + mood.slice(1).toLowerCase();
      const matches = normalized.mood === moodTitle || normalized.moodTags.includes(moodLower);
      if (!matches) return;
    }
    const key = `${v.lat.toFixed(3)}:${v.lon.toFixed(3)}`;
    if (!grouped[key]) {
      grouped[key] = { lat: Number(v.lat.toFixed(3)), lon: Number(v.lon.toFixed(3)), intensity: 0 };
    }
    grouped[key].intensity += 1;
  });

  res.json(Object.values(grouped).sort((a, b) => b.intensity - a.intensity).slice(0, 500));
});

app.post('/api/vibes/route', async (req, res) => {
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

  let pins = localVibes;
  if (pool) {
    try {
      const result = await pool.query('SELECT * FROM vibes ORDER BY time DESC LIMIT 1000');
      pins = result.rows.map((row) =>
        normalizeVibeRecord({
          ...row,
          moodTags: row.mood_tags,
          ratings: row.ratings,
          reviews: row.reviews,
          createdAt: row.created_at
        })
      );
    } catch {
      // Keep local fallback.
    }
  }

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

  const routeWaypoints = [...scored].sort(
    (a, b) =>
      haversineKm(origin.lat, origin.lon, Number(a.lat), Number(a.lon)) -
      haversineKm(origin.lat, origin.lon, Number(b.lat), Number(b.lon))
  );

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
    routeNarrative: `This route increases ${String(currentMood).toLowerCase()} by ${upliftPct}% based on user data.`,
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
    routeId: String(routeId),
    beforeMood: toMoodTag(beforeMood),
    afterMood: toMoodTag(afterMood),
    improvementScore: normalizeFiveScale(improvementScore, 0),
    feedbackRating: normalizeFiveScale(feedbackRating || improvementScore, 0),
    createdAt: new Date().toISOString()
  };

  if (pool) {
    try {
      await pool.query(
        `
          INSERT INTO route_feedback (route_id, before_mood, after_mood, improvement_score, feedback_rating, created_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
        `,
        [record.routeId, record.beforeMood, record.afterMood, record.improvementScore, record.feedbackRating]
      );
    } catch {
      localRouteFeedback.unshift(record);
      persistLocalStore();
    }
  } else {
    localRouteFeedback.unshift(record);
    persistLocalStore();
  }

  res.status(201).json({ ok: true, record });
});

ensureSchema()
  .then(() => seedDemoData())
  .then((seedResult) => {
    if (seedResult?.inserted) {
      console.log(`Seeded ${seedResult.inserted} demo vibe pins (${seedResult.mode}).`);
    }
  })
  .catch(() => {
    console.log('Database schema initialization skipped. Running with fallback mode.');
  })
  .finally(() => {
    const server = app.listen(BACKEND_PORT, () => {
      console.log(`Backend running on http://localhost:${BACKEND_PORT}`);
    });

    server.on('error', (err) => {
      if (err?.code === 'EADDRINUSE') {
        console.log(`Backend port ${BACKEND_PORT} is already in use. Reusing existing server instance.`);
        process.exit(0);
      }
      console.error('Backend failed to start:', err.message);
      process.exit(1);
    });
  });
