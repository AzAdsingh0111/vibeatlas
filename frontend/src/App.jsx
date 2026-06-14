import React, { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, Popup, Source } from 'react-map-gl';
import maplibregl from 'maplibre-gl';
import { AnimatePresence, motion } from 'framer-motion';
import '@maptiler/sdk/dist/maptiler-sdk.css';
import './App.css';
import Login from './Login';
import GuideBot from './GuideBot';

const MAPTILER_KEY = process.env.REACT_APP_MAPTILER_KEY || '';
const MAP_STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
  : '';
const OSM_FALLBACK_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors'
    }
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
};
const MAP_STYLE = MAP_STYLE_URL || OSM_FALLBACK_STYLE;
const TERRAIN_SOURCE_ID = 'vibeatlas-terrain-dem';
const BUILDINGS_LAYER_ID = 'vibeatlas-3d-buildings';
const TERRAIN_DEM_TILES = MAPTILER_KEY
  ? [`https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`]
  : [];

const MOODS = ['Calm', 'Musical', 'Excited', 'Reflective', 'Melancholy'];
const SMART_MOOD_TAGS = ['calm', 'romantic', 'energetic', 'sad', 'reflective', 'solo'];
const BUDGETS = ['free', 'low', 'medium', 'luxury'];
const NARRATOR_TONES = ['Auto', 'Technical', 'Emotional', 'Judge Pitch'];
const AUDIENCE_MODES = ['General', 'Judges', 'Developers', 'Wellness'];
const FEATURE_SEQUENCE = [
  { id: 'route', label: 'Route Setup' },
  { id: 'climate', label: 'Climate Check' },
  { id: 'story', label: 'Story Layer' },
  { id: 'biometrics', label: 'Biometric Validation' },
  { id: 'settings', label: 'Settings & Publish' }
];
const MOOD_COLORS = {
  Calm: '#3b82f6',
  Musical: '#a855f7',
  Excited: '#ef4444',
  Reflective: '#f59e0b',
  Melancholy: '#64748b'
};
const EMOTION_COLORS = {
  calm: '#3b82f6',
  romantic: '#ff5fa2',
  energetic: '#f97316',
  sad: '#8b5cf6',
  reflective: '#f59e0b',
  solo: '#64748b'
};

const STORAGE_KEY = 'personal-cartographer-vibes';
const ONBOARDING_KEY = 'personal-cartographer-onboarding-complete';
const PROFILE_KEY = 'personal-cartographer-profile';
const ROUTE_PROFILES_KEY = 'personal-cartographer-route-profiles';
const RECENT_SEARCHES_KEY = 'personal-cartographer-recent-searches';
const FAVORITE_PLACES_KEY = 'personal-cartographer-favorite-places';
const AUTH_KEY = 'personal-cartographer-auth';
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
const N8N_WEBHOOK_URL = process.env.REACT_APP_N8N_WEBHOOK_URL || '';
const SPOTIFY_REDIRECT_URI = process.env.REACT_APP_SPOTIFY_REDIRECT_URI || window.location.origin;
const SPOTIFY_AUTH_KEY = 'personal-cartographer-spotify-auth';
const SPOTIFY_REDIRECT_RUNTIME_KEY = 'personal-cartographer-spotify-redirect-uri';
const INDIA_DEFAULT_VIEW = { longitude: 78.9629, latitude: 20.5937, zoom: 4.5 };
const APP_NAME = 'VibeAtlas';
const ARRIVAL_THRESHOLD_KM = 0.2;
const ROUTE_MODE_OPTIONS = [
  { id: 'walking', label: 'Walking', caption: 'Pedestrian-safe streets', speedKmh: 5 },
  { id: 'cycling', label: 'Cycling', caption: 'Bike-friendly flow', speedKmh: 14 },
  { id: 'driving', label: 'Driving', caption: 'Fastest city travel', speedKmh: 32 }
];
const ROUTE_PRESETS = [
  {
    id: 'balanced',
    label: 'Balanced',
    routeMode: 'walking',
    preferScenic: true,
    minimizeStops: false,
    returnToStart: false,
    maxStops: 5
  },
  {
    id: 'scenic',
    label: 'Scenic',
    routeMode: 'cycling',
    preferScenic: true,
    minimizeStops: false,
    returnToStart: false,
    maxStops: 6
  },
  {
    id: 'express',
    label: 'Express',
    routeMode: 'driving',
    preferScenic: false,
    minimizeStops: true,
    returnToStart: false,
    maxStops: 3
  },
  {
    id: 'loop',
    label: 'Loop Back',
    routeMode: 'walking',
    preferScenic: true,
    minimizeStops: false,
    returnToStart: true,
    maxStops: 4
  }
];
const MODE_ROUTE_STYLE = {
  walking: { accent: '#22c55e', width: 4, glowWidth: 9, dash: [1.2, 1.2], opacity: 0.94 },
  cycling: { accent: '#0ea5e9', width: 5, glowWidth: 10, dash: [0.7, 1.8], opacity: 0.96 },
  driving: { accent: '#f97316', width: 6, glowWidth: 12, dash: [0.4, 0], opacity: 0.98 }
};
const PLACE_TYPE_COLORS = {
  waterfall: '#3b82f6',
  mountain: '#16a34a',
  beach: '#f97316',
  park: '#84cc16',
  viewpoint: '#6b7280'
};
const SEED_PLACES = [
  {
    id: 'andhra_1',
    name: 'Vanjangi Hills',
    lat: 17.7776,
    lng: 82.4792,
    mood: ['calm', 'dreamy', 'sunrise'],
    budget: 'low',
    type: 'mountain',
    hiddenScore: 5,
    bestTime: '5:00 AM',
    description: 'Cloud view sunrise above mountains, very peaceful',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'bike'
  },
  {
    id: 'andhra_2',
    name: 'Dumuku View Point',
    lat: 17.8822,
    lng: 82.3805,
    mood: ['silent', 'meditation'],
    budget: 'low',
    type: 'viewpoint',
    hiddenScore: 4,
    bestTime: '6:00 AM',
    description: 'Foggy hills and deep silence, ideal for solo time',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'bike'
  },
  {
    id: 'andhra_3',
    name: 'Ananthagiri Waterfalls',
    lat: 18.3316,
    lng: 82.9985,
    mood: ['nature', 'relax'],
    budget: 'low',
    type: 'waterfall',
    hiddenScore: 4,
    bestTime: 'morning',
    description: 'Forest waterfall with calm surroundings',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'bike'
  },
  {
    id: 'andhra_4',
    name: 'Thatiguda Waterfall',
    lat: 18.2553,
    lng: 82.9212,
    mood: ['hidden', 'nature'],
    budget: 'low',
    type: 'waterfall',
    hiddenScore: 5,
    bestTime: 'morning',
    description: 'Less crowded hidden waterfall',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'bike'
  },
  {
    id: 'andhra_5',
    name: 'Mangalagiri Eco Park',
    lat: 16.43,
    lng: 80.558,
    mood: ['calm', 'walk'],
    budget: 'free',
    type: 'park',
    hiddenScore: 3,
    bestTime: 'evening',
    description: 'Peaceful park for relaxation',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'bike'
  },
  {
    id: 'andhra_6',
    name: 'Sanjeeva Nagar Beach Point',
    lat: 17.6868,
    lng: 83.2365,
    mood: ['romantic', 'silent'],
    budget: 'free',
    type: 'beach',
    hiddenScore: 4,
    bestTime: 'sunset',
    description: 'Quiet coastal area with fewer people',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'bike'
  }
];

const HIDDEN_PLACE_SEEDS = [
  {
    id: 'chakrata',
    name: 'Chakrata',
    lat: 30.7044,
    lng: 77.8738,
    mood: ['calm', 'reflective', 'solo'],
    budget: 'low',
    type: 'mountain',
    hiddenScore: 5,
    bestTime: 'October to June',
    description: 'Dense pine forests, waterfalls, and near-zero crowds.',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'road',
    showLabel: true
  },
  {
    id: 'pangot',
    name: 'Pangot',
    lat: 29.4541,
    lng: 79.4728,
    mood: ['reflective', 'calm'],
    budget: 'low',
    type: 'viewpoint',
    hiddenScore: 4,
    bestTime: 'Morning',
    description: 'Quiet forest village near Nainital, excellent for birdwatching.',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'road',
    showLabel: true
  },
  {
    id: 'kanatal',
    name: 'Kanatal',
    lat: 30.3836,
    lng: 78.3245,
    mood: ['calm', 'reflective'],
    budget: 'medium',
    type: 'mountain',
    hiddenScore: 4,
    bestTime: 'Year round',
    description: 'Small mountain village with forest walks and Himalayan views.',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'road',
    showLabel: true
  },
  {
    id: 'lansdowne',
    name: 'Lansdowne',
    lat: 29.8398,
    lng: 78.6856,
    mood: ['calm', 'reflective', 'solo'],
    budget: 'medium',
    type: 'viewpoint',
    hiddenScore: 4,
    bestTime: 'October to April',
    description: 'Quiet cantonment town with pine forests and peaceful roads.',
    crowdLevel: 'low',
    safety: 5,
    wifi: true,
    routeType: 'road',
    showLabel: true
  },
  {
    id: 'kangojodi',
    name: 'Kangojodi',
    lat: 30.4667,
    lng: 77.3000,
    mood: ['solo', 'reflective', 'calm'],
    budget: 'low',
    type: 'park',
    hiddenScore: 5,
    bestTime: 'Night',
    description: 'Hidden forest destination known for stargazing and very few tourists.',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'road',
    showLabel: true
  },
  {
    id: 'tirthan_valley',
    name: 'Tirthan Valley',
    lat: 31.5926,
    lng: 77.3724,
    mood: ['calm', 'reflective', 'nature'],
    budget: 'medium',
    type: 'waterfall',
    hiddenScore: 5,
    bestTime: 'March to June',
    description: 'Crystal-clear river and a quieter alternative to Manali.',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'road',
    showLabel: true
  },
  {
    id: 'jibhi',
    name: 'Jibhi',
    lat: 31.5879,
    lng: 77.3467,
    mood: ['calm', 'solo', 'reflective'],
    budget: 'medium',
    type: 'waterfall',
    hiddenScore: 5,
    bestTime: 'March to June',
    description: 'Wooden cottages, waterfalls, and a peaceful mountain village vibe.',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'road',
    showLabel: true
  },
  {
    id: 'binsar',
    name: 'Binsar',
    lat: 29.6623,
    lng: 79.7600,
    mood: ['calm', 'reflective', 'nature'],
    budget: 'medium',
    type: 'mountain',
    hiddenScore: 5,
    bestTime: 'October to April',
    description: 'Wildlife sanctuary with Himalayan views and a digital detox feel.',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'road'
  },
  {
    id: 'landour',
    name: 'Landour',
    lat: 30.4460,
    lng: 78.0600,
    mood: ['calm', 'reflective'],
    budget: 'medium',
    type: 'viewpoint',
    hiddenScore: 4,
    bestTime: 'Year round',
    description: 'Quiet side of Mussoorie with colonial charm and peaceful walks.',
    crowdLevel: 'low',
    safety: 5,
    wifi: true,
    routeType: 'road',
    showLabel: true
  },
  {
    id: 'mashobra',
    name: 'Mashobra',
    lat: 31.1294,
    lng: 77.1730,
    mood: ['calm', 'solo', 'reflective'],
    budget: 'medium',
    type: 'park',
    hiddenScore: 4,
    bestTime: 'March to June',
    description: 'Less crowded alternative to Shimla with forests and apple orchards.',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'road',
    showLabel: true
  },
  {
    id: 'ziro_valley',
    name: 'Ziro Valley',
    lat: 27.5945,
    lng: 93.8296,
    mood: ['reflective', 'calm', 'nature'],
    budget: 'medium',
    type: 'viewpoint',
    hiddenScore: 5,
    bestTime: 'September to November',
    description: 'One of the most peaceful destinations with tribal culture and green landscapes.',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'road',
    showLabel: true
  },
  {
    id: 'kalap',
    name: 'Kalap',
    lat: 31.0282,
    lng: 78.4921,
    mood: ['solo', 'reflective', 'calm'],
    budget: 'low',
    type: 'mountain',
    hiddenScore: 5,
    bestTime: 'May to October',
    description: 'Remote Himalayan village with almost no urban chaos.',
    crowdLevel: 'low',
    safety: 3,
    wifi: false,
    routeType: 'road'
  },
  {
    id: 'nongjrong',
    name: 'Nongjrong',
    lat: 25.3877,
    lng: 92.3360,
    mood: ['reflective', 'calm', 'nature'],
    budget: 'low',
    type: 'viewpoint',
    hiddenScore: 5,
    bestTime: 'Sunrise',
    description: 'Spectacular sunrise above the clouds and almost untouched by tourism.',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'road',
    showLabel: true
  },
  {
    id: 'chitkul',
    name: 'Chitkul',
    lat: 31.0949,
    lng: 78.4470,
    mood: ['calm', 'reflective', 'solo'],
    budget: 'medium',
    type: 'mountain',
    hiddenScore: 5,
    bestTime: 'May to October',
    description: 'Last village near the Indo-Tibet border with complete peace.',
    crowdLevel: 'low',
    safety: 4,
    wifi: false,
    routeType: 'road',
    showLabel: true
  },
  {
    id: 'sanjay_van',
    name: 'Sanjay Van',
    lat: 28.5112,
    lng: 77.1826,
    mood: ['calm', 'solo'],
    budget: 'free',
    type: 'park',
    hiddenScore: 4,
    bestTime: 'Morning',
    description: 'A quiet green escape inside Delhi.',
    crowdLevel: 'low',
    safety: 3,
    wifi: false,
    routeType: 'walk',
    showLabel: true
  },
  {
    id: 'mehrauli_park',
    name: 'Mehrauli Archaeological Park',
    lat: 28.5245,
    lng: 77.1859,
    mood: ['reflective', 'solo'],
    budget: 'free',
    type: 'viewpoint',
    hiddenScore: 4,
    bestTime: 'Late afternoon',
    description: 'Historic ruins and open space for a quiet walk.',
    crowdLevel: 'low',
    safety: 3,
    wifi: false,
    routeType: 'walk',
    showLabel: true
  },
  {
    id: 'agrasen_baoli',
    name: 'Agrasen Ki Baoli',
    lat: 28.6268,
    lng: 77.2241,
    mood: ['reflective', 'calm'],
    budget: 'free',
    type: 'viewpoint',
    hiddenScore: 4,
    bestTime: 'Morning',
    description: 'Historic stepwell in the middle of the city.',
    crowdLevel: 'medium',
    safety: 3,
    wifi: false,
    routeType: 'walk',
    showLabel: true
  },
  {
    id: 'asola_bhatti',
    name: 'Asola Bhatti Wildlife Sanctuary',
    lat: 28.4689,
    lng: 77.2189,
    mood: ['nature', 'calm', 'solo'],
    budget: 'low',
    type: 'park',
    hiddenScore: 5,
    bestTime: 'Winter morning',
    description: 'Wildlife sanctuary and quiet nature trails near Delhi.',
    crowdLevel: 'low',
    safety: 3,
    wifi: false,
    routeType: 'walk'
  },
  {
    id: 'northern_ridge',
    name: 'Northern Ridge',
    lat: 28.6890,
    lng: 77.2115,
    mood: ['calm', 'solo'],
    budget: 'free',
    type: 'park',
    hiddenScore: 4,
    bestTime: 'Morning',
    description: 'A quieter green pocket in Delhi for walking and reading.',
    crowdLevel: 'low',
    safety: 3,
    wifi: false,
    routeType: 'walk',
    showLabel: true
  }
];

const NORTH_INDIA_FOCUS_IDS = new Set([
  'chakrata',
  'pangot',
  'kanatal',
  'lansdowne',
  'kangojodi',
  'tirthan_valley',
  'jibhi',
  'binsar',
  'landour',
  'mashobra',
  'kalap',
  'chitkul',
  'sanjay_van',
  'mehrauli_park',
  'agrasen_baoli',
  'asola_bhatti',
  'northern_ridge'
]);

function getDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function choosePlaylistForMood(mood, timeOfDay) {
  const map = {
    Calm: 'Ocean Breath Sessions',
    Musical: 'Discovery Grooves',
    Excited: 'City Pulse Booster',
    Reflective: 'Sunset Reflection Mix',
    Melancholy: 'Rain Window Therapy'
  };
  const base = map[mood] || 'Mood Flow Mix';
  if (timeOfDay.toLowerCase().includes('late')) return `${base} Night Edition`;
  return base;
}

async function postAutomationEvent(eventType, payload) {
  if (!N8N_WEBHOOK_URL) return;
  try {
    await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, timestamp: new Date().toISOString(), payload })
    });
  } catch {
    // n8n webhook is optional in local mode.
  }
}

function weatherCodeToLabel(code) {
  if (code === 0) return 'Clear';
  if ([1, 2, 3].includes(code)) return 'Cloudy';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Storm';
  return 'Unknown';
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
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

function bearingBetween([lon1, lat1], [lon2, lat2]) {
  const toRad = (value) => (value * Math.PI) / 180;
  const toDeg = (value) => (value * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
    - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function sampleRouteCoordinates(coordinates = [], maxPoints = 26) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
  if (coordinates.length <= maxPoints) return coordinates;
  const sampled = [];
  const stride = Math.max(1, Math.floor(coordinates.length / maxPoints));
  for (let index = 0; index < coordinates.length; index += stride) {
    sampled.push(coordinates[index]);
  }
  const last = coordinates[coordinates.length - 1];
  const tail = sampled[sampled.length - 1];
  if (!tail || tail[0] !== last[0] || tail[1] !== last[1]) sampled.push(last);
  return sampled;
}

function scoreVibe(pin, destination, currentMood) {
  const moodBoost = pin.mood === currentMood ? 2 : 0;
  const distancePenalty = destination ? haversineKm(pin.lat, pin.lon, destination.lat, destination.lon) / 5 : 0;
  return moodBoost - distancePenalty;
}

function moodToTag(mood) {
  if (Array.isArray(mood)) return moodToTag(mood[0]);
  const key = String(mood || '').toLowerCase();
  if (key === 'calm') return 'calm';
  if (key === 'excited') return 'energetic';
  if (key === 'musical') return 'romantic';
  if (key === 'melancholy') return 'sad';
  if (['dreamy', 'silent', 'meditation', 'nature', 'relax', 'walk', 'hidden', 'sunrise'].includes(key)) return 'reflective';
  return 'reflective';
}

function moodFilterMatchesPin(pin, filterMood) {
  if (!filterMood || filterMood === 'All') return true;
  const moodTag = moodToTag(filterMood);
  const pinTags = Array.isArray(pin?.moodTags) ? pin.moodTags.map((tag) => String(tag).toLowerCase()) : [];
  return pin?.mood === filterMood || pinTags.includes(moodTag);
}

function toFiniteNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return NaN;
}

function normalizePin(raw) {
  const moodFromArray = Array.isArray(raw?.mood) ? raw.mood : [];
  const moodTags = Array.isArray(raw?.moodTags)
    ? raw.moodTags.map((m) => String(m).toLowerCase())
    : moodFromArray.length
    ? moodFromArray.map((m) => moodToTag(m)).filter(Boolean)
    : raw?.mood
    ? [moodToTag(raw.mood)]
    : ['calm'];
  const lat = toFiniteNumber(raw?.location?.lat, raw?.location?.latitude, raw?.lat, raw?.latitude);
  const lon = toFiniteNumber(raw?.location?.lng, raw?.location?.lon, raw?.location?.longitude, raw?.lon, raw?.lng, raw?.longitude);
  const primaryTag = moodTags[0] || 'reflective';
  const mood = raw?.mood && !Array.isArray(raw.mood)
    ? String(raw.mood)
    : primaryTag === 'calm'
    ? 'Calm'
    : primaryTag === 'energetic'
    ? 'Excited'
    : primaryTag === 'romantic'
    ? 'Musical'
    : primaryTag === 'sad'
    ? 'Melancholy'
    : 'Reflective';
  const ratings = {
    overall: Number(raw?.ratings?.overall ?? 4),
    safety: Number(raw?.ratings?.safety ?? raw?.safety ?? 4),
    vibe: Number(raw?.ratings?.vibe ?? 4),
    crowd: Number(raw?.ratings?.crowd ?? 4)
  };

  return {
    ...raw,
    id: raw.id || `pin_${Date.now()}`,
    name: raw.name || raw.note || 'Untitled Spot',
    note: raw.note || raw.description || raw.name || 'No note',
    description: raw.description || raw.note || raw.name || 'No note',
    mood,
    lat,
    lon,
    location: {
      lat,
      lng: lon
    },
    moodTags,
    budget: BUDGETS.includes(String(raw?.budget || '').toLowerCase()) ? String(raw.budget).toLowerCase() : 'medium',
    ratings,
    type: raw?.type ? String(raw.type).toLowerCase() : '',
    hiddenScore: Number(raw?.hiddenScore || 0),
    bestTime: raw?.bestTime || '',
    crowdLevel: String(raw?.crowdLevel || 'medium').toLowerCase(),
    safety: Number(raw?.safety ?? ratings.safety ?? 4),
    wifi: Boolean(raw?.wifi),
    routeType: raw?.routeType || '',
    reviews: Array.isArray(raw?.reviews) ? raw.reviews : [],
    isTrending: Boolean(raw?.isTrending),
    trendingScore: Number(raw?.trendingScore || 0),
    time: raw.time || new Date().toISOString()
  };
}

function pinEmotionColor(pin) {
  if (pin?.type && PLACE_TYPE_COLORS[pin.type]) return PLACE_TYPE_COLORS[pin.type];
  const primary = pin?.moodTags?.[0] || 'reflective';
  return EMOTION_COLORS[primary] || '#f97316';
}

function pinDotSize(pin) {
  const rating = Number(pin?.ratings?.overall || 4);
  return 12 + Math.max(0, Math.min(5, rating)) * 2.4;
}

function stars(value) {
  const v = Math.max(0, Math.min(5, Number(value || 0)));
  return `${'★'.repeat(Math.round(v))}${'☆'.repeat(Math.max(0, 5 - Math.round(v)))}`;
}

function pctFromUnit(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0) * 100)));
}

function resolveNarratorTone({ narratorTone, audienceMode, activePanelTab }) {
  if (narratorTone !== 'Auto') return narratorTone;

  if (audienceMode === 'Developers') return 'Technical';
  if (audienceMode === 'Judges') return 'Judge Pitch';
  if (audienceMode === 'Wellness') return 'Emotional';

  if (activePanelTab === 'climate' || activePanelTab === 'biometrics') return 'Technical';
  if (activePanelTab === 'story') return 'Emotional';
  if (activePanelTab === 'route') return 'Judge Pitch';
  return 'Emotional';
}

function readApiError(data, fallback = 'Request failed') {
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (typeof data.error === 'string') return data.error;
  if (typeof data.error?.message === 'string') return data.error.message;
  if (typeof data.error_description === 'string') return data.error_description;
  return fallback;
}

function buildDemoNarratorScript({
  narratorTone,
  currentMood,
  userBudget,
  destination,
  topRankedSpots,
  routeNarrative,
  climateSafeMode,
  vibeSyncMode
}) {
  if (!destination || !topRankedSpots.length) {
    return 'Seed demo data, choose a destination, and start route generation to get an auto-written 30-second pitch script.';
  }

  const [first, second, third] = topRankedSpots.map((r) => r.spot);
  const featureLine = [
    climateSafeMode ? 'climate-safe routing is enabled' : null,
    vibeSyncMode ? 'vibe-sync personalization is active' : null
  ]
    .filter(Boolean)
    .join(', ');

  if (narratorTone === 'Technical') {
    return [
      `Technical summary: user mood is ${String(currentMood).toLowerCase()} and budget preference is ${userBudget}.`,
      'Route ranking uses weighted scoring: rating 0.4, mood match 0.3, distance 0.1, budget 0.1, and time fit 0.1.',
      `Top nodes are ${first?.name || 'spot one'}${second ? `, ${second.name}` : ''}${third ? `, and ${third.name}` : ''}.`,
      routeNarrative || 'Projected outcome is a measurable emotional uplift on the selected path.',
      featureLine ? `Safety controls active: ${featureLine}.` : 'Safety controls are available and adapt to route conditions.',
      `Target node: ${destination.name || destination.note || 'vibe destination'}.`
    ].join(' ');
  }

  if (narratorTone === 'Emotional') {
    return [
      `You are in a ${String(currentMood).toLowerCase()} state, and this route is tuned to your ${userBudget} comfort level.`,
      `The journey flows through ${first?.name || 'spot one'}${second ? `, then ${second.name}` : ''}${third ? `, and ${third.name}` : ''}, each chosen to support how you want to feel.`,
      routeNarrative || 'Every stop is selected to make the journey softer, safer, and more meaningful.',
      featureLine
        ? `Along the way, ${featureLine}, so the path stays calm and intentional.`
        : 'Along the way, the path adapts to keep your experience balanced.',
      `You finish at ${destination.name || destination.note || 'your destination'} with stronger emotional clarity.`
    ].join(' ');
  }

  return [
    `Judge pitch: VibeAtlas personalizes navigation for a ${String(currentMood).toLowerCase()} user with ${userBudget} budget constraints.`,
    'Our USP is real-time emotional ranking with transparent weighted scoring across rating, mood, distance, budget, and time fit.',
    `Top recommendations are ${first?.name || 'spot one'}${second ? `, ${second.name}` : ''}${third ? `, and ${third.name}` : ''}.`,
    routeNarrative || 'This route is predicted to improve mood while keeping practical constraints in balance.',
    featureLine
      ? `Operationally, ${featureLine}, which improves trust and safety in live use.`
      : 'Operationally, the system keeps adapting as user feedback is collected.',
    `Current destination is ${destination.name || destination.note || 'vibe destination'}.`
  ].join(' ');
}

export default function App() {
  const [showIntro, setShowIntro] = useState(true);
  const [showLoginHome, setShowLoginHome] = useState(true);
  const [pins, setPins] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved).map(normalizePin) : [];
    } catch {
      return [];
    }
  });
  const [tempPin, setTempPin] = useState(null);
  const [selectedPin, setSelectedPin] = useState(null);
  const [activeMoodFilter, setActiveMoodFilter] = useState('All');
  const [activeBudgetFilter, setActiveBudgetFilter] = useState('All');
  const [userBudget, setUserBudget] = useState('medium');
  const [currentMood, setCurrentMood] = useState('Reflective');
  const [predictedMood, setPredictedMood] = useState('Reflective');
  const [travelSpeedKmh, setTravelSpeedKmh] = useState(0);
  const [autoMoodSync, setAutoMoodSync] = useState(true);
  const [currentPlaylist, setCurrentPlaylist] = useState('Lo-fi');
  const [destinationId, setDestinationId] = useState('');
  const [viewState, setViewState] = useState(INDIA_DEFAULT_VIEW);
  const [weather, setWeather] = useState({ label: 'Loading', temp: '--' });
  const [timeOfDay, setTimeOfDay] = useState('Daytime');
  const [suggestedRoute, setSuggestedRoute] = useState([]);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [routeSteps, setRouteSteps] = useState([]);
  const [routeOrigin, setRouteOrigin] = useState(null);
  const [heatmapPoints, setHeatmapPoints] = useState([]);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [routeAlgorithm, setRouteAlgorithm] = useState('');
  const [routeNarrative, setRouteNarrative] = useState('');
  const [routeMode, setRouteMode] = useState('walking');
  const [routePreset, setRoutePreset] = useState('balanced');
  const [routeMaxStops, setRouteMaxStops] = useState(5);
  const [preferScenicRoute, setPreferScenicRoute] = useState(true);
  const [minimizeStopsRoute, setMinimizeStopsRoute] = useState(false);
  const [returnToStartRoute, setReturnToStartRoute] = useState(false);
  const [routeProfileName, setRouteProfileName] = useState('');
  const [routeProfiles, setRouteProfiles] = useState(() => {
    try {
      const saved = localStorage.getItem(ROUTE_PROFILES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }
    return [];
  });
  const [estimatedRouteDistanceKm, setEstimatedRouteDistanceKm] = useState(0);
  const [estimatedRouteDurationMin, setEstimatedRouteDurationMin] = useState(0);
  const [aiActionNotice, setAiActionNotice] = useState('');
  const [smartInsight, setSmartInsight] = useState('');
  const [currentRouteId, setCurrentRouteId] = useState('');
  const [climateSafeMode, setClimateSafeMode] = useState(false);
  const [avoidUnsafeZones, setAvoidUnsafeZones] = useState(false);
  const [vibeSyncMode, setVibeSyncMode] = useState(true);
  const [climateRisk, setClimateRisk] = useState({
    combinedRisk: 0,
    heatRisk: 0,
    aqiRisk: 0,
    floodRisk: 0,
    recommendation: 'Loading climate risk...'
  });
  const [userLocation, setUserLocation] = useState(null);
  const [watchId, setWatchId] = useState(null);
  const [distanceToDestination, setDistanceToDestination] = useState(null);
  const [arrivalMessage, setArrivalMessage] = useState('');
  const [voiceAlertEnabled, setVoiceAlertEnabled] = useState(true);
  const announcedArrivalRef = useRef('');
  const [biometricInput, setBiometricInput] = useState({ baselineHrv: 40, currentHrv: 45, baselineStress: 70, currentStress: 55 });
  const [biometricResult, setBiometricResult] = useState(null);
  const [echoTrigger, setEchoTrigger] = useState(null);
  const [storyModeEnabled, setStoryModeEnabled] = useState(true);
  const [storyNarrative, setStoryNarrative] = useState('');
  const [goldenHourInfo, setGoldenHourInfo] = useState(null);
  const [activePanelTab, setActivePanelTab] = useState('route');
  const [activeMenuSection, setActiveMenuSection] = useState('dashboard');
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [coachStep, setCoachStep] = useState(0);
  const [routeDashPhase, setRouteDashPhase] = useState(0);
  const [settingsNotice, setSettingsNotice] = useState('');
  const [demoSeedStatus, setDemoSeedStatus] = useState('');
  const [manualStartPoint, setManualStartPoint] = useState(null);
  const [navStartQuery, setNavStartQuery] = useState('');
  const [navDestinationQuery, setNavDestinationQuery] = useState('');
  const [navResults, setNavResults] = useState([]);
  const [navLookupTarget, setNavLookupTarget] = useState('start');
  const [navSearching, setNavSearching] = useState(false);
  const [navNotice, setNavNotice] = useState('');
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.slice(0, 8);
      }
    } catch {
      // fallback
    }
    return [];
  });
  const [favoritePlaces, setFavoritePlaces] = useState(() => {
    try {
      const saved = localStorage.getItem(FAVORITE_PLACES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          home: parsed?.home || null,
          work: parsed?.work || null
        };
      }
    } catch {
      // fallback
    }
    return { home: null, work: null };
  });
  const [routeActionMessage, setRouteActionMessage] = useState('');
  const [routeSwapPulse, setRouteSwapPulse] = useState(false);
  const [enable3DView, setEnable3DView] = useState(false);
  const [enableTerrain, setEnableTerrain] = useState(true);
  const [enableBuildings3D, setEnableBuildings3D] = useState(true);
  const [flyThroughActive, setFlyThroughActive] = useState(false);
  const [terrainSupported, setTerrainSupported] = useState(Boolean(MAPTILER_KEY));
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [mapActionMenu, setMapActionMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    lat: 0,
    lon: 0
  });
  const mapRef = useRef(null);
  const northIndiaFocusAppliedRef = useRef(false);
  const lastRouteFocusKeyRef = useRef('');
  const flyThroughTimerRef = useRef(null);
  const [routeFeedbackPrompt, setRouteFeedbackPrompt] = useState({
    open: false,
    routeId: '',
    beforeMood: 'reflective',
    afterMood: 'calm',
    improvementScore: 4
  });
  const [submittedRouteFeedbackIds, setSubmittedRouteFeedbackIds] = useState([]);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [narratorTone, setNarratorTone] = useState('Judge Pitch');
  const [audienceMode, setAudienceMode] = useState('General');
  const [narratorMode, setNarratorMode] = useState(false);
  const [savedPinDebug, setSavedPinDebug] = useState(null);
  const [notionSync, setNotionSync] = useState({
    enabled: false,
    count: 0,
    status: 'idle',
    message: '',
    lastSync: ''
  });
  const [spotifyAuth, setSpotifyAuth] = useState(() => {
    try {
      const saved = localStorage.getItem(SPOTIFY_AUTH_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          accessToken: parsed?.accessToken || '',
          refreshToken: parsed?.refreshToken || '',
          expiresAt: Number(parsed?.expiresAt || 0),
          profile: parsed?.profile || null
        };
      }
    } catch {
      // fall through to defaults
    }
    return { accessToken: '', refreshToken: '', expiresAt: 0, profile: null };
  });
  const [spotifyDevices, setSpotifyDevices] = useState([]);
  const [spotifyDeviceId, setSpotifyDeviceId] = useState('');
  const [spotifyPlaylists, setSpotifyPlaylists] = useState([]);
  const [spotifyStatus, setSpotifyStatus] = useState('Spotify not connected.');
  const [authState, setAuthState] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTH_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          isLoggedIn: Boolean(parsed?.isLoggedIn),
          token: parsed?.token || '',
          name: parsed?.name || '',
          email: parsed?.email || '',
          role: parsed?.role || 'Explorer'
        };
      }
    } catch {
      // fall through to defaults
    }
    return { isLoggedIn: false, token: '', name: '', email: '', role: 'Explorer' };
  });
  const [profileDraft, setProfileDraft] = useState({
    name: '',
    email: '',
    role: 'Explorer'
  });
  const [authNotice, setAuthNotice] = useState('');
  const [vibeProfile, setVibeProfile] = useState(() => {
    const today = getDateKey();
    const defaults = {
      streakDays: 0,
      lastVisitDate: '',
      calmVisits: 0,
      uniquePlaces: 0,
      badges: [],
      unlockedPlaylists: [],
      dailyChallenge: { title: 'Visit 3 calm spots', progress: 0, target: 3, completed: false, dateKey: today }
    };
    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (saved) return { ...defaults, ...JSON.parse(saved) };
    } catch {
      // fall through to defaults
    }
    return defaults;
  });
  const [, setDailyChallenge] = useState(() =>
    vibeProfile?.dailyChallenge || { title: 'Visit 3 calm spots', progress: 0, target: 3, completed: false, dateKey: getDateKey() }
  );
  const travelRef = useRef(null);
  const announcedZoneRef = useRef('');

  const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 900 : false;

  useEffect(() => {
    if (!savedPinDebug) return undefined;
    const timer = setTimeout(() => setSavedPinDebug(null), 9000);
    return () => clearTimeout(timer);
  }, [savedPinDebug]);

  const mergeIncomingPins = (incomingPins = []) => {
    if (!Array.isArray(incomingPins) || !incomingPins.length) return 0;
    const normalized = incomingPins.map((p) => normalizePin(p));
    let added = 0;
    setPins((prev) => {
      const prevIds = new Set(prev.map((x) => String(x.id || `${x.lat}-${x.lon}-${x.time}`)));
      const merged = [...prev];
      normalized.forEach((item) => {
        const id = String(item.id || `${item.lat}-${item.lon}-${item.time}`);
        if (!prevIds.has(id)) {
          merged.push(item);
          prevIds.add(id);
          added += 1;
        }
      });
      return merged;
    });
    return added;
  };

  const syncNotionPins = async (manual = false) => {
    if (manual) {
      setNotionSync((prev) => ({ ...prev, status: 'syncing', message: 'Refreshing Notion pins...' }));
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/integrations/notion/pins?limit=100`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Notion sync failed');

      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const added = mergeIncomingPins(rows);
      const enabled = Boolean(payload?.enabled);
      const message = enabled
        ? `Synced ${rows.length} Notion pins (${added} new).`
        : payload?.reason || 'Notion sync is disabled. Set NOTION_TOKEN and NOTION_DATABASE_ID.';

      setNotionSync({
        enabled,
        count: Number(payload?.count ?? rows.length),
        status: enabled ? 'ok' : 'idle',
        message,
        lastSync: new Date().toISOString()
      });

      if (manual) setRouteActionMessage(message);
    } catch (err) {
      const message = `Notion sync error: ${err.message}`;
      setNotionSync((prev) => ({ ...prev, status: 'error', message, lastSync: new Date().toISOString() }));
      if (manual) setRouteActionMessage(message);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setShowIntro(false), 1500);
    return () => clearTimeout(timer);
  }, [showIntro]);

  useEffect(() => {
    try {
      const onboardingComplete = localStorage.getItem(ONBOARDING_KEY) === 'true';
      setShowCoach(!onboardingComplete);
    } catch {
      setShowCoach(false);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setRouteDashPhase((prev) => (prev + 0.25) % 4);
    }, 180);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!routeSwapPulse) return undefined;
    const timer = setTimeout(() => setRouteSwapPulse(false), 700);
    return () => clearTimeout(timer);
  }, [routeSwapPulse]);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(vibeProfile));
    } catch {
      // no-op
    }
  }, [vibeProfile]);

  useEffect(() => {
    try {
      localStorage.setItem(SPOTIFY_AUTH_KEY, JSON.stringify(spotifyAuth));
    } catch {
      // no-op
    }
  }, [spotifyAuth]);

  useEffect(() => {
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(authState));
    } catch {
      // no-op
    }
  }, [authState]);

  useEffect(() => {
    try {
      localStorage.setItem(ROUTE_PROFILES_KEY, JSON.stringify(routeProfiles));
    } catch {
      // no-op
    }
  }, [routeProfiles]);

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recentSearches));
    } catch {
      // no-op
    }
  }, [recentSearches]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITE_PLACES_KEY, JSON.stringify(favoritePlaces));
    } catch {
      // no-op
    }
  }, [favoritePlaces]);

  useEffect(() => {
    setProfileDraft({
      name: authState.name || '',
      email: authState.email || '',
      role: authState.role || 'Explorer'
    });
  }, [authState.name, authState.email, authState.role]);

  useEffect(() => {
    if (authState.isLoggedIn && !authState.token) {
      setAuthState({ isLoggedIn: false, token: '', name: '', email: '', role: 'Explorer' });
      return;
    }

    const loadAuthUser = async () => {
      if (!authState.token) return;
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${authState.token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Session expired');
        setAuthState((prev) => ({
          ...prev,
          isLoggedIn: true,
          name: data.user?.name || prev.name,
          email: data.user?.email || prev.email,
          role: data.user?.role || prev.role
        }));
      } catch {
        setAuthState({ isLoggedIn: false, token: '', name: '', email: '', role: 'Explorer' });
      }
    };
    loadAuthUser();
  }, [authState.isLoggedIn, authState.token]);

  const authHeaders = useMemo(() => {
    if (!authState.token) return {};
    return { Authorization: `Bearer ${authState.token}` };
  }, [authState.token]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const expectedState = localStorage.getItem('spotify_oauth_state');

    if (!code) return;
    if (expectedState && state !== expectedState) {
      setSpotifyStatus('Spotify connection failed: invalid auth state.');
      return;
    }

    const exchange = async () => {
      try {
        setSpotifyStatus('Connecting Spotify...');
        const runtimeRedirect = localStorage.getItem(SPOTIFY_REDIRECT_RUNTIME_KEY) || SPOTIFY_REDIRECT_URI;
        const res = await fetch(`${BACKEND_URL}/api/spotify/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirectUri: runtimeRedirect })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(readApiError(data, 'Exchange failed'));

        setSpotifyAuth({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000,
          profile: data.profile || null
        });
        setSpotifyStatus(`Connected as ${data.profile?.displayName || 'Spotify user'}.`);

        params.delete('code');
        params.delete('state');
        const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
        window.history.replaceState({}, '', next);
        localStorage.removeItem('spotify_oauth_state');
      } catch (err) {
        setSpotifyStatus(`Spotify connection error: ${err.message}`);
      }
    };

    exchange();
  }, []);

  useEffect(() => {
    if (!spotifyAuth.accessToken || !spotifyAuth.refreshToken) return;
    if (Date.now() < spotifyAuth.expiresAt - 60000) return;

    const refresh = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/spotify/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: spotifyAuth.refreshToken })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(readApiError(data, 'Refresh failed'));
        setSpotifyAuth((prev) => ({
          ...prev,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken || prev.refreshToken,
          expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000
        }));
      } catch {
        setSpotifyStatus('Spotify session expired. Please reconnect.');
      }
    };

    refresh();
  }, [spotifyAuth]);

  useEffect(() => {
    if (!spotifyAuth.accessToken) return;
    const loadDevices = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/spotify/devices`, {
          headers: { Authorization: `Bearer ${spotifyAuth.accessToken}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not fetch devices');
        setSpotifyDevices(data.devices || []);
        const active = (data.devices || []).find((d) => d.is_active) || data.devices?.[0];
        if (active?.id) setSpotifyDeviceId(active.id);
      } catch {
        setSpotifyDevices([]);
      }
    };
    loadDevices();
  }, [spotifyAuth.accessToken]);

  useEffect(() => {
    if (!spotifyAuth.accessToken) return;
    const loadRecommendations = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/spotify/recommendations?mood=${encodeURIComponent(predictedMood)}`, {
          headers: { Authorization: `Bearer ${spotifyAuth.accessToken}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load playlists');
        setSpotifyPlaylists(data.playlists || []);
      } catch {
        setSpotifyPlaylists([]);
      }
    };
    loadRecommendations();
  }, [spotifyAuth.accessToken, predictedMood]);

  useEffect(() => {
    const hour = new Date().getHours();
    const scores = {
      Calm: 0,
      Musical: 0,
      Excited: 0,
      Reflective: 0,
      Melancholy: 0
    };

    if (hour >= 22 || hour <= 4) {
      scores.Reflective += 2;
      scores.Melancholy += 1;
    } else if (hour >= 17 && hour <= 19) {
      scores.Calm += 1.5;
      scores.Reflective += 1;
    } else {
      scores.Excited += 1;
    }

    const weatherLabel = (weather.label || '').toLowerCase();
    if (weatherLabel.includes('rain') || weatherLabel.includes('storm')) {
      scores.Reflective += 1;
      scores.Melancholy += 1;
    }
    if (weatherLabel.includes('clear')) {
      scores.Calm += 1;
      scores.Excited += 0.5;
    }

    if (travelSpeedKmh > 20) {
      scores.Excited += 1.5;
    } else if (travelSpeedKmh > 3) {
      scores.Musical += 1;
    } else {
      scores.Calm += 1;
    }

    const recentPins = pins.slice(0, 20);
    recentPins.forEach((pin) => {
      const pinHour = new Date(pin.time || Date.now()).getHours();
      if (Math.abs(pinHour - hour) <= 2) scores[pin.mood] += 0.7;
      if ((pin.note || '').toLowerCase().includes('lake') && hour >= 17 && hour <= 19) scores.Calm += 0.9;
    });

    const nextMood = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
    setPredictedMood(nextMood);

    const suggestionBase = recentPins.find((pin) => pin.mood === nextMood);
    const suggestionText = suggestionBase
      ? `You often feel ${nextMood.toLowerCase()} near \"${suggestionBase.note || 'this place'}\" around this time. Suggesting a similar route.`
      : `Model suggests a ${nextMood.toLowerCase()} vibe based on time, weather, movement, and your history.`;
    setSmartInsight(suggestionText);

    if (autoMoodSync && nextMood !== currentMood) {
      setCurrentMood(nextMood);
    }
  }, [pins, weather.label, travelSpeedKmh, autoMoodSync, currentMood]);

  useEffect(() => {
    postAutomationEvent('smart_mood_prediction', {
      predictedMood,
      weather: weather.label,
      speedKmh: Number(travelSpeedKmh.toFixed(2)),
      pinsCount: pins.length
    });
  }, [predictedMood, weather.label, travelSpeedKmh, pins.length]);

  useEffect(() => {
    if (!narratorMode || !userLocation || !voiceAlertEnabled || !pins.length || !('speechSynthesis' in window)) return;

    const nearbyCalm = pins.find((pin) => pin.mood === 'Calm' && haversineKm(userLocation.lat, userLocation.lon, Number(pin.lat), Number(pin.lon)) <= 0.2);
    if (!nearbyCalm) return;

    const key = String(nearbyCalm.id || `${nearbyCalm.lat}-${nearbyCalm.lon}-${nearbyCalm.time}`);
    if (announcedZoneRef.current === key) return;

    const utterance = new SpeechSynthesisUtterance('You are entering a peaceful zone. Slow down and breathe.');
    utterance.rate = 0.92;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    announcedZoneRef.current = key;
  }, [narratorMode, userLocation, pins, voiceAlertEnabled]);

  useEffect(() => {
    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [watchId]);

  useEffect(() => {
    setPins((prev) => prev.map((pin) => normalizePin(pin)));
  }, []);

  useEffect(() => {
    setPins((prev) => {
      const existingIds = new Set(prev.map((pin) => String(pin.id || '')));
      const seeded = [...SEED_PLACES, ...HIDDEN_PLACE_SEEDS]
        .map((place) => normalizePin(place))
        .filter((place) => !existingIds.has(String(place.id || '')));
      if (!seeded.length) return prev;
      return [...seeded, ...prev];
    });
  }, []);

  useEffect(() => {
    if (!mapReady || northIndiaFocusAppliedRef.current) return;
    const mapInstance = mapRef.current?.getMap?.();
    if (!mapInstance) return;

    const focusPoints = HIDDEN_PLACE_SEEDS.filter((place) => NORTH_INDIA_FOCUS_IDS.has(place.id))
      .map((place) => [Number(place.lng), Number(place.lat)])
      .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));

    if (!focusPoints.length) return;

    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;

    focusPoints.forEach(([lon, lat]) => {
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    });

    mapInstance.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat]
      ],
      {
        padding: 90,
        duration: 1200,
        maxZoom: 7.1
      }
    );
    northIndiaFocusAppliedRef.current = true;
  }, [mapReady]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  }, [pins]);

  useEffect(() => {
    const loadVibes = async () => {
      try {
        const [vibesRes, notionRes] = await Promise.allSettled([
          fetch(`${BACKEND_URL}/api/vibes`),
          fetch(`${BACKEND_URL}/api/integrations/notion/pins?limit=100`)
        ]);

        const mergedIncoming = [];

        if (vibesRes.status === 'fulfilled' && vibesRes.value.ok) {
          const vibeData = await vibesRes.value.json();
          if (Array.isArray(vibeData)) mergedIncoming.push(...vibeData);
        }

        if (notionRes.status === 'fulfilled' && notionRes.value.ok) {
          const notionPayload = await notionRes.value.json();
          if (Array.isArray(notionPayload?.data)) mergedIncoming.push(...notionPayload.data);
        }

        if (mergedIncoming.length) {
          const normalized = mergedIncoming.map((p) => normalizePin(p));
          setPins((prev) => {
            const prevIds = new Set(prev.map((x) => String(x.id || `${x.lat}-${x.lon}-${x.time}`)));
            const merged = [...prev];
            normalized.forEach((item) => {
              const id = String(item.id || `${item.lat}-${item.lon}-${item.time}`);
              if (!prevIds.has(id)) merged.push(item);
            });
            return merged;
          });
        }
      } catch {
        // Backend is optional for local demo mode.
      }
    };
    loadVibes();
  }, []);

  useEffect(() => {
    const loadHeatmap = async () => {
      try {
        const moodQuery = activeMoodFilter !== 'All' ? `?mood=${encodeURIComponent(activeMoodFilter)}` : '';
        const response = await fetch(`${BACKEND_URL}/api/vibes/heatmap${moodQuery}`);
        if (!response.ok) return;
        const data = await response.json();
        setHeatmapPoints(Array.isArray(data) ? data : []);
      } catch {
        setHeatmapPoints([]);
      }
    };
    loadHeatmap();
  }, [pins.length, activeMoodFilter]);

  useEffect(() => {
    const loadWeather = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/context?lat=${viewState.latitude}&lon=${viewState.longitude}`);
        const data = await res.json();
        const rawWeather = String(data?.weather || 'Unknown');
        const codeMatch = rawWeather.match(/^Code-(\d+)$/i);
        const weatherLabel = codeMatch ? weatherCodeToLabel(Number(codeMatch[1])) : rawWeather;
        setWeather({
          label: weatherLabel || 'Unknown',
          temp: typeof data?.temp === 'number' ? `${Math.round(data.temp)}C` : '--'
        });
        setTimeOfDay(data?.timeOfDay || (new Date().getHours() >= 18 ? 'Late evening' : 'Daytime'));
      } catch {
        setWeather({ label: 'Unavailable', temp: '--' });
        setTimeOfDay(new Date().getHours() >= 18 ? 'Late evening' : 'Daytime');
      }
    };

    const timer = setTimeout(loadWeather, 250);
    return () => clearTimeout(timer);
  }, [viewState.latitude, viewState.longitude]);

  useEffect(() => {
    const loadClimateRisk = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/climate-risk?lat=${viewState.latitude}&lon=${viewState.longitude}`);
        if (!res.ok) return;
        const data = await res.json();
        setClimateRisk({
          combinedRisk: Number(data.combinedRisk || 0),
          heatRisk: Number(data.heatRisk || 0),
          aqiRisk: Number(data.aqiRisk || 0),
          floodRisk: Number(data.floodRisk || 0),
          recommendation: data.recommendation || 'Low climate risk route segment.',
          usAqi: data.usAqi,
          temperatureC: data.temperatureC
        });
      } catch {
        setClimateRisk((prev) => ({ ...prev, recommendation: 'Climate feed unavailable. Using fallback risk model.' }));
      }
    };

    const timer = setTimeout(loadClimateRisk, 350);
    return () => clearTimeout(timer);
  }, [viewState.latitude, viewState.longitude]);

  const openMapActionMenu = (e) => {
    if (e?.originalEvent?.preventDefault) e.originalEvent.preventDefault();
    const lat = Number(e?.lngLat?.lat);
    const lon = Number(e?.lngLat?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const x = Math.max(12, Math.min(window.innerWidth - 252, Number(e?.point?.x || 20)));
    const y = Math.max(12, Math.min(window.innerHeight - 220, Number(e?.point?.y || 20)));
    setMapActionMenu({ open: true, x, y, lat, lon });
  };

  const placePinFromMenu = () => {
    if (!mapActionMenu.open) return;
    setTempPin({
      lat: mapActionMenu.lat,
      lng: mapActionMenu.lon,
      name: '',
      mood: currentMood,
      moodTags: [moodToTag(currentMood)],
      budget: userBudget,
      ratings: { overall: 4.2, safety: 4.0, vibe: 4.4, crowd: 3.6 },
      reviews: [],
      note: '',
      song: currentPlaylist
    });
    setMapActionMenu((prev) => ({ ...prev, open: false }));
  };

  const onMapClick = (e) => {
    const lat = Number(e?.lngLat?.lat);
    const lon = Number(e?.lngLat?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (mapActionMenu.open) setMapActionMenu((prev) => ({ ...prev, open: false }));

    const nearestPin = visiblePins
      .map((pin) => ({ pin, distanceKm: haversineKm(lat, lon, Number(pin.lat), Number(pin.lon)) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)[0];

    if (nearestPin && nearestPin.distanceKm <= 0.35) {
      setSelectedPin(nearestPin.pin);
      setTempPin(null);
      return;
    }

    setTempPin({
      lat,
      lng: lon,
      name: '',
      mood: currentMood,
      moodTags: [moodToTag(currentMood)],
      budget: userBudget,
      ratings: { overall: 4.2, safety: 4.0, vibe: 4.4, crowd: 3.6 },
      reviews: [],
      note: '',
      song: currentPlaylist
    });
  };
  const onMapContextMenu = (e) => openMapActionMenu(e);

  const destination = useMemo(
    () => pins.find((p) => String(p.id || `${p.lat}-${p.lon}-${p.time}`) === destinationId) || null,
    [pins, destinationId]
  );

  const activeRouteModeMeta = useMemo(
    () => ROUTE_MODE_OPTIONS.find((mode) => mode.id === routeMode) || ROUTE_MODE_OPTIONS[0],
    [routeMode]
  );

  const panelBudgetLabel = useMemo(
    () => `${String(userBudget).charAt(0).toUpperCase()}${String(userBudget).slice(1)} Budget`,
    [userBudget]
  );

  const panelRouteDistance = estimatedRouteDistanceKm > 0 ? `${estimatedRouteDistanceKm.toFixed(2)} km` : '-- km';
  const panelRouteDuration = estimatedRouteDurationMin > 0 ? `${estimatedRouteDurationMin} min` : '-- min';
  const routeTotalKm = useMemo(() => {
    if (estimatedRouteDistanceKm > 0) return estimatedRouteDistanceKm;
    if (!routeOrigin || !destination) return 0;
    return haversineKm(Number(routeOrigin.lat), Number(routeOrigin.lon), Number(destination.lat), Number(destination.lon));
  }, [estimatedRouteDistanceKm, routeOrigin, destination]);

  const routeProgressSummary = useMemo(() => {
    const remainingKmRaw = Number(distanceToDestination);
    const remainingKm = Number.isFinite(remainingKmRaw) ? Math.max(remainingKmRaw, 0) : null;
    if (!routeTotalKm || routeTotalKm <= 0) {
      return {
        totalLabel: '-- km',
        coveredLabel: '-- km',
        remainingLabel: remainingKm !== null ? `${remainingKm.toFixed(2)} km` : '-- km',
        coveredKm: 0,
        remainingKm: remainingKm ?? 0,
        progressPct: 0,
        hasProgress: false
      };
    }

    const clampedRemaining = remainingKm === null ? routeTotalKm : Math.min(remainingKm, routeTotalKm);
    const coveredKm = Math.max(routeTotalKm - clampedRemaining, 0);
    const progressPct = Math.min(100, Math.max(0, (coveredKm / routeTotalKm) * 100));

    return {
      totalLabel: `${routeTotalKm.toFixed(2)} km`,
      coveredLabel: `${coveredKm.toFixed(2)} km`,
      remainingLabel: `${clampedRemaining.toFixed(2)} km`,
      coveredKm,
      remainingKm: clampedRemaining,
      progressPct,
      hasProgress: true
    };
  }, [routeTotalKm, distanceToDestination]);

  const applyRoutePreset = (presetId) => {
    const preset = ROUTE_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    setRoutePreset(preset.id);
    setRouteMode(preset.routeMode);
    setPreferScenicRoute(preset.preferScenic);
    setMinimizeStopsRoute(preset.minimizeStops);
    setReturnToStartRoute(preset.returnToStart);
    setRouteMaxStops(preset.maxStops);
    setRouteActionMessage(`${preset.label} preset applied.`);
  };

  const saveCurrentRouteProfile = () => {
    const name = routeProfileName.trim();
    if (!name) {
      setRouteActionMessage('Enter a profile name to save.');
      return;
    }
    const profile = {
      id: `rp_${Date.now()}`,
      name,
      routeMode,
      maxStops: routeMaxStops,
      preferScenic: preferScenicRoute,
      minimizeStops: minimizeStopsRoute,
      returnToStart: returnToStartRoute,
      avoidUnsafeZones,
      climateSafeMode
    };
    setRouteProfiles((prev) => {
      const next = [profile, ...prev.filter((entry) => entry.name.toLowerCase() !== name.toLowerCase())].slice(0, 8);
      return next;
    });
    setRouteActionMessage(`Saved route profile: ${name}`);
  };

  const loadRouteProfile = (profile) => {
    if (!profile) return;
    setRoutePreset('custom');
    setRouteMode(profile.routeMode || 'walking');
    setRouteMaxStops(Number(profile.maxStops || 5));
    setPreferScenicRoute(Boolean(profile.preferScenic));
    setMinimizeStopsRoute(Boolean(profile.minimizeStops));
    setReturnToStartRoute(Boolean(profile.returnToStart));
    setAvoidUnsafeZones(Boolean(profile.avoidUnsafeZones));
    setClimateSafeMode(Boolean(profile.climateSafeMode));
    setRouteProfileName(profile.name || '');
    setRouteActionMessage(`Loaded route profile: ${profile.name || 'custom'}`);
  };

  const removeRouteProfile = (id) => {
    setRouteProfiles((prev) => prev.filter((profile) => profile.id !== id));
  };

  useEffect(() => {
    const loadRoute = async () => {
      if (!destination) {
        setSuggestedRoute([]);
        setRouteGeometry([]);
        setRouteSteps([]);
        setRouteOrigin(null);
        setRouteAlgorithm('');
        setRouteNarrative('');
        setCurrentRouteId('');
        return;
      }

      try {
        const startPoint = manualStartPoint || userLocation || { lat: viewState.latitude, lon: viewState.longitude };
        const response = await fetch(`${BACKEND_URL}/api/vibes/route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination: { lat: Number(destination.lat), lon: Number(destination.lon) },
            start: { lat: Number(startPoint.lat), lon: Number(startPoint.lon) },
            currentMood,
            currentTime: new Date().toISOString(),
            budget: userBudget,
            climateSafe: climateSafeMode,
            avoidUnsafeZones,
            vibeSync: vibeSyncMode,
            routeMode,
            maxStops: routeMaxStops,
            preferScenic: preferScenicRoute,
            minimizeStops: minimizeStopsRoute,
            returnToStart: returnToStartRoute
          })
        });
        if (!response.ok) return;
        const data = await response.json();
        setSuggestedRoute(data.waypoints || []);
        setRouteGeometry(Array.isArray(data.pathGeometry) ? data.pathGeometry : []);
        setRouteSteps(Array.isArray(data.routeSteps) ? data.routeSteps : []);
        setRouteOrigin(data.origin || startPoint);
        setRouteAlgorithm(data.algorithm || '');
        setRouteNarrative(data.routeNarrative || '');
        setCurrentRouteId(data.routeId || '');
        const distanceKm = Number(data.estimatedDistanceKm || 0);
        const speed = Number(activeRouteModeMeta.speedKmh || 1);
        const backendDuration = Number(data.estimatedDurationMin || 0);
        const durationMin = backendDuration > 0 ? backendDuration : (distanceKm > 0 && speed > 0 ? Math.round((distanceKm / speed) * 60) : 0);
        setEstimatedRouteDistanceKm(distanceKm);
        setEstimatedRouteDurationMin(durationMin);
      } catch {
        const fallback = pins
          .filter((p) => p.lat !== destination.lat || p.lon !== destination.lon)
          .map((p) => ({ ...p, score: scoreVibe(p, destination, currentMood) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 4);
        setSuggestedRoute(fallback);
        setRouteGeometry([]);
        setRouteSteps([]);
        setRouteOrigin(startPoint);
        setRouteAlgorithm('Local fallback route scoring');
        setRouteNarrative('');
        setCurrentRouteId('');
        setEstimatedRouteDistanceKm(0);
        setEstimatedRouteDurationMin(0);
      }
    };
    loadRoute();
  }, [destination, currentMood, pins, climateSafeMode, avoidUnsafeZones, vibeSyncMode, routeMode, routeMaxStops, preferScenicRoute, minimizeStopsRoute, returnToStartRoute, userBudget, manualStartPoint, userLocation, activeRouteModeMeta.speedKmh]);

  useEffect(() => {
    const loadGoldenHour = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/microclimate/golden-hour?lat=${viewState.latitude}&lon=${viewState.longitude}`);
        if (!res.ok) return;
        const data = await res.json();
        setGoldenHourInfo(data);
      } catch {
        setGoldenHourInfo(null);
      }
    };
    const timer = setTimeout(loadGoldenHour, 500);
    return () => clearTimeout(timer);
  }, [viewState.latitude, viewState.longitude]);

  useEffect(() => {
    const loadNarrative = async () => {
      if (!storyModeEnabled || !destination) {
        setStoryNarrative('');
        return;
      }
      try {
        const res = await fetch(`${BACKEND_URL}/api/vibes/narrative`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentMood,
            destination,
            waypoints: suggestedRoute
          })
        });
        if (!res.ok) return;
        const data = await res.json();
        setStoryNarrative(data.narrative || '');
      } catch {
        setStoryNarrative('');
      }
    };

    const timer = setTimeout(loadNarrative, 300);
    return () => clearTimeout(timer);
  }, [storyModeEnabled, destination, currentMood, suggestedRoute]);

  useEffect(() => {
    const checkEchoes = async () => {
      if (!userLocation) {
        setEchoTrigger(null);
        return;
      }

      try {
        const res = await fetch(`${BACKEND_URL}/api/echoes/trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: userLocation.lat,
            lon: userLocation.lon,
            radiusMeters: 50
          })
        });
        if (!res.ok) return;
        const data = await res.json();
        setEchoTrigger(data.triggered ? data.pin : null);
      } catch {
        setEchoTrigger(null);
      }
    };

    const timer = setTimeout(checkEchoes, 350);
    return () => clearTimeout(timer);
  }, [userLocation]);

  useEffect(() => {
    if (!destination || !userLocation) {
      setDistanceToDestination(null);
      setArrivalMessage('');
      announcedArrivalRef.current = '';
      return;
    }

    const distance = haversineKm(
      userLocation.lat,
      userLocation.lon,
      Number(destination.lat),
      Number(destination.lon)
    );
    setDistanceToDestination(distance);

    if (distance <= ARRIVAL_THRESHOLD_KM) {
      const destinationKey = String(destination.id || `${destination.lat}-${destination.lon}-${destination.time}`);
      const message = `You have reached ${destination.note || destination.mood + ' destination'}. This is the place.`;
      setArrivalMessage(message);

      if (currentRouteId && !submittedRouteFeedbackIds.includes(currentRouteId)) {
        setRouteFeedbackPrompt({
          open: true,
          routeId: currentRouteId,
          beforeMood: moodToTag(currentMood),
          afterMood: 'calm',
          improvementScore: 4
        });
      }

      if (voiceAlertEnabled && announcedArrivalRef.current !== destinationKey && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance('This is the place. You have arrived at your destination.');
        utterance.rate = 0.95;
        utterance.pitch = 1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        announcedArrivalRef.current = destinationKey;
      }
    } else {
      setArrivalMessage('');
      announcedArrivalRef.current = '';
    }
  }, [destination, userLocation, voiceAlertEnabled, currentRouteId, submittedRouteFeedbackIds, currentMood]);

  const visiblePins = useMemo(() => {
    return pins.filter((p) => {
      const hasCoordinates = Number.isFinite(Number(p?.lat)) && Number.isFinite(Number(p?.lon));
      if (!hasCoordinates) return false;
      const moodMatch = moodFilterMatchesPin(p, activeMoodFilter);
      const budgetMatch = activeBudgetFilter === 'All' ? true : p.budget === activeBudgetFilter;
      return moodMatch && budgetMatch;
    });
  }, [pins, activeMoodFilter, activeBudgetFilter]);

  const dominantMood = useMemo(() => {
    if (!pins.length) return 'None yet';
    const counts = pins.reduce((acc, pin) => {
      acc[pin.mood] = (acc[pin.mood] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }, [pins]);

  const climateRiskLabel = useMemo(() => {
    const score = Number(climateRisk.combinedRisk || 0);
    if (score >= 0.7) return 'High';
    if (score >= 0.4) return 'Moderate';
    return 'Low';
  }, [climateRisk.combinedRisk]);

  const suggestedPlaylist = useMemo(
    () => choosePlaylistForMood(predictedMood || currentMood, timeOfDay),
    [predictedMood, currentMood, timeOfDay]
  );

  const routePalette = useMemo(() => {
    const palettes = {
      Calm: { glow: '#b7ebff', line: '#38bdf8' },
      Musical: { glow: '#e6d5ff', line: '#a855f7' },
      Excited: { glow: '#ffd2c2', line: '#f97316' },
      Reflective: { glow: '#ffe7ba', line: '#f59e0b' },
      Melancholy: { glow: '#dbe4f3', line: '#64748b' }
    };
    const moodPalette = palettes[currentMood] || palettes.Reflective;
    const modePalette = MODE_ROUTE_STYLE[routeMode] || MODE_ROUTE_STYLE.walking;
    return {
      ...moodPalette,
      ...modePalette
    };
  }, [currentMood, routeMode]);

  const routeLegendItems = useMemo(
    () =>
      ROUTE_MODE_OPTIONS.map((mode) => ({
        ...mode,
        ...(MODE_ROUTE_STYLE[mode.id] || MODE_ROUTE_STYLE.walking),
        active: routeMode === mode.id
      })),
    [routeMode]
  );

  const topRankedSpots = useMemo(
    () => suggestedRoute.slice(0, 3).map((spot, index) => ({ rank: index + 1, spot })),
    [suggestedRoute]
  );

  const effectiveNarratorTone = useMemo(
    () => resolveNarratorTone({ narratorTone, audienceMode, activePanelTab }),
    [narratorTone, audienceMode, activePanelTab]
  );

  const demoNarratorScript = useMemo(
    () =>
      buildDemoNarratorScript({
        narratorTone: effectiveNarratorTone,
        currentMood,
        userBudget,
        destination,
        topRankedSpots,
        routeNarrative,
        climateSafeMode,
        vibeSyncMode
      }),
    [effectiveNarratorTone, currentMood, userBudget, destination, topRankedSpots, routeNarrative, climateSafeMode, vibeSyncMode]
  );

  const demoSequenceStatus = useMemo(
    () => ({
      dataReady: pins.length >= 5,
      profileReady: currentMood === 'Calm' && userBudget === 'low',
      destinationReady: Boolean(destinationId),
      routeReady: Boolean(destinationId && (suggestedRoute.length || routeGeometry.length >= 2))
    }),
    [pins.length, currentMood, userBudget, destinationId, suggestedRoute.length, routeGeometry.length]
  );

  const featureSequenceStatus = useMemo(
    () => ({
      route: Boolean(destinationId && (suggestedRoute.length || routeGeometry.length >= 2)),
      climate: Boolean(climateSafeMode),
      story: Boolean(storyModeEnabled && (storyNarrative || routeNarrative)),
      biometrics: Boolean(biometricResult),
      settings: Boolean(authState.isLoggedIn)
    }),
    [destinationId, suggestedRoute.length, routeGeometry.length, climateSafeMode, storyModeEnabled, storyNarrative, routeNarrative, biometricResult, authState.isLoggedIn]
  );

  const featureSequence = useMemo(
    () =>
      FEATURE_SEQUENCE.map((step, index) => ({
        ...step,
        index,
        done: Boolean(featureSequenceStatus[step.id])
      })),
    [featureSequenceStatus]
  );

  const activeFeatureIndex = useMemo(
    () => Math.max(0, featureSequence.findIndex((step) => step.id === activePanelTab)),
    [featureSequence, activePanelTab]
  );

  const updateVibeProgress = (newPin, nextPins) => {
    setVibeProfile((prev) => {
      const today = getDateKey();
      const yesterday = getDateKey(new Date(Date.now() - 86400000));

      let streak = prev.streakDays;
      if (prev.lastVisitDate === today) {
        streak = prev.streakDays;
      } else if (prev.lastVisitDate === yesterday) {
        streak = prev.streakDays + 1;
      } else {
        streak = 1;
      }

      const uniquePlaces = new Set(nextPins.map((p) => `${Number(p.lat).toFixed(3)}-${Number(p.lon).toFixed(3)}`)).size;
      const calmVisits = prev.calmVisits + (newPin.mood === 'Calm' ? 1 : 0);

      const badges = new Set(prev.badges || []);
      const unlockedPlaylists = new Set(prev.unlockedPlaylists || []);
      if (calmVisits >= 3) {
        badges.add('Zen Explorer');
        badges.add('Top Rated Calm Spot');
        unlockedPlaylists.add('Zen Explorer Unlock: Deep Focus Drift');
      }
      if (uniquePlaces >= 5) badges.add('Discovered Places');
      if (streak >= 3) badges.add('Mood Streak');
      if ((newPin.reviews || []).length && Number(newPin.ratings?.overall || 0) >= 4.6) badges.add('Hidden Gem Finder');
      if (newPin.moodTags?.includes('calm') && Number(newPin.ratings?.vibe || 0) >= 4.5) badges.add('Mood Transformer');

      const challengeDate = prev.dailyChallenge?.dateKey || today;
      const shouldResetChallenge = challengeDate !== today;
      const baseChallenge = shouldResetChallenge
        ? { title: 'Visit 3 calm spots', progress: 0, target: 3, completed: false, dateKey: today }
        : (prev.dailyChallenge || { title: 'Visit 3 calm spots', progress: 0, target: 3, completed: false, dateKey: today });
      const nextProgress = newPin.mood === 'Calm' ? Math.min(baseChallenge.target, baseChallenge.progress + 1) : baseChallenge.progress;
      const dailyChallengeNext = {
        ...baseChallenge,
        progress: nextProgress,
        completed: nextProgress >= baseChallenge.target
      };
      setDailyChallenge(dailyChallengeNext);

      return {
        ...prev,
        streakDays: streak,
        lastVisitDate: today,
        calmVisits,
        uniquePlaces,
        badges: Array.from(badges),
        unlockedPlaylists: Array.from(unlockedPlaylists),
        dailyChallenge: dailyChallengeNext
      };
    });
  };

  const handleFeelLost = () => {
    if (!pins.length) {
      setRouteActionMessage('Add at least one vibe pin to generate an emotional GPS route.');
      return;
    }

    const anchor = manualStartPoint || userLocation || { lat: viewState.latitude, lon: viewState.longitude };
    const bestPin = [...pins]
      .map((pin) => {
        const calmBonus = pin.mood === 'Calm' ? 2 : pin.mood === 'Reflective' ? 1 : 0;
        const distancePenalty = haversineKm(anchor.lat, anchor.lon, Number(pin.lat), Number(pin.lon)) / 6;
        const climateBonus = (1 - Number(climateRisk.combinedRisk || 0)) * 1.2;
        return { pin, score: calmBonus + climateBonus - distancePenalty };
      })
      .sort((a, b) => b.score - a.score)[0]?.pin;

    if (!bestPin) return;

    setDestinationId(String(bestPin.id || `${bestPin.lat}-${bestPin.lon}-${bestPin.time}`));
    setClimateSafeMode(true);
    setVibeSyncMode(true);
    setStoryModeEnabled(true);
    setCurrentMood('Calm');
    setCurrentPlaylist('Healing Drift - Emotional GPS');
    setRouteActionMessage('Emotional GPS active: peaceful route, music, and story guidance are now tuned for recovery.');

    if (narratorMode && voiceAlertEnabled && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance('Emotional GPS activated. Taking you toward your most peaceful route.');
      utterance.rate = 0.93;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }

    postAutomationEvent('feel_lost_route', {
      destination: bestPin,
      anchor,
      climateRisk: climateRisk.combinedRisk
    });
  };

  const setMoodManually = (nextMood) => {
    setCurrentMood(nextMood);
    if (autoMoodSync) {
      setAutoMoodSync(false);
      setAiActionNotice('Auto-sync disabled after manual mood change. You can enable it again in Settings.');
    }
  };

  const connectSpotify = async () => {
    try {
      const cfgRes = await fetch(`${BACKEND_URL}/api/spotify/config`);
      const cfgData = await cfgRes.json();
      if (!cfgRes.ok || !cfgData?.configured) {
        const missing = Array.isArray(cfgData?.missing) && cfgData.missing.length
          ? ` Missing: ${cfgData.missing.join(', ')}.`
          : '';
        setSpotifyStatus(`Spotify backend config is incomplete.${missing}`);
        return;
      }

      const redirectUri = cfgData.redirectUri || SPOTIFY_REDIRECT_URI;
      localStorage.setItem(SPOTIFY_REDIRECT_RUNTIME_KEY, redirectUri);
      const state = Math.random().toString(36).slice(2);
      localStorage.setItem('spotify_oauth_state', state);
      const res = await fetch(`${BACKEND_URL}/api/spotify/auth-url?state=${encodeURIComponent(state)}&redirectUri=${encodeURIComponent(redirectUri)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(readApiError(data, 'Could not create auth URL'));
      window.location.href = data.authUrl;
    } catch (err) {
      setSpotifyStatus(`Spotify auth error: ${err.message}`);
    }
  };

  const disconnectSpotify = () => {
    setSpotifyAuth({ accessToken: '', refreshToken: '', expiresAt: 0, profile: null });
    setSpotifyDevices([]);
    setSpotifyDeviceId('');
    setSpotifyPlaylists([]);
    setSpotifyStatus('Spotify disconnected.');
    try {
      localStorage.removeItem(SPOTIFY_AUTH_KEY);
      localStorage.removeItem('spotify_oauth_state');
      localStorage.removeItem(SPOTIFY_REDIRECT_RUNTIME_KEY);
    } catch {
      // no-op
    }
  };

  const playSpotifyPlaylist = async (playlistUri) => {
    if (!spotifyAuth.accessToken) {
      setSpotifyStatus('Connect Spotify first.');
      return;
    }
    if (!playlistUri) {
      setSpotifyStatus('No playlist selected.');
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/spotify/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: spotifyAuth.accessToken,
          deviceId: spotifyDeviceId || undefined,
          playlistUri
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readApiError(data, 'Playback failed'));
      setSpotifyStatus('Spotify playback started for selected mood.');
    } catch (err) {
      setSpotifyStatus(`Playback error: ${err.message}`);
    }
  };

  const saveVibe = async (pinDraft = tempPin) => {
    if (!pinDraft?.mood) return;

    const payload = {
      name: pinDraft.name || pinDraft.note || 'Untitled Spot',
      lat: pinDraft.lat,
      lon: pinDraft.lng,
      mood: pinDraft.mood,
      moodTags: pinDraft.moodTags?.length ? pinDraft.moodTags : [moodToTag(pinDraft.mood)],
      budget: pinDraft.budget || userBudget,
      ratings: pinDraft.ratings || { overall: 4.2, safety: 4.0, vibe: 4.4, crowd: 3.6 },
      reviews: pinDraft.reviews || [],
      note: pinDraft.note || 'No note',
      song: pinDraft.song || 'No song linked',
      spotify_track_id: pinDraft.spotifyTrackId || null,
      spotify_playlist_id: pinDraft.spotifyPlaylistId || null,
      weather: weather.label,
      time: new Date().toISOString()
    };

    let savedPin = normalizePin({ ...payload, id: `${Date.now()}-${Math.random()}` });
    let savedRemotely = false;

    if (authState.token) {
      try {
        const response = await fetch(`${BACKEND_URL}/api/vibes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not save vibe pin');

        savedPin = normalizePin({
          ...data,
          time: data.time || payload.time,
          weather: data.weather || payload.weather,
          spotifyTrackId: data.spotify_track_id || payload.spotify_track_id,
          spotifyPlaylistId: data.spotify_playlist_id || payload.spotify_playlist_id
        });
        savedRemotely = true;
      } catch (err) {
        setAuthNotice(`Cloud save failed, saved locally instead: ${err.message}`);
      }
    } else {
      setAuthNotice('Saved locally in guest mode. Login to sync pins to backend.');
    }

    setPins((prev) => {
      const nextPins = [savedPin, ...prev];
      updateVibeProgress(savedPin, nextPins);
      return nextPins;
    });
    if (savedRemotely) {
      setAuthNotice('Vibe pin saved to your account.');
    }
    setActiveMoodFilter('All');
    setActiveBudgetFilter('All');
    setSelectedPin(savedPin);
    setViewState((prev) => ({
      ...prev,
      latitude: Number(savedPin.lat),
      longitude: Number(savedPin.lon),
      zoom: Math.max(Number(prev?.zoom || 0), 11)
    }));
    setSavedPinDebug({
      id: String(savedPin.id || `${savedPin.lat}-${savedPin.lon}-${savedPin.time}`),
      lat: Number(savedPin.lat),
      lon: Number(savedPin.lon),
      source: savedRemotely ? 'backend' : 'local',
      mood: savedPin.mood,
      time: new Date().toISOString()
    });
    setDestinationId(String(savedPin.id || `${savedPin.lat}-${savedPin.lon}-${savedPin.time}`));
    postAutomationEvent('vibe_pin_saved', {
      mood: savedPin.mood,
      lat: savedPin.lat,
      lon: savedPin.lon,
      weather: savedPin.weather,
      playlist: savedPin.song
    });
    setTempPin(null);
  };

  const suggestMood = async () => {
    if (!tempPin) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/mood-suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: tempPin.note,
          weather: weather.label,
          timeOfDay,
          playlist: tempPin.song || currentPlaylist
        })
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data?.mood && MOODS.includes(data.mood)) {
        setTempPin((prev) => ({ ...prev, mood: data.mood }));
      }
    } catch {
      // Non-blocking feature.
    }
  };

  const runBiometricValidation = async () => {
    if (!userLocation) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/biometrics/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: userLocation.lat,
          lon: userLocation.lon,
          baselineHrv: Number(biometricInput.baselineHrv),
          currentHrv: Number(biometricInput.currentHrv),
          baselineStress: Number(biometricInput.baselineStress),
          currentStress: Number(biometricInput.currentStress),
          suggestedMood: currentMood
        })
      });
      if (!res.ok) return;
      const data = await res.json();
      setBiometricResult(data);

      if (data.qualifies) {
        setTempPin({
          lat: userLocation.lat,
          lng: userLocation.lon,
          mood: 'Calm',
          note: 'Healing Spot (biometric validated)',
          song: currentPlaylist,
          spotifyTrackId: '',
          spotifyPlaylistId: ''
        });
      }
    } catch {
      // no-op
    }
  };

  const submitRouteFeedback = async () => {
    if (!routeFeedbackPrompt.routeId) return;
    if (!authState.token) {
      setAuthNotice('Login required: sign in to submit route feedback.');
      setActiveMenuSection('auth');
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/api/route-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          routeId: routeFeedbackPrompt.routeId,
          beforeMood: routeFeedbackPrompt.beforeMood,
          afterMood: routeFeedbackPrompt.afterMood,
          improvementScore: Number(routeFeedbackPrompt.improvementScore)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit feedback');
      setSubmittedRouteFeedbackIds((prev) => [...new Set([...prev, routeFeedbackPrompt.routeId])]);
      setRouteFeedbackPrompt((prev) => ({ ...prev, open: false }));
    } catch (err) {
      setAuthNotice(`Feedback failed: ${err.message}`);
    }
  };

  const loadDemoData = async (reset = false) => {
    try {
      setDemoSeedStatus('Loading demo data...');
      const seedRes = await fetch(`${BACKEND_URL}/api/dev/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ reset })
      });
      const seedData = await seedRes.json();
      if (!seedRes.ok) throw new Error(seedData.error || 'Seed request failed');

      let normalizedPins = [];
      const vibeRes = await fetch(`${BACKEND_URL}/api/vibes`);
      if (vibeRes.ok) {
        const vibeData = await vibeRes.json();
        if (Array.isArray(vibeData)) {
          normalizedPins = vibeData.map((p) => normalizePin(p));
          setPins(normalizedPins);
        }
      }

      if (seedData.skipped) {
        setDemoSeedStatus('Demo seed skipped because data already exists.');
      } else {
        setDemoSeedStatus(`Demo data loaded: ${seedData.inserted || 0} pins (${seedData.mode || 'local'}).`);
      }
      return normalizedPins;
    } catch (err) {
      setDemoSeedStatus(`Could not load demo data: ${err.message}`);
      if (/auth|token|login|401/i.test(String(err.message || ''))) {
        setAuthNotice('Login required for demo seeding and protected write actions.');
        setActiveMenuSection('auth');
      }
      return [];
    }
  };

  const runGuidedDemoFlow = async () => {
    const loadedPins = await loadDemoData(false);
    const sourcePins = loadedPins.length ? loadedPins : pins;

    setActivePanelTab('route');
    setCurrentMood('Calm');
    setUserBudget('low');
    setActiveBudgetFilter('All');
    setClimateSafeMode(true);
    setVibeSyncMode(true);
    setStoryModeEnabled(true);
    setShowHeatmap(true);
    setNarratorTone('Auto');
    setAudienceMode('Judges');

    if (sourcePins.length) {
      const bestDemoSpot =
        sourcePins.find((p) => p.moodTags?.includes('calm') && Number(p.ratings?.overall || 0) >= 4.4) ||
        sourcePins[0];
      setDestinationId(String(bestDemoSpot.id || `${bestDemoSpot.lat}-${bestDemoSpot.lon}-${bestDemoSpot.time}`));
      setViewState((prev) => ({ ...prev, latitude: Number(bestDemoSpot.lat), longitude: Number(bestDemoSpot.lon), zoom: 12 }));
    }

    setRouteActionMessage('Guided demo ready: seeded data, calm profile, and destination selected. Start route now.');
    setDemoSeedStatus('Guided flow complete. Sequence: seed -> profile -> destination -> route insights.');
  };

  const copyDemoScript = async () => {
    try {
      await navigator.clipboard.writeText(demoNarratorScript);
      setScriptCopied(true);
      setTimeout(() => setScriptCopied(false), 1600);
    } catch {
      setScriptCopied(false);
    }
  };

  const speakDemoScript = () => {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(demoNarratorScript);
    utterance.rate = 0.96;
    utterance.pitch = 1.02;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const performLogin = async (rawEmail, rawPassword) => {
    const email = String(rawEmail || '').trim();
    const password = String(rawPassword || '').trim();
    if (!email || !password) {
      const message = 'Enter email and password to login.';
      setAuthNotice(message);
      return { ok: false, error: message };
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      setAuthState({
        isLoggedIn: true,
        token: data.token,
        name: data.user?.name || email.split('@')[0] || 'Explorer',
        email: data.user?.email || email,
        role: data.user?.role || 'Explorer'
      });
      setLoginForm({ email, password: '' });
      setAuthNotice(`Logged in as ${data.user?.email || email}.`);
      return { ok: true, user: data.user || null };
    } catch (err) {
      const message = `Login failed: ${err.message}`;
      setAuthNotice(message);
      return { ok: false, error: message };
    }
  };

  const handleLogin = async () => {
    await performLogin(loginForm.email, loginForm.password);
  };

  const performRegister = async (rawName, rawEmail, rawPassword) => {
    const name = String(rawName || '').trim();
    const email = String(rawEmail || '').trim();
    const password = String(rawPassword || '').trim();
    if (!email || !password) {
      const message = 'Enter email and password to create account.';
      setAuthNotice(message);
      return { ok: false, error: message };
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Register failed');

      setAuthState({
        isLoggedIn: true,
        token: data.token,
        name: data.user?.name || name || email.split('@')[0] || 'Explorer',
        email: data.user?.email || email,
        role: data.user?.role || 'Explorer'
      });
      setLoginForm({ email, password: '' });
      setRegisterForm({ name: '', email: '', password: '', role: 'Explorer' });
      setAuthNotice('Account created and logged in.');
      return { ok: true, user: data.user || null };
    } catch (err) {
      const message = `Registration failed: ${err.message}`;
      setAuthNotice(message);
      return { ok: false, error: message };
    }
  };

  const isAdminUser = authState.isLoggedIn && authState.role === 'Admin';

  const handleRegister = async () => {
    await performRegister(registerForm.name, registerForm.email, registerForm.password);
  };

  const handleLogout = async () => {
    if (authState.token) {
      try {
        await fetch(`${BACKEND_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authState.token}`
          }
        });
      } catch {
        // no-op
      }
    }

    setAuthState({ isLoggedIn: false, token: '', name: '', email: '', role: 'Explorer' });
    setLoginForm({ email: '', password: '' });
    setRegisterForm({ name: '', email: '', password: '', role: 'Explorer' });
    setAuthNotice('Logged out successfully.');
  };

  const saveProfile = async () => {
    if (!authState.isLoggedIn) {
      setAuthNotice('Please login first to save profile details.');
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authState.token}`
        },
        body: JSON.stringify({ name: profileDraft.name, role: profileDraft.role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Profile update failed');

      setAuthState((prev) => ({
        ...prev,
        name: data.user?.name || prev.name,
        email: data.user?.email || prev.email,
        role: data.user?.role || prev.role
      }));
      setAuthNotice('Profile updated.');
    } catch (err) {
      setAuthNotice(`Profile update failed: ${err.message}`);
    }
  };

  const goToPreviousFeature = () => {
    const prevIndex = Math.max(0, activeFeatureIndex - 1);
    const target = featureSequence[prevIndex];
    if (target) setActivePanelTab(target.id);
  };

  const goToNextFeature = () => {
    const nextIndex = Math.min(featureSequence.length - 1, activeFeatureIndex + 1);
    const target = featureSequence[nextIndex];
    if (target) setActivePanelTab(target.id);
  };

  const startTrackingLocation = () => {
    if (!navigator.geolocation) return;
    if (watchId !== null) return;

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (travelRef.current) {
          const elapsedHours = (now - travelRef.current.ts) / 3600000;
          if (elapsedHours > 0) {
            const dist = haversineKm(
              travelRef.current.lat,
              travelRef.current.lon,
              position.coords.latitude,
              position.coords.longitude
            );
            const nextSpeed = Math.min(120, dist / elapsedHours);
            if (Number.isFinite(nextSpeed)) setTravelSpeedKmh(nextSpeed);
          }
        }

        travelRef.current = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          ts: now
        };

        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
      },
      () => {
        // Keep silent; location access is optional.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000
      }
    );

    setWatchId(id);
  };

  const stopTrackingLocation = () => {
    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
  };

  const heatmapGeoJson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: heatmapPoints.map((p) => ({
        type: 'Feature',
        properties: { intensity: p.intensity || 1 },
        geometry: { type: 'Point', coordinates: [Number(p.lon), Number(p.lat)] }
      }))
    }),
    [heatmapPoints]
  );

  const routeLineGeoJson = useMemo(() => {
    if (!destination) return null;

    const normalizedRouteGeometry = (Array.isArray(routeGeometry) ? routeGeometry : [])
      .map((pair) => [Number(pair?.[0]), Number(pair?.[1])])
      .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));

    if (normalizedRouteGeometry.length >= 2) {
      return {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: normalizedRouteGeometry
            },
            properties: {}
          }
        ]
      };
    }

    const points = [];
    if (routeOrigin) {
      points.push([Number(routeOrigin.lon), Number(routeOrigin.lat)]);
    } else if (manualStartPoint) {
      points.push([Number(manualStartPoint.lon), Number(manualStartPoint.lat)]);
    } else if (userLocation) {
      points.push([Number(userLocation.lon), Number(userLocation.lat)]);
    } else {
      points.push([Number(viewState.longitude), Number(viewState.latitude)]);
    }

    suggestedRoute.forEach((p) => {
      points.push([Number(p.lon), Number(p.lat)]);
    });

    points.push([Number(destination.lon), Number(destination.lat)]);
    const cleanPoints = points.filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
    if (cleanPoints.length < 2) return null;

    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: cleanPoints
          },
          properties: {}
        }
      ]
    };
  }, [destination, suggestedRoute, userLocation, manualStartPoint, routeOrigin, routeGeometry, viewState.longitude, viewState.latitude]);

  useEffect(() => {
    const mapInstance = mapRef.current?.getMap?.();
    const coordinates = routeLineGeoJson?.features?.[0]?.geometry?.coordinates;
    if (!mapInstance || !Array.isArray(coordinates) || coordinates.length < 2) return;

    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    const focusKey = `${coordinates.length}:${first[0]}:${first[1]}:${last[0]}:${last[1]}`;
    if (focusKey === lastRouteFocusKeyRef.current) return;
    lastRouteFocusKeyRef.current = focusKey;

    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    coordinates.forEach(([lon, lat]) => {
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    });

    if (!Number.isFinite(minLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLon) || !Number.isFinite(maxLat)) {
      return;
    }

    if (Math.abs(maxLon - minLon) < 0.0001 && Math.abs(maxLat - minLat) < 0.0001) {
      mapInstance.flyTo({ center: [minLon, minLat], zoom: 14, duration: 700 });
      return;
    }

    mapInstance.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat]
      ],
      {
        padding: 80,
        duration: 700,
        maxZoom: 14
      }
    );
  }, [routeLineGeoJson]);

  const stopFlyThrough = (announce = true) => {
    if (flyThroughTimerRef.current !== null) {
      window.clearInterval(flyThroughTimerRef.current);
      flyThroughTimerRef.current = null;
    }
    if (flyThroughActive) setFlyThroughActive(false);
    if (announce) setRouteActionMessage('Cinematic fly-through stopped.');
  };

  const startFlyThrough = () => {
    const mapInstance = mapRef.current?.getMap?.();
    const coordinates = routeLineGeoJson?.features?.[0]?.geometry?.coordinates;
    const sampled = sampleRouteCoordinates(coordinates, 24);

    if (!mapInstance || sampled.length < 2) {
      setRouteActionMessage('Generate a route first to run cinematic fly-through.');
      return;
    }

    if (flyThroughTimerRef.current !== null) {
      window.clearInterval(flyThroughTimerRef.current);
      flyThroughTimerRef.current = null;
    }

    setEnable3DView(true);
    setFlyThroughActive(true);
    setRouteActionMessage('Cinematic fly-through started.');

    let stepIndex = 0;
    const runStep = () => {
      if (stepIndex >= sampled.length - 1) {
        if (flyThroughTimerRef.current !== null) {
          window.clearInterval(flyThroughTimerRef.current);
          flyThroughTimerRef.current = null;
        }
        setFlyThroughActive(false);
        setRouteActionMessage('Cinematic fly-through completed.');
        return;
      }

      const current = sampled[stepIndex];
      const next = sampled[stepIndex + 1];
      mapInstance.easeTo({
        center: current,
        zoom: Math.max(mapInstance.getZoom(), 13.2),
        pitch: 62,
        bearing: bearingBetween(current, next),
        duration: 1050,
        essential: true
      });
      stepIndex += 1;
    };

    runStep();
    flyThroughTimerRef.current = window.setInterval(runStep, 1120);
  };

  useEffect(() => {
    return () => {
      if (flyThroughTimerRef.current !== null) {
        window.clearInterval(flyThroughTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const mapInstance = mapRef.current?.getMap?.();
    if (!mapInstance || !mapReady) return;

    if (enable3DView) {
      mapInstance.easeTo({
        pitch: 58,
        bearing: mapInstance.getBearing() || 22,
        zoom: Math.max(mapInstance.getZoom(), 12.4),
        duration: 600,
        essential: true
      });
      if (!MAPTILER_KEY) {
        setRouteActionMessage('3D camera enabled. Add REACT_APP_MAPTILER_KEY for terrain and 3D buildings.');
      }
      return;
    }

    if (flyThroughTimerRef.current !== null) {
      window.clearInterval(flyThroughTimerRef.current);
      flyThroughTimerRef.current = null;
      setFlyThroughActive(false);
    }

    mapInstance.easeTo({
      pitch: 0,
      bearing: 0,
      duration: 650,
      essential: true
    });
  }, [enable3DView, mapReady]);

  useEffect(() => {
    const mapInstance = mapRef.current?.getMap?.();
    if (!mapInstance || !mapReady) return undefined;

    const apply3DStyle = () => {
      const terrainWanted = enable3DView && enableTerrain && TERRAIN_DEM_TILES.length > 0;

      if (terrainWanted) {
        try {
          if (!mapInstance.getSource(TERRAIN_SOURCE_ID)) {
            mapInstance.addSource(TERRAIN_SOURCE_ID, {
              type: 'raster-dem',
              tiles: TERRAIN_DEM_TILES,
              tileSize: 256,
              maxzoom: 14
            });
          }
          if (typeof mapInstance.setTerrain === 'function') {
            mapInstance.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1.25 });
            setTerrainSupported(true);
          } else {
            setTerrainSupported(false);
          }
        } catch {
          setTerrainSupported(false);
        }
      } else if (typeof mapInstance.setTerrain === 'function') {
        mapInstance.setTerrain(null);
      }

      const hasLayer = Boolean(mapInstance.getLayer(BUILDINGS_LAYER_ID));
      const shouldShowBuildings = enable3DView && enableBuildings3D;
      if (!shouldShowBuildings) {
        if (hasLayer) mapInstance.removeLayer(BUILDINGS_LAYER_ID);
        return;
      }

      if (hasLayer) return;
      try {
        const style = mapInstance.getStyle?.() || {};
        const layers = Array.isArray(style.layers) ? style.layers : [];
        const buildingSourceLayer = layers.find(
          (layer) => typeof layer?.['source-layer'] === 'string' && /building/i.test(layer['source-layer']) && layer?.source
        );
        if (!buildingSourceLayer) return;

        const labelLayerId = layers.find((layer) => layer.type === 'symbol' && layer.layout?.['text-field'])?.id;

        mapInstance.addLayer(
          {
            id: BUILDINGS_LAYER_ID,
            type: 'fill-extrusion',
            source: buildingSourceLayer.source,
            'source-layer': buildingSourceLayer['source-layer'],
            minzoom: 13,
            paint: {
              'fill-extrusion-color': '#c9d9eb',
              'fill-extrusion-height': ['coalesce', ['get', 'height'], 12],
              'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
              'fill-extrusion-opacity': 0.58
            }
          },
          labelLayerId
        );
      } catch {
        // Style can vary by map provider; building extrusion is optional.
      }
    };

    if (mapInstance.isStyleLoaded()) apply3DStyle();
    mapInstance.on('styledata', apply3DStyle);

    return () => {
      mapInstance.off('styledata', apply3DStyle);
    };
  }, [enable3DView, enableTerrain, enableBuildings3D, mapReady]);

  const effectiveStart = useMemo(() => {
    if (manualStartPoint) return { ...manualStartPoint, label: manualStartPoint.label || 'Pinned start' };
    if (userLocation) return { ...userLocation, label: 'My live location' };
    return { lat: viewState.latitude, lon: viewState.longitude, label: 'Map center' };
  }, [manualStartPoint, userLocation, viewState.latitude, viewState.longitude]);

  const googleMapsDirectionsUrl = useMemo(() => {
    if (!destination) return '';
    const travelModeMap = {
      walking: 'walking',
      cycling: 'bicycling',
      driving: 'driving'
    };
    const mode = travelModeMap[routeMode] || 'walking';
    const origin = `${Number(effectiveStart.lat)},${Number(effectiveStart.lon)}`;
    const dest = `${Number(destination.lat)},${Number(destination.lon)}`;
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&travelmode=${mode}`;
  }, [destination, effectiveStart.lat, effectiveStart.lon, routeMode]);

  const searchPlaces = async (query, target, allowEmptyNotice = true) => {
    const trimmed = String(query || '').trim();
    setNavLookupTarget(target);
    if (trimmed.length < 2) {
      setNavResults([]);
      if (allowEmptyNotice) setNavNotice('Type at least 2 letters to search places.');
      return;
    }
    setNavSearching(true);
    setNavNotice('');
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=8&language=en&format=json`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data?.results) || !data.results.length) {
        setNavResults([]);
        setNavNotice('No matching places found. Try a different query.');
        return;
      }
      const mapped = data.results.map((item) => ({
        id: `${item.id || `${item.latitude}-${item.longitude}`}`,
        label: [item.name, item.admin1, item.country].filter(Boolean).join(', '),
        lat: Number(item.latitude),
        lon: Number(item.longitude)
      }));
      setNavResults(mapped);
    } catch {
      setNavNotice('Place search is currently unavailable.');
    } finally {
      setNavSearching(false);
    }
  };

  useEffect(() => {
    const query = navLookupTarget === 'destination' ? navDestinationQuery : navStartQuery;
    const trimmed = String(query || '').trim();
    if (trimmed.length < 2) {
      setNavResults([]);
      return undefined;
    }

    const timer = setTimeout(() => {
      searchPlaces(trimmed, navLookupTarget, false);
    }, 320);

    return () => clearTimeout(timer);
  }, [navStartQuery, navDestinationQuery, navLookupTarget]);

  const pushRecentSearch = (place) => {
    if (!place) return;
    const normalized = {
      id: String(place.id || `${place.lat}-${place.lon}`),
      label: place.label || 'Saved place',
      lat: Number(place.lat),
      lon: Number(place.lon)
    };
    if (!Number.isFinite(normalized.lat) || !Number.isFinite(normalized.lon)) return;

    setRecentSearches((prev) => {
      const next = [
        normalized,
        ...prev.filter(
          (entry) =>
            entry.label.toLowerCase() !== normalized.label.toLowerCase()
            && haversineKm(Number(entry.lat), Number(entry.lon), normalized.lat, normalized.lon) > 0.05
        )
      ];
      return next.slice(0, 8);
    });
  };

  const setFavoriteFromPlace = (slot, place) => {
    if (!place || (slot !== 'home' && slot !== 'work')) return;
    const normalized = {
      id: String(place.id || `${place.lat}-${place.lon}`),
      label: place.label || (slot === 'home' ? 'Home' : 'Work'),
      lat: Number(place.lat),
      lon: Number(place.lon)
    };
    if (!Number.isFinite(normalized.lat) || !Number.isFinite(normalized.lon)) return;

    setFavoritePlaces((prev) => ({ ...prev, [slot]: normalized }));
    setRouteActionMessage(`${slot === 'home' ? 'Home' : 'Work'} shortcut updated.`);
  };

  const ensureDestinationPin = (lat, lon, label) => {
    const existing = pins.find((p) => haversineKm(Number(lat), Number(lon), Number(p.lat), Number(p.lon)) <= 0.08);
    if (existing) {
      setDestinationId(String(existing.id || `${existing.lat}-${existing.lon}-${existing.time}`));
      return;
    }
    const pin = normalizePin({
      id: `nav_${Date.now()}`,
      name: label || 'Navigation Destination',
      note: label || 'Navigation Destination',
      lat: Number(lat),
      lon: Number(lon),
      location: { lat: Number(lat), lng: Number(lon) },
      mood: currentMood,
      moodTags: [moodToTag(currentMood)],
      budget: userBudget,
      ratings: { overall: 4.3, safety: 4.0, vibe: 4.2, crowd: 3.5 },
      reviews: [],
      song: currentPlaylist,
      time: new Date().toISOString()
    });
    setPins((prev) => [pin, ...prev]);
    setDestinationId(String(pin.id || `${pin.lat}-${pin.lon}-${pin.time}`));
  };

  const applyPlaceResult = (place, forcedTarget = '') => {
    if (!place) return;
    const target = forcedTarget || navLookupTarget;
    if (target === 'start') {
      setManualStartPoint({ lat: Number(place.lat), lon: Number(place.lon), label: place.label || 'Pinned start' });
      setNavStartQuery(place.label);
      setViewState((prev) => ({ ...prev, latitude: Number(place.lat), longitude: Number(place.lon), zoom: Math.max(prev.zoom || 11, 11) }));
      setRouteActionMessage('Start location updated from search.');
    } else {
      ensureDestinationPin(place.lat, place.lon, place.label);
      setNavDestinationQuery(place.label);
      setViewState((prev) => ({ ...prev, latitude: Number(place.lat), longitude: Number(place.lon), zoom: Math.max(prev.zoom || 12, 12) }));
      setRouteActionMessage('Destination selected from search.');
    }
    pushRecentSearch(place);
    setNavResults([]);
  };

  const resolvePlaceFromQuery = async (query) => {
    const trimmed = String(query || '').trim();
    if (trimmed.length < 2) return null;
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=1&language=en&format=json`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data?.results) || !data.results.length) return null;
      const first = data.results[0];
      return {
        id: `${first.id || `${first.latitude}-${first.longitude}`}`,
        label: [first.name, first.admin1, first.country].filter(Boolean).join(', '),
        lat: Number(first.latitude),
        lon: Number(first.longitude)
      };
    } catch {
      return null;
    }
  };

  const handleStartToDestination = async () => {
    let resolvedDestination = destination;
    let resolvedStart = manualStartPoint || userLocation || { lat: viewState.latitude, lon: viewState.longitude, label: 'Map center' };
    if (!resolvedDestination && navDestinationQuery.trim().length >= 2) {
      const searchedDestination = await resolvePlaceFromQuery(navDestinationQuery);
      if (searchedDestination) {
        applyPlaceResult(searchedDestination, 'destination');
      }
      resolvedDestination = searchedDestination
        ? {
          ...searchedDestination,
          note: searchedDestination.label,
          mood: currentMood,
          time: new Date().toISOString()
        }
        : null;
    }

    if (!resolvedDestination) {
      setRouteActionMessage('Enter or select a destination city/place first.');
      return;
    }

    if (!manualStartPoint && !userLocation) {
      if (navStartQuery.trim().length >= 2) {
        const searchedStart = await resolvePlaceFromQuery(navStartQuery);
        if (searchedStart) {
          applyPlaceResult(searchedStart, 'start');
          resolvedStart = searchedStart;
        } else {
          setManualStartPoint({ lat: viewState.latitude, lon: viewState.longitude, label: 'Map center' });
          resolvedStart = { lat: viewState.latitude, lon: viewState.longitude, label: 'Map center' };
        }
      } else {
        setManualStartPoint({ lat: viewState.latitude, lon: viewState.longitude, label: 'Map center' });
        resolvedStart = { lat: viewState.latitude, lon: viewState.longitude, label: 'Map center' };
      }
    }

    const destinationLabel = resolvedDestination.note || resolvedDestination.label || `${resolvedDestination.mood || currentMood} destination`;
    const startLabel = resolvedStart.label || effectiveStart.label || 'Start';
    setRouteActionMessage(`Route started: ${startLabel} -> ${destinationLabel}`);
    postAutomationEvent('route_started', {
      from: resolvedStart,
      destination: resolvedDestination,
      climateSafeMode,
      vibeSyncMode,
      routeMode,
      routeOptions: {
        maxStops: routeMaxStops,
        preferScenic: preferScenicRoute,
        minimizeStops: minimizeStopsRoute,
        returnToStart: returnToStartRoute,
        avoidUnsafeZones
      },
      currentMood
    });
  };

  const handleNavInputKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    handleStartToDestination();
  };

  const handleSwapRouteEndpoints = () => {
    if (!destination) {
      setRouteActionMessage('Select a destination first before swapping.');
      return;
    }

    const oldStart = manualStartPoint || userLocation || { lat: viewState.latitude, lon: viewState.longitude };
    const oldDestinationId = String(destination.id || `${destination.lat}-${destination.lon}-${destination.time}`);

    setManualStartPoint({
      lat: Number(destination.lat),
      lon: Number(destination.lon),
      label: destination.note || destination.name || 'Swapped start'
    });
    setRouteSwapPulse(true);

    const candidatePins = pins.filter((p) => {
      const id = String(p.id || `${p.lat}-${p.lon}-${p.time}`);
      return id !== oldDestinationId;
    });

    if (!candidatePins.length) {
      setRouteActionMessage('Start moved to previous destination. Add another pin to complete swap.');
      return;
    }

    const nearestPin = candidatePins.reduce((best, current) => {
      const bestDistance = haversineKm(oldStart.lat, oldStart.lon, Number(best.lat), Number(best.lon));
      const currentDistance = haversineKm(oldStart.lat, oldStart.lon, Number(current.lat), Number(current.lon));
      return currentDistance < bestDistance ? current : best;
    });

    setDestinationId(String(nearestPin.id || `${nearestPin.lat}-${nearestPin.lon}-${nearestPin.time}`));
    setRouteActionMessage('Swapped route endpoints.');
    postAutomationEvent('route_swapped', {
      newStart: { lat: Number(destination.lat), lon: Number(destination.lon) },
      newDestination: nearestPin
    });
  };

  const completeOnboarding = () => {
    setShowCoach(false);
    try {
      localStorage.setItem(ONBOARDING_KEY, 'true');
    } catch {
      // no-op
    }
  };

  const resetOnboarding = () => {
    setCoachStep(0);
    setShowCoach(true);
    setSettingsNotice('Onboarding reset. Coach marks are open again.');
    try {
      localStorage.removeItem(ONBOARDING_KEY);
    } catch {
      // no-op
    }
  };

  const coachTips = [
    'Drop a pin by clicking anywhere on the map and save a vibe memory.',
    'Pick a destination to auto-build an emotion-first route across your vibe points.',
    'Use tabs to manage climate safety, story mode, and biometric validation in one place.'
  ];

  if (showIntro) {
    return (
      <div className="intro-screen">
        <style>
          {`
            @keyframes brandEnter {
              0% { opacity: 0; transform: translateY(20px) scale(0.95); }
              100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes ringPulse {
              0% { transform: scale(0.9); opacity: 0.5; }
              100% { transform: scale(1.15); opacity: 0; }
            }
          `}
        </style>

        <div className="intro-ring" />

        <div className="intro-brand">
          <div className="intro-logo">VA</div>
          <div className="intro-title">{APP_NAME}</div>
          <div className="intro-subtitle">Emotion-first journey mapping</div>
        </div>

        <button
          type="button"
          onClick={() => setShowIntro(false)}
          className="intro-skip"
        >
          Skip
        </button>
      </div>
    );
  }

  if (showLoginHome) {
    return (
      <Login
        onContinue={() => setShowLoginHome(false)}
        onLogin={({ email, password }) => performLogin(email, password)}
        onRegister={({ name, email, password }) => performRegister(name, email, password)}
      />
    );
  }

  return (
    <div className={`app-shell theme-${currentMood.toLowerCase()}`}>
      <div className="ambient-orb ambient-orb-one" />
      <div className="ambient-orb ambient-orb-two" />

      <Map
        ref={mapRef}
        initialViewState={viewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        mapLib={maplibregl}
        antialias
        maxPitch={85}
        onLoad={() => {
          setMapError('');
          setMapReady(true);
        }}
        onError={(event) => {
          const message = event?.error?.message || event?.error?.toString?.() || 'Map failed to load.';
          setMapError(message);
          setMapReady(false);
        }}
        onMove={(e) => {
          setViewState(e.viewState);
          if (mapActionMenu.open) setMapActionMenu((prev) => ({ ...prev, open: false }));
        }}
        onClick={onMapClick}
        onContextMenu={onMapContextMenu}
      >
        {routeLineGeoJson && (
          <Source id="vibe-route-line" type="geojson" data={routeLineGeoJson} lineMetrics>
            <Layer
              id="vibe-route-glow"
              type="line"
              paint={{
                'line-color': routePalette.glow,
                'line-width': routePalette.glowWidth,
                'line-opacity': 0.35
              }}
            />
            <Layer
              id="vibe-route-main"
              type="line"
              paint={{
                'line-color': routePalette.accent,
                'line-width': routePalette.width,
                'line-dasharray': [routePalette.dash[0], routePalette.dash[1] + (routeDashPhase * 0.2)],
                'line-opacity': routePalette.opacity
              }}
            />
          </Source>
        )}

        {showHeatmap && heatmapPoints.length > 0 && (
          <Source id="mood-heat" type="geojson" data={heatmapGeoJson}>
            <Layer
              id="mood-heat-layer"
              type="heatmap"
              paint={{
                'heatmap-weight': ['interpolate', ['linear'], ['get', 'intensity'], 0, 0, 10, 1],
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 4, 12, 30],
                'heatmap-intensity': 1
              }}
            />
          </Source>
        )}

        {visiblePins.map((p) => {
          const pinId = String(p.id || `${p.lat}-${p.lon}-${p.time}`);
          const showLabel = Boolean(p.name || p.note);
          return (
            <Marker
              key={pinId}
              longitude={p.lon}
              latitude={p.lat}
              anchor="bottom"
            >
              <button
                type="button"
                className={`emotion-dot ${p.isTrending ? 'emotion-dot-trending' : ''} ${selectedPin && String(selectedPin.id || `${selectedPin.lat}-${selectedPin.lon}-${selectedPin.time}`) === pinId ? 'map-pin-active' : ''}`}
                style={{
                  '--pin-color': pinEmotionColor(p),
                  '--pin-size': `${pinDotSize(p)}px`,
                  boxShadow:
                    Number(p.hiddenScore || 0) >= 4
                      ? `0 0 10px ${pinEmotionColor(p)}, 0 4px 12px rgba(0, 0, 0, 0.4), inset 0 -2px 4px rgba(0,0,0,0.2)`
                      : undefined
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPin(p);
                }}
                aria-label={`Select ${p.name || p.note || p.mood} emotion spot`}
              />
              {showLabel && (
                <div className="map-marker-label">
                  {p.name || p.note || 'Vibe spot'}
                </div>
              )}
            </Marker>
          );
        })}
          {mapError && (
            <div className="map-error-banner" role="alert">
              <strong>Map error:</strong> {mapError}
            </div>
          )}


        {userLocation && (
          <Marker longitude={userLocation.lon} latitude={userLocation.lat} color="#10b981" />
        )}

        {destination && (
          <Marker longitude={Number(destination.lon)} latitude={Number(destination.lat)} anchor="bottom">
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: '2px solid #ffffff',
                background: '#ef4444',
                boxShadow: '0 0 0 4px rgba(239, 68, 68, 0.18)'
              }}
              title="Destination"
            />
          </Marker>
        )}

        {destination && effectiveStart && (
          <Marker longitude={Number(effectiveStart.lon)} latitude={Number(effectiveStart.lat)} anchor="bottom">
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                border: '2px solid #ffffff',
                background: '#2563eb',
                boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.18)'
              }}
              title="Route start"
            />
          </Marker>
        )}

        {selectedPin && (
          <Popup
            longitude={selectedPin.lon}
            latitude={selectedPin.lat}
            onClose={() => setSelectedPin(null)}
          >
            <div style={{ maxWidth: 260 }}>
              <strong>{selectedPin.name || 'Vibe Spot'}</strong>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>
                {stars(selectedPin.ratings?.overall)} ({Number(selectedPin.ratings?.overall || 0).toFixed(1)})
              </div>
              <div style={{ marginTop: 6 }}>{selectedPin.note}</div>
              <div style={{ marginTop: 6 }}>
                {selectedPin.moodTags?.map((tag) => (
                  <span key={tag} className="popup-chip">{tag}</span>
                ))}
              </div>
              <div style={{ marginTop: 6 }}>
                <span className={`budget-badge budget-${selectedPin.budget || 'medium'}`}>
                  {selectedPin.budget === 'free' ? '🆓 Free' : selectedPin.budget === 'low' ? '💸 Low' : selectedPin.budget === 'luxury' ? '💎 Luxury' : '💰 Medium'}
                </span>
              </div>
              {selectedPin.type && (
                <div style={{ marginTop: 6 }}>Type: {selectedPin.type}</div>
              )}
              {selectedPin.bestTime && (
                <div style={{ marginTop: 6 }}>Best Time: {selectedPin.bestTime}</div>
              )}
              {!!selectedPin.hiddenScore && (
                <div style={{ marginTop: 6 }}>Hidden Score: {selectedPin.hiddenScore}/5</div>
              )}
              <div style={{ marginTop: 6 }}>
                Crowd: {selectedPin.crowdLevel || 'medium'} | Safety: {Number(selectedPin.safety || selectedPin.ratings?.safety || 4).toFixed(1)} | Wifi: {selectedPin.wifi ? 'Yes' : 'No'}
              </div>
              {selectedPin.routeType && (
                <div style={{ marginTop: 6 }}>Route Type: {selectedPin.routeType}</div>
              )}
              <div style={{ marginTop: 6 }}>Song: {selectedPin.song || 'None'}</div>
              {selectedPin.spotify_track_id && (
                <div style={{ marginTop: 6 }}>
                  Track ID: {selectedPin.spotify_track_id}
                </div>
              )}
              {selectedPin.spotify_playlist_id && (
                <div style={{ marginTop: 6 }}>
                  Playlist ID: {selectedPin.spotify_playlist_id}
                </div>
              )}
              <div style={{ marginTop: 6 }}>
                Weather: {selectedPin.weather || weather.label} | Time: {formatTime(selectedPin.time)}
              </div>
              {!!selectedPin.reviews?.length && (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  <strong>Review Preview</strong>
                  {selectedPin.reviews.slice(0, 2).map((r, idx) => (
                    <div key={`${r.user}-${idx}`} style={{ marginTop: 4 }}>
                      {r.user}: {r.text || 'No note'} ({r.rating}/5, {r.time})
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Popup>
        )}

        {tempPin && (
          <Popup
            longitude={tempPin.lng}
            latitude={tempPin.lat}
            onClose={() => setTempPin(null)}
            closeOnClick={false}
          >
            <div style={{ display: 'grid', gap: 8, minWidth: 220 }}>
              <input
                className="field-input"
                placeholder="Spot name"
                value={tempPin.name || ''}
                onChange={(e) => setTempPin((prev) => ({ ...prev, name: e.target.value }))}
              />
              <select
                className="field-input"
                value={tempPin.mood}
                onChange={(e) =>
                  setTempPin((prev) => ({ ...prev, mood: e.target.value, moodTags: [moodToTag(e.target.value)] }))
                }
              >
                {MOODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                className="field-input"
                value={tempPin.moodTags?.[0] || 'calm'}
                onChange={(e) => setTempPin((prev) => ({ ...prev, moodTags: [e.target.value] }))}
              >
                {SMART_MOOD_TAGS.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
              <select
                className="field-input"
                value={tempPin.budget || 'medium'}
                onChange={(e) => setTempPin((prev) => ({ ...prev, budget: e.target.value }))}
              >
                <option value="low">💸 Low</option>
                <option value="medium">💰 Medium</option>
                <option value="luxury">💎 Luxury</option>
              </select>
              <input
                className="field-input"
                placeholder="Memory note"
                value={tempPin.note}
                onChange={(e) => setTempPin((prev) => ({ ...prev, note: e.target.value }))}
              />
              <div className="metrics-grid">
                <input
                  className="field-input"
                  type="number"
                  min="1"
                  max="5"
                  step="0.1"
                  placeholder="Overall"
                  value={tempPin.ratings?.overall ?? 4}
                  onChange={(e) =>
                    setTempPin((prev) => ({
                      ...prev,
                      ratings: { ...(prev.ratings || {}), overall: Number(e.target.value || 0) }
                    }))
                  }
                />
                <input
                  className="field-input"
                  type="number"
                  min="1"
                  max="5"
                  step="0.1"
                  placeholder="Safety"
                  value={tempPin.ratings?.safety ?? 4}
                  onChange={(e) =>
                    setTempPin((prev) => ({
                      ...prev,
                      ratings: { ...(prev.ratings || {}), safety: Number(e.target.value || 0) }
                    }))
                  }
                />
                <input
                  className="field-input"
                  type="number"
                  min="1"
                  max="5"
                  step="0.1"
                  placeholder="Vibe"
                  value={tempPin.ratings?.vibe ?? 4}
                  onChange={(e) =>
                    setTempPin((prev) => ({
                      ...prev,
                      ratings: { ...(prev.ratings || {}), vibe: Number(e.target.value || 0) }
                    }))
                  }
                />
                <input
                  className="field-input"
                  type="number"
                  min="1"
                  max="5"
                  step="0.1"
                  placeholder="Crowd"
                  value={tempPin.ratings?.crowd ?? 3.5}
                  onChange={(e) =>
                    setTempPin((prev) => ({
                      ...prev,
                      ratings: { ...(prev.ratings || {}), crowd: Number(e.target.value || 0) }
                    }))
                  }
                />
              </div>
              <input
                className="field-input"
                placeholder="Review preview text"
                value={tempPin.reviewText || ''}
                onChange={(e) => setTempPin((prev) => ({ ...prev, reviewText: e.target.value }))}
              />
              <input
                className="field-input"
                placeholder="Song / playlist"
                value={tempPin.song}
                onChange={(e) => setTempPin((prev) => ({ ...prev, song: e.target.value }))}
              />
              <input
                className="field-input"
                placeholder="Spotify Track ID (optional)"
                value={tempPin.spotifyTrackId || ''}
                onChange={(e) => setTempPin((prev) => ({ ...prev, spotifyTrackId: e.target.value }))}
              />
              <input
                className="field-input"
                placeholder="Spotify Playlist ID (optional)"
                value={tempPin.spotifyPlaylistId || ''}
                onChange={(e) => setTempPin((prev) => ({ ...prev, spotifyPlaylistId: e.target.value }))}
              />
              <button className="btn-secondary" onClick={suggestMood}>AI Suggest Mood</button>
              <button
                className="btn-primary"
                onClick={() => {
                  const draft = {
                    ...tempPin,
                    reviews: tempPin.reviewText
                      ? [
                          {
                            user: 'You',
                            mood: tempPin.moodTags?.[0] || moodToTag(tempPin.mood),
                            rating: tempPin.ratings?.overall || 4,
                            text: tempPin.reviewText,
                            time: timeOfDay.toLowerCase().includes('late') ? 'night' : 'evening'
                          }
                        ]
                      : tempPin.reviews || []
                  };
                  saveVibe(draft);
                }}
              >
                Save Vibe Pin
              </button>
            </div>
          </Popup>
        )}
      </Map>

      {mapActionMenu.open && (
        <div className="map-action-menu" style={{ left: mapActionMenu.x, top: mapActionMenu.y }}>
          <div className="map-action-menu-title">Map Actions</div>
          <div className="map-action-menu-coords">
            {mapActionMenu.lat.toFixed(5)}, {mapActionMenu.lon.toFixed(5)}
          </div>
          <button type="button" className="map-action-menu-btn map-action-menu-btn-primary" onClick={placePinFromMenu}>
            Add Place Pin
          </button>
          <button
            type="button"
            className="map-action-menu-btn"
            onClick={() => {
              const label = `Pinned start (${mapActionMenu.lat.toFixed(4)}, ${mapActionMenu.lon.toFixed(4)})`;
              setManualStartPoint({ lat: mapActionMenu.lat, lon: mapActionMenu.lon, label });
              setNavStartQuery(label);
              setRouteActionMessage('Start point pinned from map.');
              setMapActionMenu((prev) => ({ ...prev, open: false }));
            }}
          >
            Set as Start
          </button>
          <button
            type="button"
            className="map-action-menu-btn"
            onClick={() => {
              const label = `Pinned destination (${mapActionMenu.lat.toFixed(4)}, ${mapActionMenu.lon.toFixed(4)})`;
              ensureDestinationPin(mapActionMenu.lat, mapActionMenu.lon, label);
              setNavDestinationQuery(label);
              setRouteActionMessage('Destination pinned from map.');
              setMapActionMenu((prev) => ({ ...prev, open: false }));
            }}
          >
            Set as Destination
          </button>
          <button
            type="button"
            className="map-action-menu-btn"
            onClick={() => {
              const mapInstance = mapRef.current?.getMap?.();
              if (mapInstance) {
                mapInstance.easeTo({ center: [mapActionMenu.lon, mapActionMenu.lat], duration: 450, essential: true });
              }
              setMapActionMenu((prev) => ({ ...prev, open: false }));
            }}
          >
            Center Here
          </button>
          <button
            type="button"
            className="map-action-menu-btn"
            onClick={() => setMapActionMenu((prev) => ({ ...prev, open: false }))}
          >
            Close
          </button>
        </div>
      )}

      {savedPinDebug && (
        <div className="pin-debug-toast" role="status" aria-live="polite">
          <div className="pin-debug-toast-head">
            <strong>Pin saved and rendered</strong>
            <button type="button" className="pin-debug-toast-close" onClick={() => setSavedPinDebug(null)}>
              Close
            </button>
          </div>
          <div className="pin-debug-toast-body">
            <span>ID: {savedPinDebug.id}</span>
            <span>Lat: {savedPinDebug.lat.toFixed(5)}</span>
            <span>Lon: {savedPinDebug.lon.toFixed(5)}</span>
            <span>Source: {savedPinDebug.source}</span>
            <span>Mood: {savedPinDebug.mood}</span>
          </div>
          <div className="pin-debug-toast-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setActiveMoodFilter('All');
                setActiveBudgetFilter('All');
                setViewState((prev) => ({
                  ...prev,
                  latitude: savedPinDebug.lat,
                  longitude: savedPinDebug.lon,
                  zoom: Math.max(Number(prev?.zoom || 0), 12)
                }));
              }}
            >
              Focus Pin
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                const text = `${savedPinDebug.id} | ${savedPinDebug.lat.toFixed(6)}, ${savedPinDebug.lon.toFixed(6)}`;
                try {
                  await navigator.clipboard.writeText(text);
                  setRouteActionMessage('Saved pin debug copied to clipboard.');
                } catch {
                  setRouteActionMessage('Clipboard unavailable in this browser context.');
                }
              }}
            >
              Copy Debug
            </button>
          </div>
        </div>
      )}

      <div className="map-quick-dock" aria-label="3D navigation controls">
        <div className="map-quick-head">
          <strong>3D Navigator</strong>
          <span>{enable3DView ? 'Perspective ON' : 'Perspective OFF'}</span>
        </div>
        <div className="map-quick-actions">
          <button
            type="button"
            className={`map-quick-btn ${enable3DView ? 'map-quick-btn-primary' : ''}`}
            onClick={() => setEnable3DView((prev) => !prev)}
          >
            {enable3DView ? 'Disable 3D' : 'Enable 3D'}
          </button>
          <button
            type="button"
            className={`map-quick-btn ${enableTerrain && enable3DView ? 'map-quick-btn-primary' : ''}`}
            onClick={() => setEnableTerrain((prev) => !prev)}
            disabled={!MAPTILER_KEY}
            title={!MAPTILER_KEY ? 'Add REACT_APP_MAPTILER_KEY to enable terrain' : 'Toggle terrain relief'}
          >
            Terrain
          </button>
          <button
            type="button"
            className={`map-quick-btn ${enableBuildings3D && enable3DView ? 'map-quick-btn-primary' : ''}`}
            onClick={() => setEnableBuildings3D((prev) => !prev)}
          >
            Buildings
          </button>
          <button
            type="button"
            className="map-quick-btn map-quick-btn-primary"
            onClick={startFlyThrough}
            disabled={flyThroughActive}
          >
            Fly-through
          </button>
          <button
            type="button"
            className="map-quick-btn"
            onClick={() => stopFlyThrough(true)}
            disabled={!flyThroughActive}
          >
            Stop
          </button>
          <button
            type="button"
            className="map-quick-btn"
            onClick={() => {
              setEnable3DView(false);
              setEnableTerrain(false);
              setEnableBuildings3D(false);
              stopFlyThrough(false);
              setRouteActionMessage('Switched back to 2D map view.');
            }}
          >
            Reset View
          </button>
        </div>
        <div className="map-quick-steps">
          <span className={`map-step ${enable3DView ? 'map-step-done' : ''}`}>3D</span>
          <span className={`map-step ${enableTerrain && terrainSupported ? 'map-step-done' : ''}`}>Terrain</span>
          <span className={`map-step ${enableBuildings3D ? 'map-step-done' : ''}`}>Buildings</span>
          <span className={`map-step ${flyThroughActive ? 'map-step-done' : ''}`}>Fly</span>
        </div>
        {!MAPTILER_KEY && <div className="small-row top-gap">Terrain needs REACT_APP_MAPTILER_KEY. 3D perspective and fly-through still work.</div>}
      </div>

      <div className="map-route-legend" aria-label="Route mode legend">
        <div className="map-route-legend-head">
          <strong>Route Modes</strong>
          <span>Live style guide</span>
        </div>
        <div className="map-route-legend-list">
          {routeLegendItems.map((item) => (
            <div key={item.id} className={`map-route-legend-item ${item.active ? 'map-route-legend-item-active' : ''}`}>
              <div className="map-route-legend-label">{item.label}</div>
              <div className="map-route-legend-line-wrap">
                <span
                  className="map-route-legend-line"
                  style={{
                    '--legend-color': item.accent,
                    '--legend-width': `${item.width}px`,
                    '--legend-opacity': item.opacity,
                    '--legend-dash-a': `${item.dash[0] * 8}px`,
                    '--legend-dash-b': `${item.dash[1] * 8}px`
                  }}
                />
              </div>

              <button
                type="button"
                className="chat-bubble-launcher"
                onClick={() => {
                  setActiveMenuSection('guide');
                  setIsPanelExpanded(true);
                }}
                aria-label="Open chat guide"
              >
                <span className="chat-bubble-launcher-dot" aria-hidden="true" />
                <span className="chat-bubble-launcher-icon" aria-hidden="true">💬</span>
                <span className="chat-bubble-launcher-copy">
                  <strong>Chat Guide</strong>
                  <small>Ask how to use the app</small>
                </span>
              </button>
            </div>
          ))}
        </div>
        <div className="map-route-progress" aria-label="Trip progress summary">
          <div className="map-route-progress-head">
            <strong>A to B Progress</strong>
            <span>{activeRouteModeMeta.label}</span>
          </div>
          <div className="map-route-progress-grid">
            <div>
              <small>Total</small>
              <strong>{routeProgressSummary.totalLabel}</strong>
            </div>
            <div>
              <small>Covered</small>
              <strong>{routeProgressSummary.coveredLabel}</strong>
            </div>
            <div>
              <small>Remaining</small>
              <strong>{routeProgressSummary.remainingLabel}</strong>
            </div>
            <div>
              <small>Vehicle</small>
              <strong>{activeRouteModeMeta.label}</strong>
            </div>
          </div>
          <div className="map-route-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(routeProgressSummary.progressPct)}>
            <i
              style={{
                width: `${routeProgressSummary.progressPct}%`,
                '--route-progress-accent': routePalette.accent
              }}
            />
          </div>
          <div className="map-route-progress-meta">
            {routeProgressSummary.hasProgress
              ? `${routeProgressSummary.progressPct.toFixed(0)}% complete`
              : 'Select destination and start movement to see live progress'}
          </div>
        </div>
      </div>

      <div
        className="control-panel"
      >
        <div className="panel-headline">
          <h3>{APP_NAME}</h3>
          <span className="badge-live">Live</span>
        </div>

        <div
          className={`panel-summary ${isPanelExpanded ? 'panel-summary-open' : ''}`}
          role="button"
          tabIndex={0}
          aria-expanded={isPanelExpanded}
          onClick={() => setIsPanelExpanded((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsPanelExpanded((prev) => !prev);
            }
          }}
        >
          <div className="panel-grabber" />
          <div className="panel-summary-text">
            <h4>Smart Bar • {currentMood} • {activeRouteModeMeta.label}</h4>
            <p>{panelBudgetLabel} • {panelRouteDistance} • {panelRouteDuration}</p>
          </div>
          <div className="panel-icon-stack" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`panel-icon-btn ${activePanelTab === 'route' ? 'panel-icon-btn-active' : ''}`}
              aria-label="Route controls"
              onClick={() => {
                setActivePanelTab('route');
                setIsPanelExpanded(true);
              }}
            >
              <span>🧭</span>
            </button>
            <button
              type="button"
              className={`panel-icon-btn ${activePanelTab === 'climate' ? 'panel-icon-btn-active' : ''}`}
              aria-label="Climate controls"
              onClick={() => {
                setActivePanelTab('climate');
                setIsPanelExpanded(true);
              }}
            >
              <span>🏔️</span>
            </button>
            <button
              type="button"
              className={`panel-icon-btn ${activePanelTab === 'settings' ? 'panel-icon-btn-active' : ''}`}
              aria-label="City and settings controls"
              onClick={() => {
                setActivePanelTab('settings');
                setIsPanelExpanded(true);
              }}
            >
              <span>🏙️</span>
            </button>
          </div>
          <div className="panel-summary-btn">
            {isPanelExpanded ? 'Collapse Panel' : 'Customize Experience'}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {isPanelExpanded && (
            <motion.div
              className="expanded-panel"
              initial={{ height: 0, y: 22, opacity: 0 }}
              animate={{ height: 'auto', y: 0, opacity: 1 }}
              exit={{ height: 0, y: 18, opacity: 0 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
            >
              <div className="expanded-panel-inner">
        <div className="status-row status-row-chips">
          <span className="status-chip">Weather: {weather.label} ({weather.temp})</span>
          <span className="status-chip">Time: {new Date().toLocaleTimeString()}</span>
          <span className="status-chip">{timeOfDay}</span>
        </div>

        <div className="menu-bar" role="tablist" aria-label="Main menu">
          <button type="button" className={`menu-btn ${activeMenuSection === 'dashboard' ? 'menu-btn-active' : ''}`} onClick={() => setActiveMenuSection('dashboard')}>Dashboard</button>
          <button type="button" className={`menu-btn ${activeMenuSection === 'demo' ? 'menu-btn-active' : ''}`} onClick={() => setActiveMenuSection('demo')}>Demo</button>
          <button type="button" className={`menu-btn ${activeMenuSection === 'guide' ? 'menu-btn-active' : ''}`} onClick={() => setActiveMenuSection('guide')}>Guide Bot</button>
          <button type="button" className={`menu-btn ${activeMenuSection === 'profile' ? 'menu-btn-active' : ''}`} onClick={() => setActiveMenuSection('profile')}>Profile</button>
          <button type="button" className={`menu-btn ${activeMenuSection === 'auth' ? 'menu-btn-active' : ''}`} onClick={() => setActiveMenuSection('auth')}>Auth</button>
        </div>

        {activeMenuSection === 'guide' && (
          <div className="panel-card menu-section-card guide-bot-card">
            <div className="card-title">Chat Guide</div>
            <div className="small-row">
              Ask for route help, pin tips, 3D controls, demo mode, or login steps. The guide can also jump you back to the right section.
            </div>
            <GuideBot
              context={{
                appName: APP_NAME,
                currentMood,
                routeModeLabel: activeRouteModeMeta.label,
                weatherLabel: weather.label,
                timeOfDay,
                panelBudgetLabel,
                routeSummary: routeProgressSummary.hasProgress
                  ? `${routeProgressSummary.progressPct.toFixed(0)}% complete, ${routeProgressSummary.remainingLabel} remaining`
                  : 'No active route yet',
                mapReady,
                selectedPinName: selectedPin?.name || selectedPin?.note || '',
                activeFilters: {
                  mood: activeMoodFilter,
                  budget: activeBudgetFilter
                },
                authLabel: authState.isLoggedIn ? `${authState.email} (${authState.role})` : 'Not signed in'
              }}
              onNavigateSection={setActiveMenuSection}
              onResetFilters={() => {
                setActiveMoodFilter('All');
                setActiveBudgetFilter('All');
              }}
            />
          </div>
        )}

        {activeMenuSection === 'demo' && (
          <div className="panel-card menu-section-card">
            <div className="card-title">Demo Control</div>
            <div className="settings-actions">
              <button type="button" className="btn-primary" onClick={() => loadDemoData(false)} disabled={!isAdminUser}>Seed Demo</button>
              <button type="button" className="btn-secondary" onClick={() => loadDemoData(true)} disabled={!isAdminUser}>Reset Demo</button>
              <button type="button" className="btn-secondary" onClick={runGuidedDemoFlow} disabled={!isAdminUser}>Run Guided Flow</button>
            </div>
            {!isAdminUser && <div className="small-row top-gap">Admin role required for demo seed and guided demo flow.</div>}
            <div className="menu-steps">
              <span className={`menu-step ${demoSequenceStatus.dataReady ? 'menu-step-done' : ''}`}>1. Data</span>
              <span className={`menu-step ${demoSequenceStatus.profileReady ? 'menu-step-done' : ''}`}>2. Profile</span>
              <span className={`menu-step ${demoSequenceStatus.destinationReady ? 'menu-step-done' : ''}`}>3. Destination</span>
              <span className={`menu-step ${demoSequenceStatus.routeReady ? 'menu-step-done' : ''}`}>4. Route</span>
            </div>
            {demoSeedStatus && <div className="small-row top-gap">{demoSeedStatus}</div>}
          </div>
        )}

        {activeMenuSection === 'profile' && (
          <div className="panel-card menu-section-card">
            <div className="card-title">Profile Section</div>
            {authState.isLoggedIn ? (
              <>
                <input
                  className="field-input"
                  placeholder="Name"
                  value={profileDraft.name}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, name: e.target.value }))}
                />
                <input
                  className="field-input top-gap"
                  placeholder="Email"
                  value={profileDraft.email}
                  readOnly
                />
                <input
                  className="field-input top-gap"
                  placeholder="Role"
                  value={profileDraft.role}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, role: e.target.value }))}
                  readOnly={!isAdminUser}
                />
                {!isAdminUser && <div className="small-row top-gap">Only Admin can change roles. You can still update your name.</div>}
                <div className="button-row">
                  <button type="button" className="btn-primary" onClick={saveProfile}>Save Profile</button>
                  <button type="button" className="btn-secondary" onClick={handleLogout}>Logout</button>
                </div>
              </>
            ) : (
              <div className="small-row">Login first from Auth section to access profile settings.</div>
            )}
          </div>
        )}

        {activeMenuSection === 'auth' && (
          <div className="panel-card menu-section-card">
            <div className="card-title">Login Section</div>
            {authState.isLoggedIn ? (
              <>
                <div className="small-row">Logged in as {authState.email} ({authState.role})</div>
                <button type="button" className="btn-secondary full-width top-gap" onClick={handleLogout}>Logout</button>
              </>
            ) : (
              <>
                <input
                  className="field-input"
                  placeholder="Email"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))}
                />
                <input
                  className="field-input top-gap"
                  type="password"
                  placeholder="Password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                />
                <button type="button" className="btn-primary full-width top-gap" onClick={handleLogin}>Login</button>

                <div className="panel-card top-gap">
                  <div className="card-title">Create Account</div>
                  <input
                    className="field-input"
                    placeholder="Name"
                    value={registerForm.name}
                    onChange={(e) => setRegisterForm((p) => ({ ...p, name: e.target.value }))}
                  />
                  <input
                    className="field-input top-gap"
                    placeholder="Email"
                    value={registerForm.email}
                    onChange={(e) => setRegisterForm((p) => ({ ...p, email: e.target.value }))}
                  />
                  <input
                    className="field-input top-gap"
                    type="password"
                    placeholder="Password (min 6 chars)"
                    value={registerForm.password}
                    onChange={(e) => setRegisterForm((p) => ({ ...p, password: e.target.value }))}
                  />
                  <div className="small-row top-gap">New accounts are created with Explorer role. First account becomes Admin.</div>
                  <button type="button" className="btn-secondary full-width top-gap" onClick={handleRegister}>Register</button>
                </div>
              </>
            )}
            {authNotice && <div className="small-row top-gap">{authNotice}</div>}
          </div>
        )}

        {activeMenuSection === 'dashboard' && (
          <div className="dashboard-section">
        <div className="panel-card smart-card">
          <div className="card-title">AI Prediction Layer</div>
          <div className="small-row">Predicted mood: {predictedMood}</div>
          <div className="small-row">Travel mode: {travelSpeedKmh > 20 ? 'Fast travel' : travelSpeedKmh > 3 ? 'Walking' : 'Still'}</div>
          <div className="small-row top-gap smart-insight">{smartInsight}</div>
          <div className="button-row">
            <button
              className="btn-secondary"
              onClick={() => {
                setCurrentMood(predictedMood);
                setAiActionNotice(`Mood synced to ${predictedMood}.`);
              }}
            >
              Apply Prediction
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setCurrentPlaylist(suggestedPlaylist);
                if (spotifyAuth.accessToken && spotifyPlaylists[0]?.uri) {
                  playSpotifyPlaylist(spotifyPlaylists[0].uri);
                  setAiActionNotice('Playlist applied and Spotify playback started.');
                } else {
                  setAiActionNotice('Playlist name applied. Connect Spotify in Settings for direct playback.');
                }
              }}
            >
              Apply Playlist
            </button>
          </div>
          {aiActionNotice && <div className="small-row top-gap smart-action-notice">{aiActionNotice}</div>}
          <div className="small-row top-gap">Suggested playlist: {suggestedPlaylist}</div>
          <div className="small-row">Automation: {N8N_WEBHOOK_URL ? 'Connected to n8n webhook' : 'Local mode (set REACT_APP_N8N_WEBHOOK_URL)'}</div>
        </div>

        <div className="panel-card feature-sequence-card" role="tablist" aria-label="Feature sequence menu">
          <div className="card-title">Feature Sequence Menu</div>
          <div className="small-row">Follow this order for easy testing: Route to Climate to Story to Biometrics to Settings.</div>
          <div className="feature-sequence-row">
            {featureSequence.map((step, index) => (
              <button
                key={step.id}
                type="button"
                className={`feature-step-btn ${activePanelTab === step.id ? 'feature-step-btn-active' : ''} ${step.done ? 'feature-step-btn-done' : ''}`}
                onClick={() => setActivePanelTab(step.id)}
              >
                {index + 1}. {step.label}
              </button>
            ))}
          </div>
          <div className="feature-sequence-actions">
            <button type="button" className="btn-secondary" onClick={goToPreviousFeature} disabled={activeFeatureIndex === 0}>
              Previous Step
            </button>
            <button type="button" className="btn-primary" onClick={goToNextFeature} disabled={activeFeatureIndex === featureSequence.length - 1}>
              Next Step
            </button>
          </div>
        </div>

        <div className="quick-stats">
          <div className="stat-pill">
            <span>Pins</span>
            <strong>{pins.length}</strong>
          </div>
          <div className="stat-pill">
            <span>Visible</span>
            <strong>{visiblePins.length}</strong>
          </div>
          <div className="stat-pill">
            <span>Dominant</span>
            <strong>{dominantMood}</strong>
          </div>
          <div className="stat-pill">
            <span>Risk</span>
            <strong>{climateRiskLabel}</strong>
          </div>
        </div>

        <div className="panel-card notion-sync-card">
          <div className="card-title">Notion Sync</div>
          <div className="small-row">Status: {notionSync.status}</div>
          <div className="small-row">Database pins: {notionSync.count}</div>
          <div className="small-row">
            Last sync: {notionSync.lastSync ? formatTime(notionSync.lastSync) : 'Not synced yet'}
          </div>
          {notionSync.message && <div className="small-row top-gap">{notionSync.message}</div>}
          <div className="settings-actions top-gap">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => syncNotionPins(true)}
              disabled={notionSync.status === 'syncing'}
            >
              {notionSync.status === 'syncing' ? 'Syncing...' : 'Refresh Notion Pins'}
            </button>
          </div>
        </div>

        <label className="field-label">Current Mood</label>
        <select className="field-input" value={currentMood} onChange={(e) => setMoodManually(e.target.value)}>
          {MOODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <div className="mood-chip-row">
          {MOODS.map((mood) => (
            <button
              key={mood}
              type="button"
              className={`mood-chip ${currentMood === mood ? 'mood-chip-active' : ''}`}
              onClick={() => setMoodManually(mood)}
            >
              {mood}
            </button>
          ))}
        </div>

        <label className="field-label">
          Current Playlist
        </label>
        <input
          className="field-input"
          value={currentPlaylist}
          onChange={(e) => setCurrentPlaylist(e.target.value)}
          placeholder="Lo-fi hip hop"
        />

        <label className="field-label">Mood Filter</label>
        <select
          className="field-input"
          value={activeMoodFilter}
          onChange={(e) => setActiveMoodFilter(e.target.value)}
        >
          <option value="All">All Moods</option>
          {MOODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <label className="field-label">Budget Filter</label>
        <select
          className="field-input"
          value={activeBudgetFilter}
          onChange={(e) => setActiveBudgetFilter(e.target.value)}
        >
          <option value="All">All Budgets</option>
          <option value="free">🆓 Free</option>
          <option value="low">💸 Low</option>
          <option value="medium">💰 Medium</option>
          <option value="luxury">💎 Luxury</option>
        </select>

        <label className="field-label">Your Budget Preference</label>
        <select className="field-input" value={userBudget} onChange={(e) => setUserBudget(e.target.value)}>
          <option value="free">🆓 Free</option>
          <option value="low">💸 Low</option>
          <option value="medium">💰 Medium</option>
          <option value="luxury">💎 Luxury</option>
        </select>

        <div className="panel-card nav-like-card top-gap">
          <div className="card-title">Quick A to B</div>
          <div className="small-row">Enter city/place names here and start routing directly.</div>
          <div className="nav-input-row top-gap">
            <input
              className="field-input"
              value={navStartQuery}
              onFocus={() => setNavLookupTarget('start')}
              onChange={(e) => setNavStartQuery(e.target.value)}
              onKeyDown={handleNavInputKeyDown}
              placeholder="Start city/place"
            />
            <input
              className="field-input"
              value={navDestinationQuery}
              onFocus={() => setNavLookupTarget('destination')}
              onChange={(e) => setNavDestinationQuery(e.target.value)}
              onKeyDown={handleNavInputKeyDown}
              placeholder="Destination city/place"
            />
          </div>
          <div className="button-row top-gap">
            <button className="btn-secondary" type="button" onClick={() => searchPlaces(navStartQuery, 'start')}>
              Search Start
            </button>
            <button className="btn-primary" type="button" onClick={() => searchPlaces(navDestinationQuery, 'destination')}>
              Search Destination
            </button>
            <button className="btn-primary" type="button" onClick={handleStartToDestination}>
              Navigate
            </button>
          </div>
        </div>

        <label className="check-row">
          <input
            type="checkbox"
            checked={showHeatmap}
            onChange={(e) => setShowHeatmap(e.target.checked)}
            className="check-input"
          />
          Show Mood Heatmap
        </label>

        {(activePanelTab === 'route' || !isMobile) && (
          <div className="tab-content">
            <div className="nav-like-card">
              <div className="card-title">Find & Navigate</div>
              <div className="small-row">Auto-suggestions appear while typing.</div>
              <label className="field-label">Your Location</label>
              <div className="nav-input-row">
                <input
                  className="field-input"
                  value={navStartQuery}
                  onFocus={() => setNavLookupTarget('start')}
                  onChange={(e) => setNavStartQuery(e.target.value)}
                  onKeyDown={handleNavInputKeyDown}
                  placeholder="Search start place"
                />
                <button className="btn-secondary" type="button" onClick={() => searchPlaces(navStartQuery, 'start')}>
                  Search
                </button>
              </div>

              <label className="field-label">Choose Destination</label>
              <div className="nav-input-row">
                <input
                  className="field-input"
                  value={navDestinationQuery}
                  onFocus={() => setNavLookupTarget('destination')}
                  onChange={(e) => setNavDestinationQuery(e.target.value)}
                  onKeyDown={handleNavInputKeyDown}
                  placeholder="Search destination place"
                />
                <button className="btn-primary" type="button" onClick={() => searchPlaces(navDestinationQuery, 'destination')}>
                  Search
                </button>
              </div>

              <div className="nav-action-row">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    if (userLocation) {
                      setManualStartPoint({ lat: userLocation.lat, lon: userLocation.lon, label: 'My live location' });
                      setNavStartQuery('My live location');
                      setRouteActionMessage('Using your live location as start point.');
                    } else {
                      startTrackingLocation();
                      setNavNotice('Tracking your live location...');
                    }
                  }}
                >
                  Use Live Start
                </button>
                <button className="btn-primary" type="button" onClick={handleStartToDestination}>
                  Navigate Now
                </button>
              </div>

              {googleMapsDirectionsUrl && (
                <a className="panel-link" href={googleMapsDirectionsUrl} target="_blank" rel="noreferrer">
                  Open in Google Maps (turn-by-turn)
                </a>
              )}

              <div className="nav-chip-row">
                <button
                  type="button"
                  className="route-option-chip"
                  onClick={() => {
                    const place = destination
                      ? {
                        id: String(destination.id || `${destination.lat}-${destination.lon}-${destination.time}`),
                        label: destination.note || destination.name || 'Destination',
                        lat: Number(destination.lat),
                        lon: Number(destination.lon)
                      }
                      : null;
                    setFavoriteFromPlace('home', place);
                  }}
                >
                  Set Destination as Home
                </button>
                <button
                  type="button"
                  className="route-option-chip"
                  onClick={() => {
                    const place = destination
                      ? {
                        id: String(destination.id || `${destination.lat}-${destination.lon}-${destination.time}`),
                        label: destination.note || destination.name || 'Destination',
                        lat: Number(destination.lat),
                        lon: Number(destination.lon)
                      }
                      : null;
                    setFavoriteFromPlace('work', place);
                  }}
                >
                  Set Destination as Work
                </button>
              </div>

              <div className="nav-favorite-row">
                {favoritePlaces.home && (
                  <button type="button" className="nav-favorite-btn" onClick={() => applyPlaceResult(favoritePlaces.home, 'destination')}>
                    Home: {favoritePlaces.home.label}
                  </button>
                )}
                {favoritePlaces.work && (
                  <button type="button" className="nav-favorite-btn" onClick={() => applyPlaceResult(favoritePlaces.work, 'destination')}>
                    Work: {favoritePlaces.work.label}
                  </button>
                )}
              </div>

              {recentSearches.length > 0 && (
                <div className="nav-recent-wrap">
                  <div className="small-row">Recent Searches</div>
                  <div className="nav-chip-row">
                    {recentSearches.map((place) => (
                      <button key={`${place.id}-recent`} type="button" className="nav-recent-chip" onClick={() => applyPlaceResult(place, 'destination')}>
                        {place.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {navSearching && <div className="small-row top-gap">Searching places...</div>}
              {navNotice && <div className="small-row top-gap">{navNotice}</div>}
              {navResults.length > 0 && (
                <div className="nav-result-list">
                  {navResults.map((place) => (
                    <button key={place.id} type="button" className="nav-result-item" onClick={() => applyPlaceResult(place)}>
                      {place.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="field-label">
              Destination (Vibe Route)
            </label>
            <select className="field-input" value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
              <option value="">Select destination pin</option>
              {pins.map((p) => {
                const id = String(p.id || `${p.lat}-${p.lon}-${p.time}`);
                return (
                  <option key={id} value={id}>
                    {p.name || p.note || 'Untitled spot'} | {Number(p.ratings?.overall || 0).toFixed(1)}★ | {p.budget}
                  </option>
                );
              })}
            </select>


            <div className="route-cockpit">
              <div className="route-cockpit-head">
                <strong>Travel Profile</strong>
                <span>{activeRouteModeMeta.caption}</span>
              </div>
              <div className="route-mode-grid">
                {ROUTE_MODE_OPTIONS.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`route-mode-card ${routeMode === mode.id ? 'route-mode-card-active' : ''}`}
                    onClick={() => {
                      setRouteMode(mode.id);
                      setRoutePreset('custom');
                    }}
                  >
                    <div className="route-mode-title">{mode.label}</div>
                    <div className="route-mode-caption">{mode.caption}</div>
                  </button>
                ))}
              </div>

            </div>

            <div className="button-row">
              <button
                className="btn-secondary"
                onClick={() => {
                  setManualStartPoint({ lat: viewState.latitude, lon: viewState.longitude, label: 'Map center' });
                  setRouteActionMessage('Start point pinned to current map center.');
                }}
              >
                Set Start Here
              </button>
              <button className="btn-primary" onClick={handleStartToDestination}>
                Start to Destination
              </button>
            </div>

            <button className="btn-secondary full-width top-gap" onClick={handleSwapRouteEndpoints}>
              Swap Start/Destination
            </button>

            <button className="btn-primary full-width top-gap" onClick={handleFeelLost}>
              I Feel Lost - Generate Emotional GPS
            </button>

            <div className={`route-endpoints ${routeSwapPulse ? 'route-endpoints-pulse' : ''}`}>
              <div className="small-row">From: {effectiveStart.label}</div>
              <div className="small-row">To: {destination ? destination.note || `${destination.mood} destination` : 'Not selected'}</div>
              <div className="small-row">Mode: {activeRouteModeMeta.label}</div>
              <div className="small-row">Est. Distance: {estimatedRouteDistanceKm > 0 ? `${estimatedRouteDistanceKm.toFixed(2)} km` : 'Waiting for route'}</div>
              <div className="small-row">Est. Duration: {estimatedRouteDurationMin > 0 ? `${estimatedRouteDurationMin} min` : 'Waiting for route'}</div>
              {routeActionMessage && <div className="small-row top-gap">{routeActionMessage}</div>}
            </div>

            <div className="route-section">
              <strong>Suggested Vibe Route</strong>
              {routeAlgorithm && <div className="small-row top-gap">{routeAlgorithm}</div>}
              {routeNarrative && <div className="small-row top-gap">{routeNarrative}</div>}
              {routeSteps.length > 0 && (
                <div className="route-steps-card">
                  <div className="card-title">Turn-by-Turn Preview</div>
                  <ol className="route-steps-list">
                    {routeSteps.slice(0, 12).map((step) => (
                      <li key={`step-${step.index}-${step.instruction}`} className="route-steps-item">
                        <div>{step.instruction}</div>
                        <div className="route-steps-meta">
                          {Number(step.distanceKm || 0).toFixed(2)} km • {Math.max(1, Number(step.durationMin || 0))} min
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {destination && topRankedSpots.length > 0 && (
                <div className="route-ranking-card">
                  <div className="card-title">Top Ranked Spots (Live USP Formula)</div>
                  <div className="small-row">
                    score = (rating x 0.4) + (mood x 0.3) + (distance x 0.1) + (budget x 0.1) + (time x 0.1)
                  </div>
                  <div className="route-ranking-list">
                    {topRankedSpots.map(({ rank, spot }) => (
                      <div key={String(spot.id || `${spot.lat}-${spot.lon}-${spot.time}`)} className="route-ranking-item">
                        <div className="route-ranking-head">
                          <strong>#{rank} {spot.name || spot.note || 'Spot'}</strong>
                          <span>Score: {Number(spot.score || 0).toFixed(3)}</span>
                        </div>
                        <div className="route-metric">
                          <span>Rating (40%)</span>
                          <div className="route-metric-track"><i style={{ width: `${pctFromUnit(spot.scoreBreakdown?.rating)}%` }} /></div>
                          <span>{pctFromUnit(spot.scoreBreakdown?.rating)}%</span>
                        </div>
                        <div className="route-metric">
                          <span>Mood Match (30%)</span>
                          <div className="route-metric-track"><i style={{ width: `${pctFromUnit(spot.scoreBreakdown?.mood_match)}%` }} /></div>
                          <span>{pctFromUnit(spot.scoreBreakdown?.mood_match)}%</span>
                        </div>
                        <div className="route-metric">
                          <span>Distance (10%)</span>
                          <div className="route-metric-track"><i style={{ width: `${pctFromUnit(spot.scoreBreakdown?.distance_score)}%` }} /></div>
                          <span>{pctFromUnit(spot.scoreBreakdown?.distance_score)}%</span>
                        </div>
                        <div className="route-metric">
                          <span>Budget (10%)</span>
                          <div className="route-metric-track"><i style={{ width: `${pctFromUnit(spot.scoreBreakdown?.budget_match)}%` }} /></div>
                          <span>{pctFromUnit(spot.scoreBreakdown?.budget_match)}%</span>
                        </div>
                        <div className="route-metric">
                          <span>Time Fit (10%)</span>
                          <div className="route-metric-track"><i style={{ width: `${pctFromUnit(spot.scoreBreakdown?.time_match)}%` }} /></div>
                          <span>{pctFromUnit(spot.scoreBreakdown?.time_match)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}



              {destination && suggestedRoute.length ? (
                <ol className="route-list">
                  {suggestedRoute.map((p, index) => {
                    const key = String(p.id || `${p.lat}-${p.lon}-${p.time}`);
                    return (
                      <li key={key} className="route-item" style={{ animationDelay: `${index * 90}ms` }}>
                        {p.name || p.note || 'Memory spot'} • {Number(p.ratings?.overall || 0).toFixed(1)}★ • {p.budget}
                        {p.scoreBreakdown && (
                          <div className="route-score">
                            rating: {p.scoreBreakdown.rating.toFixed(2)} | mood: {p.scoreBreakdown.mood_match.toFixed(2)} | dist: {p.scoreBreakdown.distance_score.toFixed(2)} | budget: {p.scoreBreakdown.budget_match.toFixed(2)} | time: {p.scoreBreakdown.time_match.toFixed(2)}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="small-row top-gap">
                  Add vibe pins and select a destination to get an emotion-first route.
                </div>
              )}
            </div>
          </div>
        )}

        {(activePanelTab === 'climate' || !isMobile) && (
          <div className="tab-content">
            <label className="check-row">
              <input
                type="checkbox"
                checked={climateSafeMode}
                onChange={(e) => setClimateSafeMode(e.target.checked)}
                className="check-input"
              />
              Climate-Safe Routing
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                checked={avoidUnsafeZones}
                onChange={(e) => setAvoidUnsafeZones(e.target.checked)}
                className="check-input"
              />
              Avoid Unsafe Zones (separate from climate mode)
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                checked={vibeSyncMode}
                onChange={(e) => setVibeSyncMode(e.target.checked)}
                className="check-input"
              />
              Vibe-Sync Routing Engine
            </label>

            <div className="panel-card">
              <div className="card-title">Climate Risk Near View</div>
              <div className="small-row">Combined: {(climateRisk.combinedRisk * 100).toFixed(0)}%</div>
              <div className="small-row">Heat: {(climateRisk.heatRisk * 100).toFixed(0)}% | AQI: {(climateRisk.aqiRisk * 100).toFixed(0)}% | Flood: {(climateRisk.floodRisk * 100).toFixed(0)}%</div>
              {typeof climateRisk.temperatureC === 'number' && (
                <div className="small-row">Temp: {Math.round(climateRisk.temperatureC)}C{typeof climateRisk.usAqi === 'number' ? ` | US AQI: ${Math.round(climateRisk.usAqi)}` : ''}</div>
              )}
              <div className="small-row top-gap">{climateRisk.recommendation}</div>
            </div>

            {goldenHourInfo?.goldenMoment && (
              <div className="panel-card panel-card-golden">
                <div className="card-title">Golden Hour Tracker</div>
                <div className="small-row">
                  Best time: {new Date(goldenHourInfo.goldenMoment).toLocaleTimeString()}
                  {typeof goldenHourInfo.windSpeedKmh === 'number' ? ` | Wind: ${Math.round(goldenHourInfo.windSpeedKmh)} km/h` : ''}
                </div>
                <div className="small-row">{goldenHourInfo.message}</div>
              </div>
            )}
          </div>
        )}

        {(activePanelTab === 'story' || !isMobile) && (
          <div className="tab-content">
            <label className="check-row">
              <input
                type="checkbox"
                checked={storyModeEnabled}
                onChange={(e) => setStoryModeEnabled(e.target.checked)}
                className="check-input"
              />
              Story Mode (AI Vibe Narrative)
            </label>

            {storyNarrative && (
              <div className="panel-card panel-card-story">
                {storyNarrative}
              </div>
            )}

            {echoTrigger && (
              <div className="panel-card panel-card-highlight">
                <div className="card-title">Echoes Triggered</div>
                <div className="small-row">Near: {echoTrigger.note || 'Musical pin'} ({echoTrigger.distanceMeters}m)</div>
                <a href={echoTrigger.spotifyUrl} target="_blank" rel="noreferrer" className="panel-link">
                  Open track on Spotify
                </a>
              </div>
            )}
          </div>
        )}

        {(activePanelTab === 'biometrics' || !isMobile) && (
          <div className="tab-content">
            <div className="panel-card">
              <div className="card-title">Biometric Mood-Validation</div>
              <div className="metrics-grid">
                <input
                  className="field-input"
                  type="number"
                  placeholder="Baseline HRV"
                  value={biometricInput.baselineHrv}
                  onChange={(e) => setBiometricInput((p) => ({ ...p, baselineHrv: e.target.value }))}
                />
                <input
                  className="field-input"
                  type="number"
                  placeholder="Current HRV"
                  value={biometricInput.currentHrv}
                  onChange={(e) => setBiometricInput((p) => ({ ...p, currentHrv: e.target.value }))}
                />
                <input
                  className="field-input"
                  type="number"
                  placeholder="Baseline Stress"
                  value={biometricInput.baselineStress}
                  onChange={(e) => setBiometricInput((p) => ({ ...p, baselineStress: e.target.value }))}
                />
                <input
                  className="field-input"
                  type="number"
                  placeholder="Current Stress"
                  value={biometricInput.currentStress}
                  onChange={(e) => setBiometricInput((p) => ({ ...p, currentStress: e.target.value }))}
                />
              </div>
              <button className="btn-primary full-width top-gap" onClick={runBiometricValidation}>
                Validate Healing Spot
              </button>
              {biometricResult?.prompt && (
                <div className="small-row top-gap">{biometricResult.prompt}</div>
              )}
            </div>
          </div>
        )}

        <label className="check-row">
          <input
            type="checkbox"
            checked={voiceAlertEnabled}
            onChange={(e) => setVoiceAlertEnabled(e.target.checked)}
            className="check-input"
          />
          Voice alert on arrival
        </label>

        {distanceToDestination !== null && (
          <div className="small-row top-gap">
            Distance to destination: {distanceToDestination.toFixed(2)} km
          </div>
        )}

        {arrivalMessage && (
          <div className="arrival-banner">
            {arrivalMessage}
          </div>
        )}

        {(activePanelTab === 'settings' || !isMobile) && (
          <div className="tab-content">
            <div className="panel-card settings-card">
              <div className="card-title">Settings</div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={autoMoodSync}
                  onChange={(e) => setAutoMoodSync(e.target.checked)}
                  className="check-input"
                />
                Auto-sync current mood with AI prediction
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={narratorMode}
                  onChange={(e) => setNarratorMode(e.target.checked)}
                  className="check-input"
                />
                AI narrator guidance
              </label>
              <div className="settings-actions">
                <button type="button" className="btn-secondary" onClick={resetOnboarding}>
                  Reset Onboarding
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowIntro(true);
                    setSettingsNotice('Intro animation will play again.');
                  }}
                >
                  Replay Intro
                </button>
              </div>

              <div className="panel-card top-gap">
                <div className="card-title">Demo Testing Data</div>
                <div className="settings-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => loadDemoData(false)}
                  >
                    Load Demo Data
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => loadDemoData(true)}
                  >
                    Reset + Reload
                  </button>
                </div>
                {demoSeedStatus && <div className="small-row top-gap">{demoSeedStatus}</div>}
              </div>


              {settingsNotice && <div className="small-row top-gap">{settingsNotice}</div>}
            </div>
          </div>
        )}

          </div>
        )}

              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="map-fab-container">
          <button 
            className={`fab-btn fab-location ${watchId !== null ? 'fab-active' : ''}`}
            onClick={watchId !== null ? stopTrackingLocation : startTrackingLocation}
            title={watchId !== null ? 'Stop tracking' : 'Track My Location'}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
            </svg>
          </button>
          <button 
            className="fab-btn fab-directions" 
            onClick={() => {
              if (!isPanelExpanded) setIsPanelExpanded(true);
              setActivePanelTab('route');
              if (activeMenuSection !== 'dashboard') setActiveMenuSection('dashboard');
            }} 
            title="Directions"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <polyline points="15 10 20 15 15 20"></polyline>
              <path d="M4 4v7a4 4 0 0 0 4 4h12"></path>
            </svg>
          </button>
        </div>
      </div>

      {routeFeedbackPrompt.open && (
        <div className="coach-overlay" role="dialog" aria-modal="true" aria-label="Route mood feedback">
          <div className="coach-card">
            <div className="coach-title">Route Feedback</div>
            <div className="coach-copy">Did this route improve your mood?</div>
            <label className="field-label">Mood before</label>
            <select
              className="field-input"
              value={routeFeedbackPrompt.beforeMood}
              onChange={(e) => setRouteFeedbackPrompt((prev) => ({ ...prev, beforeMood: e.target.value }))}
            >
              {SMART_MOOD_TAGS.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>

            <label className="field-label">Mood after</label>
            <select
              className="field-input"
              value={routeFeedbackPrompt.afterMood}
              onChange={(e) => setRouteFeedbackPrompt((prev) => ({ ...prev, afterMood: e.target.value }))}
            >
              {SMART_MOOD_TAGS.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>

            <label className="field-label">Improvement score: {routeFeedbackPrompt.improvementScore}</label>
            <input
              className="field-input"
              type="range"
              min="1"
              max="5"
              step="1"
              value={routeFeedbackPrompt.improvementScore}
              onChange={(e) => setRouteFeedbackPrompt((prev) => ({ ...prev, improvementScore: Number(e.target.value) }))}
            />

            <div className="coach-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setRouteFeedbackPrompt((prev) => ({ ...prev, open: false }))}
              >
                Later
              </button>
              <button type="button" className="btn-primary" onClick={submitRouteFeedback}>
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {showCoach && (
        <div className="coach-overlay" role="dialog" aria-modal="true" aria-label="Onboarding">
          <div className="coach-card">
            <div className="coach-title">Welcome to {APP_NAME}</div>
            <div className="coach-step">Step {coachStep + 1} of {coachTips.length}</div>
            <p className="coach-copy">{coachTips[coachStep]}</p>
            <div className="coach-actions">
              <button type="button" className="btn-secondary" onClick={completeOnboarding}>Skip</button>
              {coachStep > 0 && (
                <button type="button" className="btn-secondary" onClick={() => setCoachStep((s) => Math.max(0, s - 1))}>Back</button>
              )}
              {coachStep < coachTips.length - 1 ? (
                <button type="button" className="btn-primary" onClick={() => setCoachStep((s) => Math.min(coachTips.length - 1, s + 1))}>Next</button>
              ) : (
                <button type="button" className="btn-primary" onClick={completeOnboarding}>Start Exploring</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
