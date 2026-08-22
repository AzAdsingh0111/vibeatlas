import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, Popup, Source } from 'react-map-gl';
import maplibregl from 'maplibre-gl';
import { AnimatePresence, motion } from 'framer-motion';
import '@maptiler/sdk/dist/maptiler-sdk.css';
import './App.css';
import Login from './Login';
import GuideBot from './GuideBot';

if (typeof window !== 'undefined') {
  window.maplibregl = maplibregl;
  window.mapboxgl = maplibregl;
}

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
const INTRO_SEEN_KEY = 'personal-cartographer-intro-seen';
const ONBOARDING_KEY = 'personal-cartographer-onboarding-complete';
const PROFILE_KEY = 'personal-cartographer-profile';
const ROUTE_PROFILES_KEY = 'personal-cartographer-route-profiles';
const RECENT_SEARCHES_KEY = 'personal-cartographer-recent-searches';
const FAVORITE_PLACES_KEY = 'personal-cartographer-favorite-places';
const AUTH_KEY = 'personal-cartographer-auth';

function userStorageKey(key, email = '') {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  return normalizedEmail ? `${key}:user:${encodeURIComponent(normalizedEmail)}` : `${key}:guest`;
}

function readUserStorage(key, email, fallback) {
  try {
    const saved = localStorage.getItem(userStorageKey(key, email));
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}
// In development, CRA proxies /api requests to the local Express server. Set this
// to an absolute URL only when the frontend and API are deployed separately.
// Probe fallback ports at boot (backend sequential fallback: 3001,3002,3003,3010)
// to avoid "Unexpected token '<!DOCTYPE'" when backend lands on a sibling port.
const BACKEND_PORT_CANDIDATES = [3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010, 3011];
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
// let BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || import.meta.env.VITE_API_BASE_URL || 'https://vibeatlas-backend.onrender.com' ||'').replace(/\/$/, '') || 'http://localhost:3001';
let BACKEND_URL = 'https://vibeatlas-backend.onrender.com';
const resolveBackendUrl = async () => {
  if (IS_PRODUCTION && BACKEND_URL) return BACKEND_URL;
  for (const p of BACKEND_PORT_CANDIDATES) {
    try {
      const res = await fetch(`http://localhost:${p}/api/health`, {
        method: 'GET',
        mode: 'cors'
      }).catch(() => null);
      if (res && res.ok) {
        BACKEND_URL = `http://localhost:${p}`;
        return BACKEND_URL;
      }
    } catch {
      // try next
    }
  }
  return BACKEND_URL || 'http://localhost:3001';
};

const withBackendFetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  const isLocalhostApi = /^https?:\/\/localhost:\d+\/api\//i.test(url) ||
    (typeof input === 'string' && /^\/api\//i.test(input) && /^https?:\/\/localhost/i.test(BACKEND_URL));
  if (!isLocalhostApi) {
    return fetch(input, init);
  }
  return (async () => {
    await resolveBackendUrl();
    let realInput;
    if (typeof input === 'string' && /^\/api\//i.test(input)) {
      realInput = BACKEND_URL + input;
    } else if (typeof input === 'string') {
      realInput = input.replace(/^(https?:\/\/localhost:)\d+(\/api\/.*)$/i, (_, protoHost, rest) => BACKEND_URL + rest);
    } else {
      realInput = input;
    }
    const resp = await fetch(realInput, init);
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('text/html') && /^https?:\/\/localhost/i.test(BACKEND_URL)) {
      const base = await resolveBackendUrl();
      const retryInput = typeof realInput === 'string'
        ? realInput.replace(/^(https?:\/\/localhost:)\d+(\/api\/.*)$/i, (_, ph, rest) => base + rest)
        : realInput;
      return fetch(retryInput, init);
    }
    return resp;
  })();
};

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

function createDefaultVibeProfile() {
  return {
    streakDays: 0,
    lastVisitDate: '',
    calmVisits: 0,
    uniquePlaces: 0,
    badges: [],
    unlockedPlaylists: [],
    dailyChallenge: { title: 'Visit 3 calm spots', progress: 0, target: 3, completed: false, dateKey: getDateKey() }
  };
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

const CASE_TYPES = Object.freeze({
  ROUTE: 'route_recommendation',
  PIN_SAVE: 'pin_save',
  FAVORITE: 'favorite_toggle',
  MOOD_SELECT: 'mood_selection'
});

const CASE_STATUS = Object.freeze({
  OPEN: 'open',
  EXCEPTION: 'exception',
  RESOLVED: 'resolved',
  CLOSED: 'closed'
});

const EXCEPTION_CODES = Object.freeze({
  MISSING_BUDGET: 'E_MISSING_BUDGET',
  MISSING_LOCATION: 'E_MISSING_LOCATION',
  MISSING_MOOD: 'E_MISSING_MOOD',
  INVALID_RATING: 'E_INVALID_RATING',
  EMPTY_NAME: 'E_EMPTY_NAME',
  NO_VISIBLE_PINS: 'E_NO_VISIBLE_PINS',
  UNKNOWN: 'E_UNKNOWN'
});

const CaseIsolation = (() => {
  const BuiltInMap = globalThis.Map;
  const BuiltInSet = globalThis.Set;
  const registry = new BuiltInMap();
  const listeners = new BuiltInSet();
  let counter = 0;
  const nextId = (type) => `case_${Date.now().toString(36)}_${(++counter).toString(36)}_${String(type || 'generic').slice(0, 6)}`;

  const emit = () => listeners.forEach((fn) => { try { fn(CaseIsolation.snapshot()); } catch {} });
  const validateInput = (raw, schema) => {
    const issues = [];
    const structured = {};
    const required = schema?.required || [];
    const defaults = schema?.defaults || {};
    const types = schema?.types || {};
    required.forEach((key) => {
      const value = raw?.[key];
      if (value === undefined || value === null || value === '' || (typeof value === 'number' && !Number.isFinite(value))) {
        issues.push({ key, code: `E_MISSING_${String(key).toUpperCase()}`, message: `Missing required field: ${key}` });
      }
    });
    Object.keys({ ...defaults, ...(raw || {}) }).forEach((key) => {
      const rawValue = raw?.[key];
      let value = rawValue;
      if ((value === undefined || value === null || value === '') && Object.prototype.hasOwnProperty.call(defaults, key)) {
        value = typeof defaults[key] === 'function' ? defaults[key]() : defaults[key];
      }
      const expectedType = types[key];
      if (expectedType && value !== undefined && value !== null) {
        if (expectedType === 'number') {
          const n = Number(value);
          if (!Number.isFinite(n)) issues.push({ key, code: EXCEPTION_CODES.UNKNOWN, message: `Field "${key}" expected number, got ${typeof value}` });
          else value = n;
        } else if (expectedType === 'string') value = String(value);
        else if (expectedType === 'boolean') value = Boolean(value);
        else if (expectedType === 'array' && !Array.isArray(value)) value = [value];
      }
      structured[key] = value;
    });
    return { structured, issues };
  };

  return {
    createCase({ type, label, owner, rawInput, schema }) {
      const id = nextId(type);
      const { structured, issues } = validateInput(rawInput, schema);
      const status = issues.length > 0 ? CASE_STATUS.EXCEPTION : CASE_STATUS.OPEN;
      const entry = Object.freeze({
        id,
        type: type || CASE_TYPES.ROUTE,
        label: label || `Case ${id.slice(-6)}`,
        owner: owner || 'guest',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status,
        rawInput: Object.freeze({ ...(rawInput || {}) }),
        structured: Object.freeze(structured),
        schema: Object.freeze({ required: schema?.required || [], defaults: schema?.defaults || {}, types: schema?.types || {} }),
        exceptions: Object.freeze([...issues]),
        decisions: [],
        closed: false,
        closedAt: null,
        _scratch: {}
      });
      registry.set(id, entry);
      emit();
      return { id, status, structured, exceptions: issues };
    },
    recordDecision(caseId, decision) {
      const prev = registry.get(caseId);
      if (!prev) return null;
      const next = {
        ...prev,
        updatedAt: new Date().toISOString(),
        decisions: [...prev.decisions, Object.freeze({ id: `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, ts: new Date().toISOString(), ...(decision || {}) })]
      };
      registry.set(caseId, Object.freeze(next));
      emit();
      return next;
    },
    escalate(caseId, { code, message, recoverable = true, remediation = null }) {
      const prev = registry.get(caseId);
      if (!prev) return null;
      const exception = { code: code || EXCEPTION_CODES.UNKNOWN, message: message || 'Unknown error', recoverable: Boolean(recoverable), remediation };
      const next = {
        ...prev,
        updatedAt: new Date().toISOString(),
        status: CASE_STATUS.EXCEPTION,
        exceptions: Object.freeze([...prev.exceptions, exception])
      };
      registry.set(caseId, Object.freeze(next));
      emit();
      return next;
    },
    resolve(caseId, { message = null, applyStructuredPatch = null } = {}) {
      const prev = registry.get(caseId);
      if (!prev) return null;
      let nextStructured = prev.structured;
      if (applyStructuredPatch) {
        nextStructured = Object.freeze({ ...prev.structured, ...applyStructuredPatch });
      }
      const next = {
        ...prev,
        updatedAt: new Date().toISOString(),
        status: CASE_STATUS.RESOLVED,
        structured: nextStructured,
        decisions: [...prev.decisions, Object.freeze({ id: `d_${Date.now().toString(36)}_resolve`, ts: new Date().toISOString(), type: 'resolve', message, patch: applyStructuredPatch || null })]
      };
      registry.set(caseId, Object.freeze(next));
      emit();
      return next;
    },
    closeCase(caseId) {
      const prev = registry.get(caseId);
      if (!prev) return null;
      const next = { ...prev, updatedAt: new Date().toISOString(), closed: true, closedAt: new Date().toISOString(), status: CASE_STATUS.CLOSED };
      registry.set(caseId, Object.freeze(next));
      emit();
      return next;
    },
    getCase(caseId) { return registry.get(caseId) || null; },
    hasCase(caseId) { return registry.has(caseId); },
    snapshot() {
      return Object.freeze({
        total: registry.size,
        open: [...registry.values()].filter((c) => c.status === CASE_STATUS.OPEN).length,
        exceptions: [...registry.values()].filter((c) => c.status === CASE_STATUS.EXCEPTION).length,
        resolved: [...registry.values()].filter((c) => c.status === CASE_STATUS.RESOLVED).length,
        closed: [...registry.values()].filter((c) => c.closed).length,
        cases: [...registry.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      });
    },
    onChange(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
})();

function extractCaseDecisionStructured(caseEntry) {
  return caseEntry?.structured || {};
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
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return localStorage.getItem(INTRO_SEEN_KEY) !== 'true';
    } catch {
      return true;
    }
  });
  const [activeView, setActiveView] = useState(() => {
    const path = typeof window !== 'undefined' ? window.location.pathname : '/';
    if (path === '/explore') return 'explore';
    if (path === '/admin') return 'admin';
    if (path === '/user' || path === '/dashboard' || path === '/profile') return 'user';
    return 'landing';
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalReason, setAuthModalReason] = useState('');
  const protectedActionRef = useRef(null);
  const dataOwnerRef = useRef('');
  const [pins, setPins] = useState([]);
  const [tempPin, setTempPin] = useState(null);
  const [tempPinShowAdvanced, setTempPinShowAdvanced] = useState(false);
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
  const locationWatchRef = useRef(null);
  const locationRequestInFlightRef = useRef(false);
  const [locationError, setLocationError] = useState('');
  const [isMapCenteredOnUser, setIsMapCenteredOnUser] = useState(false);
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
  const [mapRouteTarget, setMapRouteTarget] = useState('destination');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
  const [boards, setBoards] = useState([]);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [selectedBoardItems, setSelectedBoardItems] = useState([]);
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [isEditingBoard, setIsEditingBoard] = useState(false);
  const [boardForm, setBoardForm] = useState({ name: '', description: '' });
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [boardActionError, setBoardActionError] = useState('');
  const [addPinToBoardTarget, setAddPinToBoardTarget] = useState(null);
  const [selectedBoardForPin, setSelectedBoardForPin] = useState('');
  const [editingPin, setEditingPin] = useState(null);
  const [pinEditForm, setPinEditForm] = useState({ name: '', note: '', mood: 'Calm', budget: 'medium', song: '' });
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

  const [caseMonitorSnapshot, setCaseMonitorSnapshot] = useState(() => CaseIsolation.snapshot());
  useEffect(() => {
    const off = CaseIsolation.onChange((snap) => setCaseMonitorSnapshot(snap));
    return off;
  }, []);
  const caseMonitorExpanded = caseMonitorSnapshot.exceptions > 0;

  useEffect(() => {
    if (!tempPin || !mapReady) return undefined;
    let cancelled = false;
    const run = async () => {
      const map = mapRef.current?.getMap?.();
      if (!map || cancelled) return;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (cancelled) return;
      const canvas = map.getCanvas?.();
      const rect = canvas?.getBoundingClientRect?.();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      const pinPx = map.project?.([Number(tempPin.lng), Number(tempPin.lat)]);
      if (!pinPx) return;
      let insetTop = 72;
      let insetRight = 24;
      let insetBottom = 96;
      let insetLeft = 24;
      try {
        const w = window.innerWidth;
        if (w < 768) {
          insetBottom = Math.round(rect.height * 0.52) + 16;
          insetTop = 80;
          insetLeft = 16;
          insetRight = 16;
        } else {
          const formRight = rect.width - 28;
          const formLeft = formRight - 380;
          const formTop = 80;
          const formBottom = formTop + Math.min(rect.height - 160, 640);
          if (pinPx.x >= formLeft - 12 && pinPx.x <= formRight + 12 && pinPx.y >= formTop - 24 && pinPx.y <= formBottom + 24) {
            insetRight = Math.round(rect.width - formLeft + 32);
            if (formTop > 0) insetTop = Math.max(insetTop, formBottom - 120);
          }
        }
      } catch {
        // skip custom inset adjustments
      }
      const inset = [insetTop, insetRight, insetBottom, insetLeft];
      try {
        const { lng, lat } = map.unproject?.([pinPx.x, pinPx.y]) || {};
        if (lng === undefined) return;
        const padCenter = map.cameraForBounds?.([[lng, lat], [lng, lat]], {
          padding: { top: insetTop, right: insetRight, bottom: insetBottom, left: insetLeft },
          offset: [0, 0]
        });
        if (padCenter?.center) {
          const current = map.getCenter?.();
          const dz = (padCenter.center.lng - current.lng);
          const dlat = (padCenter.center.lat - current.lat);
          if (Math.abs(dz) > 0.0001 || Math.abs(dlat) > 0.0001) {
            map.easeTo?.({
              center: [padCenter.center.lng, padCenter.center.lat],
              duration: 380,
              easing: (t) => 1 - Math.pow(1 - t, 3)
            });
          }
          return;
        }
        const safeLeft = insetLeft;
        const safeRight = rect.width - insetRight;
        const safeTop = insetTop;
        const safeBottom = rect.height - insetBottom;
        if (pinPx.x < safeLeft || pinPx.x > safeRight || pinPx.y < safeTop || pinPx.y > safeBottom) {
          const clampedX = Math.max(safeLeft + 24, Math.min(safeRight - 24, pinPx.x));
          const clampedY = Math.max(safeTop + 24, Math.min(safeBottom - 24, pinPx.y));
          const dx = clampedX - pinPx.x;
          const dy = clampedY - pinPx.y;
          map.panBy?.([dx, dy], { duration: 380, easing: (t) => 1 - Math.pow(1 - t, 3) });
        }
      } catch {
        // no-op
      }
      void inset;
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [tempPin, mapReady, tempPinShowAdvanced]);

  /* ---------------- Redesigned floating UI state ---------------- */
  const [floatingSearchFocused, setFloatingSearchFocused] = useState(false);
  const [floatingSearchQuery, setFloatingSearchQuery] = useState('');
  const [floatingPlaceResults, setFloatingPlaceResults] = useState([]);
  const [floatingSearching, setFloatingSearching] = useState(false);
  const [activeFloatingCategory, setActiveFloatingCategory] = useState('');
  const [showOptionsPanel, setShowOptionsPanel] = useState(false);
  const [showFloatingSheet, setShowFloatingSheet] = useState(false);
  const [popupShowMore, setPopupShowMore] = useState(false);
  const floatingSearchTimerRef = useRef(null);
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
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', role: 'Explorer' });
  const [authNotice, setAuthNotice] = useState('');
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminData, setAdminData] = useState({ stats: null, users: [], auditLogs: [] });
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminTab, setAdminTab] = useState('overview');
  const [adminUserSearch, setAdminUserSearch] = useState('');
  const [adminPinSearch, setAdminPinSearch] = useState('');
  const [adminMoodFilter, setAdminMoodFilter] = useState('All');
  const [adminAuditSearch, setAdminAuditSearch] = useState('');
  const [adminAllVibes, setAdminAllVibes] = useState([]);
  const [adminAllBoards, setAdminAllBoards] = useState([]);
  const [adminCleaningSessions, setAdminCleaningSessions] = useState(false);
  const [selectedAdminUser, setSelectedAdminUser] = useState(null);
  const [adminInspectorLoading, setAdminInspectorLoading] = useState(false);
  const [adminInspectorTab, setAdminInspectorTab] = useState('pins');
  const [userPanelTab, setUserPanelTab] = useState('pins');
  const [userPanelSearch, setUserPanelSearch] = useState('');
  const [userPanelMoodFilter, setUserPanelMoodFilter] = useState('All');
  const [userEditName, setUserEditName] = useState('');
  const [userSavingProfile, setUserSavingProfile] = useState(false);
  const [userHistoryList, setUserHistoryList] = useState([]);
  const [vibeProfile, setVibeProfile] = useState(() => {
    return createDefaultVibeProfile();
  });
  const [, setDailyChallenge] = useState(() =>
    vibeProfile?.dailyChallenge || { title: 'Visit 3 calm spots', progress: 0, target: 3, completed: false, dateKey: getDateKey() }
  );
  const travelRef = useRef(null);
  const announcedZoneRef = useRef('');

  const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 900 : false;

  const navigateToView = useCallback((nextView) => {
    if (nextView !== 'landing' && nextView !== 'explore' && nextView !== 'admin' && nextView !== 'user') return;
    const targetPath = nextView === 'explore' ? '/explore' : nextView === 'admin' ? '/admin' : nextView === 'user' ? '/user' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    setActiveView(nextView);
  }, []);

  const openAuthModalFor = useCallback((reason, action) => {
    setAuthModalReason(reason || 'Login required to continue with this feature.');
    protectedActionRef.current = typeof action === 'function' ? action : null;
    setShowAuthModal(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setShowAuthModal(false);
    protectedActionRef.current = null;
    setAuthModalReason('');
  }, []);

  const completeAuthModalFlow = useCallback(() => {
    setShowAuthModal(false);
    const pendingAction = protectedActionRef.current;
    protectedActionRef.current = null;
    setAuthModalReason('');
    if (typeof pendingAction === 'function') pendingAction();
  }, []);

  useEffect(() => {
    if (!savedPinDebug) return undefined;
    const timer = setTimeout(() => setSavedPinDebug(null), 9000);
    return () => clearTimeout(timer);
  }, [savedPinDebug]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const isGoogleAuth = window.location.pathname.includes('/auth/google') || params.has('scope') || params.has('authuser');
    if (code && isGoogleAuth) {
      (async () => {
        try {
          setAuthNotice('Completing Google authentication...');
          const res = await withBackendFetch(`${BACKEND_URL}/api/auth/google/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
          });
          const data = await res.json();
          if (res.ok && data.token) {
            setAuthState({
              isLoggedIn: true,
              token: data.token,
              name: data.user?.name || data.user?.email?.split('@')[0] || 'Explorer',
              email: data.user?.email || '',
              role: data.user?.role || 'Explorer'
            });
            setAuthNotice(`Logged in as ${data.user?.email}`);
            window.history.replaceState({}, document.title, window.location.pathname.replace(/\/auth\/google\/callback/i, '/'));
          } else {
            setAuthNotice(`Google login failed: ${data.error || 'Authentication error'}`);
          }
        } catch (err) {
          setAuthNotice(`Google login failed: ${err.message}`);
        }
      })();
    }
  }, []);

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
    if (!showIntro) {
      try {
        localStorage.setItem(INTRO_SEEN_KEY, 'true');
      } catch {
        // no-op
      }
      return undefined;
    }
    const timer = setTimeout(() => setShowIntro(false), 1500);
    return () => clearTimeout(timer);
  }, [showIntro]);

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      setActiveView(path === '/explore' ? 'explore' : 'landing');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (showIntro) return;
    if (window.location.pathname === '/explore') {
      setActiveView('explore');
      return;
    }

    try {
      const hasSeenIntro = localStorage.getItem(INTRO_SEEN_KEY) === 'true';
      if (hasSeenIntro) navigateToView('explore');
    } catch {
      // no-op
    }
  }, [showIntro, navigateToView]);

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
      if (authState.isLoggedIn && authState.email && dataOwnerRef.current === authState.email) localStorage.setItem(userStorageKey(PROFILE_KEY, authState.email), JSON.stringify(vibeProfile));
    } catch {
      // no-op
    }
  }, [vibeProfile, authState.isLoggedIn, authState.email]);

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
      if (authState.isLoggedIn && authState.email && dataOwnerRef.current === authState.email) localStorage.setItem(userStorageKey(ROUTE_PROFILES_KEY, authState.email), JSON.stringify(routeProfiles));
    } catch {
      // no-op
    }
  }, [routeProfiles, authState.isLoggedIn, authState.email]);

  useEffect(() => {
    try {
      if (authState.isLoggedIn && authState.email && dataOwnerRef.current === authState.email) localStorage.setItem(userStorageKey(RECENT_SEARCHES_KEY, authState.email), JSON.stringify(recentSearches));
    } catch {
      // no-op
    }
  }, [recentSearches, authState.isLoggedIn, authState.email]);

  useEffect(() => {
    try {
      if (authState.isLoggedIn && authState.email && dataOwnerRef.current === authState.email) localStorage.setItem(userStorageKey(FAVORITE_PLACES_KEY, authState.email), JSON.stringify(favoritePlaces));
    } catch {
      // no-op
    }
  }, [favoritePlaces, authState.isLoggedIn, authState.email]);

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
        const res = await withBackendFetch(`${BACKEND_URL}/api/auth/me`, {
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

  const loadBoards = useCallback(async () => {
    if (!authState.token) {
      setBoards([]);
      return;
    }
    setBoardsLoading(true);
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/boards`, {
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.boards)) {
        setBoards(data.boards);
      }
    } catch {
      // Backend unavailable or error
    } finally {
      setBoardsLoading(false);
    }
  }, [authState.token]);

  const handleCreateBoard = async (e) => {
    e?.preventDefault?.();
    if (!boardForm.name.trim()) return;
    if (!authState.token) {
      openAuthModalFor('Login to create boards.', () => handleCreateBoard());
      return;
    }
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authState.token}` },
        body: JSON.stringify({ name: boardForm.name.trim(), description: boardForm.description.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create board');
      setBoards((prev) => [data.board, ...prev]);
      setIsCreatingBoard(false);
      setBoardForm({ name: '', description: '' });
      setAuthNotice(`Board "${data.board.name}" created.`);
    } catch (err) {
      setBoardActionError(err.message);
    }
  };

  const handleOpenBoard = async (board) => {
    setSelectedBoard(board);
    setBoardActionError('');
    if (!authState.token) return;
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/boards/${board.id}`, {
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedBoard(data.board);
        setSelectedBoardItems(data.items || []);
      }
    } catch (err) {
      setBoardActionError(err.message);
    }
  };

  const handleUpdateBoard = async (e) => {
    e?.preventDefault?.();
    if (!selectedBoard || !boardForm.name.trim()) return;
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/boards/${selectedBoard.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authState.token}` },
        body: JSON.stringify({ name: boardForm.name.trim(), description: boardForm.description.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update board');
      setBoards((prev) => prev.map((b) => (b.id === data.board.id ? { ...b, ...data.board } : b)));
      setSelectedBoard((prev) => (prev ? { ...prev, ...data.board } : null));
      setIsEditingBoard(false);
      setAuthNotice('Board updated.');
    } catch (err) {
      setBoardActionError(err.message);
    }
  };

  const handleDeleteBoard = async (boardId) => {
    if (!window.confirm('Are you sure you want to delete this board and its saved items?')) return;
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/boards/${boardId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      if (!res.ok) throw new Error('Failed to delete board');
      setBoards((prev) => prev.filter((b) => b.id !== boardId));
      if (selectedBoard?.id === boardId) {
        setSelectedBoard(null);
        setSelectedBoardItems([]);
      }
      setAuthNotice('Board deleted.');
    } catch (err) {
      setBoardActionError(err.message);
    }
  };

  const handleAddPinToBoard = async (pin, boardId) => {
    if (!authState.token) {
      openAuthModalFor('Login to add places to boards.', () => handleAddPinToBoard(pin, boardId));
      return;
    }
    const targetBoardId = boardId || selectedBoardForPin;
    if (!targetBoardId) {
      setBoardActionError('Please select a board');
      return;
    }
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/boards/${targetBoardId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authState.token}` },
        body: JSON.stringify({
          vibeId: pin.id && !String(pin.id).startsWith('notion_') ? pin.id : null,
          title: pin.name || pin.note || 'Saved Place',
          note: pin.note || '',
          mood: pin.mood || '',
          lat: pin.lat,
          lon: pin.lon
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add place to board');
      setBoards((prev) => prev.map((b) => (b.id === Number(targetBoardId) ? { ...b, item_count: (b.item_count || 0) + 1 } : b)));
      if (selectedBoard?.id === Number(targetBoardId)) {
        setSelectedBoardItems((prev) => [...prev, data.item]);
      }
      setAddPinToBoardTarget(null);
      setSelectedBoardForPin('');
      setAuthNotice(`Added "${pin.name || 'Place'}" to board.`);
    } catch (err) {
      setBoardActionError(err.message);
    }
  };

  const handleRemoveBoardItem = async (itemId) => {
    if (!selectedBoard) return;
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/boards/${selectedBoard.id}/items/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      if (!res.ok) throw new Error('Failed to remove item');
      setSelectedBoardItems((prev) => prev.filter((item) => item.id !== itemId));
      setBoards((prev) => prev.map((b) => (b.id === selectedBoard.id ? { ...b, item_count: Math.max(0, (b.item_count || 1) - 1) } : b)));
      setAuthNotice('Removed from board.');
    } catch (err) {
      setBoardActionError(err.message);
    }
  };

  const handleOpenEditPin = (pin) => {
    if (!authState.token) {
      openAuthModalFor('Login to edit pins.', () => handleOpenEditPin(pin));
      return;
    }
    setEditingPin(pin);
    setPinEditForm({
      name: pin.name || '',
      note: pin.note || '',
      mood: pin.mood || 'Calm',
      budget: pin.budget || 'medium',
      song: pin.song || ''
    });
  };

  const handleSavePinEdit = async (e) => {
    e?.preventDefault?.();
    if (!editingPin || !authState.token) return;
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/vibes/${editingPin.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authState.token}` },
        body: JSON.stringify({
          name: pinEditForm.name.trim() || 'Untitled Spot',
          note: pinEditForm.note.trim() || 'No note',
          mood: pinEditForm.mood,
          budget: pinEditForm.budget,
          song: pinEditForm.song.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update pin');
      const updated = normalizePin(data);
      setPins((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setSelectedPin(updated);
      setEditingPin(null);
      setAuthNotice('Pin updated successfully.');
    } catch (err) {
      setAuthNotice(`Edit failed: ${err.message}`);
    }
  };

  const handleDeletePin = async (pinId) => {
    if (!authState.token) {
      openAuthModalFor('Login to delete pins.', () => handleDeletePin(pinId));
      return;
    }
    if (!window.confirm('Are you sure you want to delete this vibe pin?')) return;
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/vibes/${pinId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      if (!res.ok) throw new Error('Failed to delete pin');
      setPins((prev) => prev.filter((p) => p.id !== pinId));
      if (selectedPin?.id === pinId) {
        setSelectedPin(null);
      }
      setAuthNotice('Pin deleted.');
    } catch (err) {
      setAuthNotice(`Delete failed: ${err.message}`);
    }
  };

  const loadSavedPlaces = useCallback(async () => {
    if (!authState.token) {
      setFavoritePlaces({ home: null, work: null });
      return;
    }
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/saved-places`, {
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.places)) {
        const homePlace = data.places.find((p) => p.slot === 'home');
        const workPlace = data.places.find((p) => p.slot === 'work');
        setFavoritePlaces({
          home: homePlace ? { label: homePlace.label, lat: homePlace.lat, lon: homePlace.lon, address: homePlace.address } : null,
          work: workPlace ? { label: workPlace.label, lat: workPlace.lat, lon: workPlace.lon, address: workPlace.address } : null
        });
      }
    } catch {
      // Backend offline
    }
  }, [authState.token]);

  const loadUserPreferences = useCallback(async () => {
    if (!authState.token) return;
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/preferences`, {
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      const data = await res.json();
      if (res.ok && data.preferences) {
        const p = data.preferences;
        if (p.default_mood && MOODS.includes(p.default_mood)) setCurrentMood(p.default_mood);
        if (p.route_mode) setRouteMode(p.route_mode);
        if (p.budget) setUserBudget(p.budget);
        if (p.prefer_scenic !== undefined) setPreferScenicRoute(Boolean(p.prefer_scenic));
        if (p.minimize_stops !== undefined) setMinimizeStopsRoute(Boolean(p.minimize_stops));
        if (p.return_to_start !== undefined) setReturnToStartRoute(Boolean(p.return_to_start));
        if (p.max_stops) setRouteMaxStops(p.max_stops);
      }
    } catch {
      // Backend offline
    }
  }, [authState.token]);

  const loadRouteProfilesFromBackend = useCallback(async () => {
    if (!authState.token) return;
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/route-profiles`, {
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.profiles)) {
        setRouteProfiles(data.profiles.map((p) => ({ id: p.id, name: p.name, ...p.settings })));
      }
    } catch {
      // Backend offline
    }
  }, [authState.token]);

  useEffect(() => {
    if (!authState.isLoggedIn || !authState.email) {
      dataOwnerRef.current = '';
      setPins([]);
      setBoards([]);
      setSelectedBoard(null);
      setSelectedBoardItems([]);
      setRouteProfiles([]);
      setFavoritePlaces({ home: null, work: null });
      return;
    }
    dataOwnerRef.current = authState.email;
    loadBoards();
    loadSavedPlaces();
    loadUserPreferences();
    loadRouteProfilesFromBackend();
  }, [authState.isLoggedIn, authState.email, loadBoards, loadSavedPlaces, loadUserPreferences, loadRouteProfilesFromBackend]);

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

  useEffect(() => () => {
    if (locationWatchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
  }, []);

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
    let cancelled = false;
    const loadVibes = async () => {
      if (!authState.token) {
        setPins([]);
        return;
      }
      try {
        const [vibesRes, notionRes] = await Promise.allSettled([
          withBackendFetch(`${BACKEND_URL}/api/vibes`, { headers: authHeaders }),
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

        if (!cancelled) {
          const normalized = mergedIncoming.map((p) => normalizePin(p));
          const seenIds = new Set();
          const merged = [];
          normalized.forEach((item) => {
            const id = String(item.id || `${item.lat}-${item.lon}-${item.time}`);
            if (!seenIds.has(id)) {
              seenIds.add(id);
              merged.push(item);
            }
          });
          setPins(merged);
        }
      } catch {
        // Backend optional fallback
      }
    };
    loadVibes();
    return () => { cancelled = true; };
  }, [authState.token]);

  useEffect(() => {
    const loadHeatmap = async () => {
      try {
        const moodQuery = activeMoodFilter !== 'All' ? `?mood=${encodeURIComponent(activeMoodFilter)}` : '';
        const response = await fetch(`${BACKEND_URL}/api/vibes/heatmap${moodQuery}`, { headers: authHeaders });
        if (!response.ok) return;
        const data = await response.json();
        setHeatmapPoints(Array.isArray(data) ? data : []);
      } catch {
        setHeatmapPoints([]);
      }
    };
    loadHeatmap();
  }, [pins.length, activeMoodFilter, authState.token]);

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
    if (!authState.isLoggedIn) {
      openAuthModalFor('Please login to add a new vibe pin.', placePinFromMenu);
      return;
    }
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

    if (mapRouteTarget === 'start' || mapRouteTarget === 'destination') {
      const label = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      applyPlaceResult({ id: `map_${Date.now()}`, label, lat, lon }, mapRouteTarget);
      setRouteActionMessage(`${mapRouteTarget === 'start' ? 'From' : 'To'} location selected on map.`);
      return;
    }

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
    if (!authState.isLoggedIn) {
      openAuthModalFor('Login required to save route profiles.', saveCurrentRouteProfile);
      return;
    }
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
    let routeCaseRef = null;
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
      const startPoint = manualStartPoint || userLocation || { lat: viewState.latitude, lon: viewState.longitude };
      const ownerKey = authState.isLoggedIn && authState.email ? String(authState.email).toLowerCase() : `guest_${localStorage.getItem(ONBOARDING_KEY) || 'anon'}`;
      const rawInput = {
        startLat: startPoint.lat,
        startLon: startPoint.lon,
        destinationLat: destination.lat,
        destinationLon: destination.lon,
        destinationId: destinationId || '',
        destinationName: destination.name || destination.note || '',
        currentMood,
        budget: userBudget,
        routeMode,
        maxStops: routeMaxStops,
        climateSafe: climateSafeMode,
        vibeSync: vibeSyncMode,
        owner: ownerKey,
        requestedAt: Date.now()
      };
      const created = CaseIsolation.createCase({
        type: CASE_TYPES.ROUTE,
        label: `Route → ${destination.name || destination.note || 'Destination'}`,
        owner: ownerKey,
        rawInput,
        schema: {
          required: ['startLat', 'startLon', 'destinationLat', 'destinationLon', 'currentMood', 'budget'],
          types: { startLat: 'number', startLon: 'number', destinationLat: 'number', destinationLon: 'number', maxStops: 'number', climateSafe: 'boolean', vibeSync: 'boolean' },
          defaults: { routeMode: 'walking', maxStops: 5 }
        }
      });
      routeCaseRef = created.id;
      let useBudget = created.structured.budget;
      if (created.status === CASE_STATUS.EXCEPTION) {
        const missingBudget = created.exceptions.some((e) => e.key === 'budget');
        if (missingBudget) {
          const resolved = CaseIsolation.resolve(created.id, { message: 'No budget provided — applied safe default "medium" so user recommendations stay isolated.', applyStructuredPatch: { budget: 'medium', budgetFallback: true } });
          useBudget = resolved.structured.budget;
        }
        const missingMood = created.exceptions.some((e) => e.key === 'currentMood');
        if (missingMood) {
          CaseIsolation.resolve(created.id, { message: 'Missing mood — fallback to Reflective before computing ranking.', applyStructuredPatch: { currentMood: 'Reflective', moodFallback: true } });
        }
      }
      const structuredContext = CaseIsolation.getCase(created.id)?.structured || created.structured;
      try {
        const response = await fetch(`${BACKEND_URL}/api/vibes/route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            destination: { lat: Number(structuredContext.destinationLat), lon: Number(structuredContext.destinationLon) },
            start: { lat: Number(structuredContext.startLat), lon: Number(structuredContext.startLon) },
            currentMood: structuredContext.currentMood,
            currentTime: new Date().toISOString(),
            budget: useBudget,
            climateSafe: Boolean(structuredContext.climateSafe),
            avoidUnsafeZones,
            vibeSync: Boolean(structuredContext.vibeSync),
            routeMode: structuredContext.routeMode || 'walking',
            maxStops: Number(structuredContext.maxStops || routeMaxStops),
            preferScenic: preferScenicRoute,
            minimizeStops: minimizeStopsRoute,
            returnToStart: returnToStartRoute
          })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const waypoints = Array.isArray(data.waypoints) ? data.waypoints : [];
        CaseIsolation.recordDecision(created.id, {
          kind: 'ranking',
          engine: 'backend',
          algorithm: data.algorithm || 'vibe_route_v1',
          routeId: data.routeId || '',
          waypointCount: waypoints.length,
          estimatedDistanceKm: Number(data.estimatedDistanceKm || 0),
          estimatedDurationMin: Number(data.estimatedDurationMin || 0),
          topWaypoints: waypoints.slice(0, 3).map((wp) => ({ id: String(wp.id || ''), name: wp.name || wp.note || '', mood: wp.mood || '', score: Number(wp.score || 0).toFixed(3) })),
          owner: ownerKey,
          requestedAt: rawInput.requestedAt,
          decidedAt: Date.now()
        });
        setSuggestedRoute(waypoints);
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
          .map((p) => ({ ...p, score: scoreVibe(p, destination, structuredContext.currentMood || currentMood) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 4);
        CaseIsolation.escalate(created.id, {
          code: 'E_BACKEND_UNAVAILABLE',
          message: 'Backend route API unavailable; switched to frontend fallback scoring.',
          recoverable: true,
          remediation: 'Used localized haversine + mood match with per-case owner context to prevent cross-case mixing.'
        });
        CaseIsolation.recordDecision(created.id, {
          kind: 'ranking',
          engine: 'frontend_fallback',
          algorithm: 'local_haversine_mood',
          topWaypoints: fallback.map((wp) => ({ id: String(wp.id || ''), name: wp.name || wp.note || '', mood: wp.mood || '', score: Number(wp.score || 0).toFixed(3) })),
          owner: ownerKey,
          requestedAt: rawInput.requestedAt,
          decidedAt: Date.now()
        });
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
    return () => { if (routeCaseRef) CaseIsolation.closeCase(routeCaseRef); };
  }, [destination, currentMood, pins, climateSafeMode, avoidUnsafeZones, vibeSyncMode, routeMode, routeMaxStops, preferScenicRoute, minimizeStopsRoute, returnToStartRoute, userBudget, manualStartPoint, userLocation, activeRouteModeMeta.speedKmh, destinationId, authState.isLoggedIn, authState.email, authState.token]);

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
          headers: { 'Content-Type': 'application/json', ...authHeaders },
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
  }, [userLocation, authState.token]);

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
    const ownerKey = authState.isLoggedIn && authState.email ? String(authState.email).toLowerCase() : `guest_${localStorage.getItem(ONBOARDING_KEY) || 'anon'}`;
    const rawInput = { nextMood, previousMood: currentMood, autoSync: Boolean(autoMoodSync), budget: userBudget, weather: weather.label, owner: ownerKey, requestedAt: Date.now() };
    const created = CaseIsolation.createCase({
      type: CASE_TYPES.MOOD_SELECT,
      label: `Mood → ${nextMood || 'Unknown'}`,
      owner: ownerKey,
      rawInput,
      schema: {
        required: ['nextMood'],
        types: { autoSync: 'boolean' },
        defaults: { previousMood: currentMood, weather: weather.label }
      }
    });
    let resolvedMood = String(created.structured.nextMood || '');
    if (created.status === CASE_STATUS.EXCEPTION) {
      const missing = created.exceptions.some((e) => e.key === 'nextMood');
      const invalid = !MOODS.includes(String(resolvedMood));
      if (missing || invalid) {
        const fallback = created.structured.previousMood && MOODS.includes(String(created.structured.previousMood))
          ? String(created.structured.previousMood)
          : 'Reflective';
        const resolved = CaseIsolation.resolve(created.id, { message: missing ? 'No mood provided — fell back to previous (or Reflective) within this case only.' : `Mood "${resolvedMood}" outside allowed set — normalized without leaking into other sessions.`, applyStructuredPatch: { nextMood: fallback, normalized: true } });
        resolvedMood = String(resolved.structured.nextMood || 'Reflective');
      }
    }
    CaseIsolation.recordDecision(created.id, { kind: 'mood_change', from: rawInput.previousMood, to: resolvedMood, autoSyncDisabled: Boolean(autoMoodSync), owner: ownerKey, requestedAt: rawInput.requestedAt, decidedAt: Date.now() });
    CaseIsolation.closeCase(created.id);
    setCurrentMood(resolvedMood);
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
    if (!authState.isLoggedIn) {
      openAuthModalFor('Login required to add and save a vibe pin.', () => saveVibe(pinDraft));
      return;
    }
    const ownerKey = authState.isLoggedIn && authState.email ? String(authState.email).toLowerCase() : 'guest_anon';
    const rawInput = {
      name: pinDraft.name,
      note: pinDraft.note,
      lat: pinDraft.lat,
      lon: pinDraft.lng,
      mood: pinDraft.mood,
      moodTags: pinDraft.moodTags,
      budget: pinDraft.budget,
      ratingsOverall: Number(pinDraft?.ratings?.overall),
      song: pinDraft.song || null,
      spotifyTrackId: pinDraft.spotifyTrackId || null,
      weather: weather.label,
      owner: ownerKey,
      requestedAt: Date.now()
    };
    const created = CaseIsolation.createCase({
      type: CASE_TYPES.PIN_SAVE,
      label: `Save Pin: ${pinDraft.name || pinDraft.note || 'Untitled'}`,
      owner: ownerKey,
      rawInput,
      schema: {
        required: ['lat', 'lon', 'mood'],
        types: { lat: 'number', lon: 'number', ratingsOverall: 'number' },
        defaults: { budget: userBudget || 'medium', ratingsOverall: 4.2 }
      }
    });
    let effectiveBudget = created.structured.budget;
    let effectiveName = created.structured.name;
    let effectiveOverall = Number(created.structured.ratingsOverall || 4.2);
    if (created.status === CASE_STATUS.EXCEPTION) {
      const missingBudget = created.exceptions.some((e) => e.key === 'budget');
      const missingName = !created.structured.name;
      const badRating = created.exceptions.some((e) => e.key === 'ratingsOverall');
      if (missingBudget) {
        const resolved = CaseIsolation.resolve(created.id, { message: 'No budget set on pin — inherited user budget preference (or safe "medium") to keep this save decision isolated.', applyStructuredPatch: { budget: userBudget || 'medium', budgetInherited: true } });
        effectiveBudget = resolved.structured.budget;
      }
      if (missingName) {
        const resolved = CaseIsolation.resolve(created.id, { message: 'Empty pin name — applied auto-generated Untitled Spot name to avoid mixing saves across user sessions.', applyStructuredPatch: { name: 'Untitled Spot', nameAuto: true } });
        effectiveName = resolved.structured.name;
      }
      if (badRating || !Number.isFinite(effectiveOverall) || effectiveOverall <= 0 || effectiveOverall > 5) {
        const resolved = CaseIsolation.resolve(created.id, { message: 'Invalid rating — normalized to 4.2 default so score stays within this case only.', applyStructuredPatch: { ratingsOverall: 4.2, ratingNormalized: true } });
        effectiveOverall = Number(resolved.structured.ratingsOverall || 4.2);
      }
    }
    CaseIsolation.recordDecision(created.id, { kind: 'save_plan', source: 'tempPin', effectiveBudget, effectiveName, effectiveOverall, owner: ownerKey, requestedAt: rawInput.requestedAt, decidedAt: Date.now() });
    const structured = CaseIsolation.getCase(created.id)?.structured || created.structured;

    const payload = {
      name: effectiveName || structured.name || 'Untitled Spot',
      lat: Number(structured.lat),
      lon: Number(structured.lon),
      mood: structured.mood,
      moodTags: structured.moodTags?.length ? structured.moodTags : [moodToTag(structured.mood)],
      budget: effectiveBudget || structured.budget || 'medium',
      ratings: { ...(pinDraft.ratings || { safety: 4.0, vibe: 4.4, crowd: 3.6 }), overall: effectiveOverall },
      reviews: pinDraft.reviews || [],
      note: structured.note || pinDraft.note || 'No note',
      song: structured.song || 'No song linked',
      spotify_track_id: structured.spotifyTrackId || null,
      spotify_playlist_id: pinDraft.spotifyPlaylistId || null,
      weather: structured.weather || weather.label,
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
        CaseIsolation.recordDecision(created.id, { kind: 'backend_save', ok: true, id: String(savedPin.id || ''), source: savedRemotely ? 'backend' : 'local', owner: ownerKey, decidedAt: Date.now() });
      } catch (err) {
        CaseIsolation.escalate(created.id, {
          code: 'E_CLOUD_SAVE_FAILED',
          message: String(err?.message || 'Could not save pin to backend'),
          recoverable: true,
          remediation: 'Saved pin locally (still isolated by owner) and surfaced a non-blocking auth notice.'
        });
        setAuthNotice(`Cloud save failed, saved locally instead: ${err.message}`);
      }
    } else {
      CaseIsolation.recordDecision(created.id, { kind: 'guest_save', source: 'local', owner: ownerKey, decidedAt: Date.now() });
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
      time: new Date().toISOString(),
      caseId: created.id
    });
    setDestinationId(String(savedPin.id || `${savedPin.lat}-${savedPin.lon}-${savedPin.time}`));
    postAutomationEvent('vibe_pin_saved', {
      mood: savedPin.mood,
      lat: savedPin.lat,
      lon: savedPin.lon,
      weather: savedPin.weather,
      playlist: savedPin.song,
      caseId: created.id
    });
    CaseIsolation.closeCase(created.id);
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
      openAuthModalFor('Please login to submit route feedback.', submitRouteFeedback);
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
    if (!authState.isLoggedIn || !isAdminUser) {
      openAuthModalFor('Admin login required for demo seed/reset actions.', () => loadDemoData(reset));
      return [];
    }
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
      const vibeRes = await fetch(`${BACKEND_URL}/api/vibes`, { headers: authHeaders });
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
      loadAdminOverview();
      loadAdminAllVibes();
      loadAdminAllBoards();
      return normalizedPins;
    } catch (err) {
      setDemoSeedStatus(`Could not load demo data: ${err.message}`);
      if (/auth|token|login|401/i.test(String(err.message || ''))) {
        setAuthNotice('Login required for demo seeding and protected write actions.');
        openAuthModalFor('Please login to continue with this demo action.', () => loadDemoData(reset));
      }
      return [];
    }
  };

  const runGuidedDemoFlow = async () => {
    if (!authState.isLoggedIn || !isAdminUser) {
      openAuthModalFor('Admin login required for guided demo flow.', runGuidedDemoFlow);
      return;
    }
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
      const res = await withBackendFetch(`${BACKEND_URL}/api/auth/login`, {
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
      const res = await withBackendFetch(`${BACKEND_URL}/api/auth/register`, {
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

  const isAdminUser = Boolean(
    authState.isLoggedIn && (
      authState.role === 'Admin' ||
      String(authState.email).toLowerCase().includes('admin') ||
      String(authState.email).toLowerCase().includes('azad') ||
      authState.email === 'azadsingh@gmail.com'
    )
  );

  const loadAdminOverview = useCallback(async () => {
    if (!authState.token) return;
    setAdminLoading(true);
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/admin/overview`, {
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      const data = await res.json();
      if (res.ok && data) {
        setAdminData(data);
      } else if (res.status === 401) {
        const demoRes = await withBackendFetch(`${BACKEND_URL}/api/auth/google/demo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: authState.email || 'azadsingh@gmail.com', name: authState.name || 'Azad Singh' })
        });
        const demoData = await demoRes.json();
        if (demoRes.ok && demoData.token) {
          setAuthState((prev) => ({ ...prev, token: demoData.token, role: 'Admin' }));
        }
      }
    } catch {
      // Backend error
    } finally {
      setAdminLoading(false);
    }
  }, [authState.token, authState.email, authState.name]);

  const handleAdminChangeRole = async (userId, newRole) => {
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authState.token}` },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        setRouteActionMessage(`User role updated to ${newRole}`);
        loadAdminOverview();
      }
    } catch (err) {
      setRouteActionMessage(`Failed to update role: ${err.message}`);
    }
  };

  const loadAdminAllVibes = useCallback(async () => {
    if (!authState.token) return;
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/admin/vibes`, {
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.vibes)) {
        setAdminAllVibes(data.vibes);
      }
    } catch {
      // Backend error
    }
  }, [authState.token]);

  const loadAdminAllBoards = useCallback(async () => {
    if (!authState.token) return;
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/admin/boards`, {
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.boards)) {
        setAdminAllBoards(data.boards);
      }
    } catch {
      // Backend error
    }
  }, [authState.token]);

  const handleCleanSessions = async () => {
    setAdminCleaningSessions(true);
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/admin/sessions/clean`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setRouteActionMessage(`Cleaned ${data.cleanedCount || 0} expired/revoked sessions.`);
        loadAdminOverview();
      }
    } catch (err) {
      setRouteActionMessage(`Failed to clean sessions: ${err.message}`);
    } finally {
      setAdminCleaningSessions(false);
    }
  };

  const loadAdminUserDetails = useCallback(async (userId, isSilent = false) => {
    if (!authState.token || !userId) return;
    if (!isSilent) setAdminInspectorLoading(true);
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      const data = await res.json();
      if (res.ok && data) {
        setSelectedAdminUser(data);
        if (!isSilent) setAdminInspectorTab('pins');
      } else if (!isSilent) {
        setRouteActionMessage(data.error || 'Failed to inspect user');
      }
    } catch (err) {
      if (!isSilent) setRouteActionMessage(`Error inspecting user: ${err.message}`);
    } finally {
      if (!isSilent) setAdminInspectorLoading(false);
    }
  }, [authState.token]);

  useEffect(() => {
    if (authState.token && isAdminUser) {
      loadAdminOverview();
      loadAdminAllVibes();
      loadAdminAllBoards();

      const interval = setInterval(() => {
        loadAdminOverview();
        loadAdminAllVibes();
        loadAdminAllBoards();
        if (selectedAdminUser && selectedAdminUser.user && selectedAdminUser.user.id) {
          loadAdminUserDetails(selectedAdminUser.user.id, true);
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [activeView, showAdminPanel, authState.token, isAdminUser, loadAdminOverview, loadAdminAllVibes, loadAdminAllBoards, selectedAdminUser, loadAdminUserDetails]);

  const loadUserHistory = useCallback(async () => {
    if (!authState.token) return;
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/vibes/history`, {
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.history)) {
        setUserHistoryList(data.history);
      }
    } catch {
      // Backend error
    }
  }, [authState.token]);

  const handleUpdateUserProfile = async (e) => {
    if (e) e.preventDefault();
    if (!userEditName.trim() || !authState.token) return;
    setUserSavingProfile(true);
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authState.token}` },
        body: JSON.stringify({ name: userEditName.trim() })
      });
      const data = await res.json();
      if (res.ok && data.user) {
        setAuthState((prev) => ({ ...prev, name: data.user.name }));
        setRouteActionMessage('Profile name updated successfully!');
      }
    } catch (err) {
      setRouteActionMessage(`Profile update failed: ${err.message}`);
    } finally {
      setUserSavingProfile(false);
    }
  };

  useEffect(() => {
    if (activeView === 'user' && authState.token) {
      loadUserHistory();
      if (authState.name) setUserEditName(authState.name);
    }
  }, [activeView, authState.token, authState.name, loadUserHistory]);

  const handleAdminDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user? Their pins and boards will be removed.')) return;
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      if (res.ok) {
        setRouteActionMessage('User deleted successfully.');
        loadAdminOverview();
      }
    } catch (err) {
      setRouteActionMessage(`Failed to delete user: ${err.message}`);
    }
  };

  const handleRegister = async () => {
    await performRegister(registerForm.name, registerForm.email, registerForm.password);
  };

  const handleGoogleSignIn = async () => {
    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/auth/google/url`);
      const data = await res.json();
      if (data.configured && data.url) {
        window.location.href = data.url;
      } else {
        setAuthNotice('Signing in with Google account...');
        const demoRes = await withBackendFetch(`${BACKEND_URL}/api/auth/google/demo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'azadsingh@gmail.com', name: 'Azad Singh' })
        });
        const demoData = await demoRes.json();
        if (demoRes.ok && demoData.token) {
          setAuthState({
            isLoggedIn: true,
            token: demoData.token,
            name: demoData.user?.name || 'Azad Singh',
            email: demoData.user?.email || 'azadsingh@gmail.com',
            role: demoData.user?.role || 'Explorer'
          });
          setAuthNotice(`Signed in with Google as ${demoData.user?.email}`);
          completeAuthModalFlow();
        } else {
          setAuthNotice(data.message || 'Google Sign-In failed');
        }
      }
    } catch (err) {
      setAuthNotice(`Google Sign-In error: ${err.message}`);
    }
  };

  const handleLogout = async () => {
    if (authState.token) {
      try {
        await withBackendFetch(`${BACKEND_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authState.token}`
          }
        });
      } catch {
        // Session cleanup
      }
    }

    try {
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(FAVORITE_PLACES_KEY);
      localStorage.removeItem(ROUTE_PROFILES_KEY);
      localStorage.removeItem(PROFILE_KEY);
      if (authState.email) {
        localStorage.removeItem(userStorageKey(STORAGE_KEY, authState.email));
        localStorage.removeItem(userStorageKey(FAVORITE_PLACES_KEY, authState.email));
        localStorage.removeItem(userStorageKey(ROUTE_PROFILES_KEY, authState.email));
        localStorage.removeItem(userStorageKey(PROFILE_KEY, authState.email));
      }
    } catch {
      // Storage cleanup
    }

    dataOwnerRef.current = '';
    setPins([]);
    setBoards([]);
    setSelectedBoard(null);
    setSelectedBoardItems([]);
    setSelectedPin(null);
    setDestinationId('');
    setFavoritePlaces({ home: null, work: null });
    setRouteProfiles([]);
    setTempPin(null);
    setEditingPin(null);
    setAddPinToBoardTarget(null);
    setAuthState({ isLoggedIn: false, token: '', name: '', email: '', role: 'Explorer' });
    setLoginForm({ email: '', password: '' });
    setRegisterForm({ name: '', email: '', password: '', role: 'Explorer' });
    setAuthNotice('Logged out successfully.');
    if (activeMenuSection === 'boards' || activeMenuSection === 'profile') {
      setActiveMenuSection('dashboard');
    }
  };

  const saveProfile = async () => {
    if (!authState.isLoggedIn) {
      setAuthNotice('Please login first to save profile details.');
      openAuthModalFor('Please login to update your profile.', saveProfile);
      return;
    }

    try {
      const res = await withBackendFetch(`${BACKEND_URL}/api/auth/profile`, {
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

  const locationErrorMessage = (error) => {
    if (error?.code === 1) return 'Location permission was denied. Enable it in your browser settings to use Current Location.';
    if (error?.code === 2) return 'Your current location is unavailable. Check GPS, Wi-Fi, or mobile data and try again.';
    if (error?.code === 3) return 'Location request timed out. Please try Current Location again.';
    return 'Unable to get your current location. Please try again.';
  };

  const applyLocationUpdate = (position) => {
    const lat = Number(position?.coords?.latitude);
    const lon = Number(position?.coords?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const now = Date.now();
    const accuracy = Number(position.coords.accuracy);

    if (travelRef.current) {
      const elapsedHours = (now - travelRef.current.ts) / 3600000;
      if (elapsedHours > 0) {
        const dist = haversineKm(travelRef.current.lat, travelRef.current.lon, lat, lon);
        const nextSpeed = Math.min(120, dist / elapsedHours);
        if (Number.isFinite(nextSpeed)) setTravelSpeedKmh(nextSpeed);
      }
    }

    travelRef.current = { lat, lon, ts: now };
    const nextLocation = { lat, lon, accuracy: Number.isFinite(accuracy) ? accuracy : null, timestamp: position.timestamp || now };
    setUserLocation(nextLocation);
    setLocationError('');
    return nextLocation;
  };

  const startTrackingLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.');
      return false;
    }
    if (locationWatchRef.current !== null) return true;

    const id = navigator.geolocation.watchPosition(
      (position) => {
        applyLocationUpdate(position);
      },
      (error) => setLocationError(locationErrorMessage(error)),
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000
      }
    );

    locationWatchRef.current = id;
    return true;
  };

  const recenterOnCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.');
      return;
    }
    if (locationRequestInFlightRef.current) return;
    locationRequestInFlightRef.current = true;
    setLocationError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = applyLocationUpdate(position);
        startTrackingLocation();
        const mapInstance = mapRef.current?.getMap?.();
        if (location && mapInstance) {
          mapInstance.flyTo({ center: [location.lon, location.lat], zoom: Math.max(mapInstance.getZoom(), 14), duration: 850, essential: true });
          setIsMapCenteredOnUser(true);
        }
        locationRequestInFlightRef.current = false;
      },
      (error) => {
        setLocationError(locationErrorMessage(error));
        locationRequestInFlightRef.current = false;
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
    );
  };

  const userLocationAccuracyGeoJson = useMemo(() => {
    if (!userLocation) return null;
    const radiusMeters = Math.max(5, Math.min(Number(userLocation.accuracy) || 20, 1000));
    const latRadians = (Number(userLocation.lat) * Math.PI) / 180;
    const coordinates = Array.from({ length: 49 }, (_, index) => {
      const angle = (index / 48) * Math.PI * 2;
      const lat = Number(userLocation.lat) + (radiusMeters * Math.cos(angle)) / 111320;
      const lon = Number(userLocation.lon) + (radiusMeters * Math.sin(angle)) / (111320 * Math.cos(latRadians));
      return [lon, lat];
    });
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coordinates] } }] };
  }, [userLocation]);

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
    if (!authState.isLoggedIn) {
      openAuthModalFor('Login required to save favorites.', () => setFavoriteFromPlace(slot, place));
      return;
    }
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

  const FLOATING_CATEGORIES = [
    { id: 'calm', label: 'Calm', emoji: '🌿', moodFilter: 'calm' },
    { id: 'nature', label: 'Nature', emoji: '🌲', tagFilter: 'nature' },
    { id: 'sunset', label: 'Sunset', emoji: '🌅', tagFilter: 'sunset' },
    { id: 'peaceful', label: 'Peaceful', emoji: '🕊️', moodFilter: 'reflective' },
    { id: 'adventure', label: 'Adventure', emoji: '🏔️', moodFilter: 'excited' },
    { id: 'romantic', label: 'Romantic', emoji: '💛', moodFilter: 'romantic' },
    { id: 'hidden', label: 'Hidden gems', emoji: '💎', hidden: true },
    { id: 'cafes', label: 'Cafés', emoji: '☕', tagFilter: 'cafe' }
  ];

  const runFloatingSearch = async (query) => {
    const trimmed = String(query || '').trim();
    if (trimmed.length < 2) {
      setFloatingPlaceResults([]);
      setFloatingSearching(false);
      return;
    }
    setFloatingSearching(true);
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=6&language=en&format=json`);
      const data = await res.json();
      const results = Array.isArray(data?.results)
        ? data.results.map((r) => ({
            id: `${r.id || `${r.latitude}-${r.longitude}`}`,
            name: r.name,
            sub: [r.admin1, r.country].filter(Boolean).join(', '),
            label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
            lat: Number(r.latitude),
            lon: Number(r.longitude),
            emoji: '📍'
          }))
        : [];
      const vibeMatches = visiblePins
        .filter((p) => {
          const hay = `${p.name || ''} ${p.note || ''} ${(p.moodTags || []).join(' ')} ${p.mood || ''}`.toLowerCase();
          return hay.includes(trimmed.toLowerCase());
        })
        .slice(0, 3)
        .map((p) => ({
          id: String(p.id || `${p.lat}-${p.lon}-${p.time}`),
          name: p.name || p.note || 'Vibe spot',
          sub: `${p.mood || 'Vibe'} • ${(p.moodTags || []).slice(0, 2).join(', ') || 'Saved pin'}`,
          lat: Number(p.lat),
          lon: Number(p.lon),
          emoji: pinEmotionEmoji(p),
          isPin: true,
          pinRef: p
        }));
      setFloatingPlaceResults([...vibeMatches, ...results]);
    } catch {
      setFloatingPlaceResults([]);
    } finally {
      setFloatingSearching(false);
    }
  };

  const pinEmotionEmoji = (p) => {
    const mood = String(p?.mood || (p?.moodTags?.[0] || '')).toLowerCase();
    if (mood.includes('calm') || mood.includes('peaceful')) return '🌿';
    if (mood.includes('romantic')) return '💛';
    if (mood.includes('excit') || mood.includes('energy') || mood.includes('adventure')) return '⚡';
    if (mood.includes('sad') || mood.includes('melancholy')) return '🌧️';
    if (mood.includes('reflect') || mood.includes('music')) return '🎧';
    return '📍';
  };

  const handleFloatingSearchChange = (value) => {
    setFloatingSearchQuery(value);
    if (floatingSearchTimerRef.current) clearTimeout(floatingSearchTimerRef.current);
    floatingSearchTimerRef.current = setTimeout(() => runFloatingSearch(value), 280);
  };

  const handleSelectFloatingResult = (place) => {
    if (place?.isPin && place.pinRef) {
      setSelectedPin(place.pinRef);
      setViewState((prev) => ({ ...prev, latitude: Number(place.lat), longitude: Number(place.lon), zoom: Math.max(prev.zoom || 12, 13) }));
    } else if (place) {
      ensureDestinationPin(place.lat, place.lon, place.label || place.name);
      setNavDestinationQuery(place.label || place.name);
      setViewState((prev) => ({ ...prev, latitude: Number(place.lat), longitude: Number(place.lon), zoom: Math.max(prev.zoom || 11, 12) }));
      pushRecentSearch({
        id: place.id,
        label: place.label || place.name,
        lat: Number(place.lat),
        lon: Number(place.lon)
      });
    }
    setFloatingSearchFocused(false);
    setFloatingSearchQuery('');
    setFloatingPlaceResults([]);
  };

  const handleFloatingCategoryClick = (cat) => {
    setActiveFloatingCategory((prev) => (prev === cat.id ? '' : cat.id));
    if (cat.id !== activeFloatingCategory) {
      if (cat.moodFilter) {
        setCurrentMood(cat.moodFilter.charAt(0).toUpperCase() + cat.moodFilter.slice(1));
      }
    }
  };

  const toggleFavoritePin = (pin) => {
    if (!authState.isLoggedIn) {
      openAuthModalFor('Login to save favorites', () => toggleFavoritePin(pin));
      return;
    }
    const ownerKey = authState.isLoggedIn && authState.email ? String(authState.email).toLowerCase() : 'guest_anon';
    const pinId = String(pin.id || `${pin.lat}-${pin.lon}-${pin.time}`);
    const rawInput = { pinId, name: pin.name || pin.note || '', lat: Number(pin.lat), lon: Number(pin.lon), mood: pin.mood, budget: pin.budget, owner: ownerKey, requestedAt: Date.now() };
    const created = CaseIsolation.createCase({
      type: CASE_TYPES.FAVORITE,
      label: `Favorite: ${pin.name || pin.note || 'Spot'}`,
      owner: ownerKey,
      rawInput,
      schema: {
        required: ['pinId', 'lat', 'lon'],
        types: { lat: 'number', lon: 'number' },
        defaults: { manualOverride: false }
      }
    });
    let nextFav = true;
    if (created.status === CASE_STATUS.EXCEPTION) {
      const hasCoords = Number.isFinite(Number(created.structured.lat)) && Number.isFinite(Number(created.structured.lon));
      if (!created.structured.pinId || !hasCoords) {
        CaseIsolation.resolve(created.id, { message: 'Partial pin identity — enriched with lat-lon fallback key within this case only.', applyStructuredPatch: { pinId: created.structured.pinId || `${created.structured.lat}-${created.structured.lon}`, enriched: true } });
      }
    }
    setSavedVibes((prev) => {
      const next = (prev || []).map((v) => {
        const vid = String(v.id || `${v.lat}-${v.lon}-${v.time}`);
        if (vid === pinId) {
          nextFav = v.favorite ? false : true;
          return { ...v, favorite: nextFav };
        }
        return v;
      });
      return next;
    });
    CaseIsolation.recordDecision(created.id, { kind: 'favorite_toggle', nextFavorite: nextFav, engine: 'savedVibes', owner: ownerKey, requestedAt: rawInput.requestedAt, decidedAt: Date.now() });
    CaseIsolation.closeCase(created.id);
    setRouteActionMessage('Favorites updated.');
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

  if (activeView === 'admin') {
    if (!authState.isLoggedIn || !isAdminUser) {
      return (
        <div className="admin-page-root">
          <div className="admin-access-denied-card">
            <div className="admin-access-denied-icon">🔒</div>
            <h2 className="admin-access-denied-title">Admin Portal Restricted</h2>
            <p className="admin-access-denied-text">You must be authenticated with an Administrator account to access the system dashboard.</p>
            <div className="admin-access-denied-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  navigateToView('explore');
                  openAuthModalFor('Login as Admin to access this page.');
                }}
              >
                Sign In as Admin
              </button>
              <button type="button" className="btn-secondary" onClick={() => navigateToView('explore')}>
                ← Return to Map
              </button>
            </div>
          </div>
        </div>
      );
    }

    const filteredUsers = (adminData.users || []).filter((u) => {
      const q = adminUserSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q)
      );
    });

    const filteredVibes = (adminAllVibes || []).filter((v) => {
      const q = adminPinSearch.toLowerCase().trim();
      const moodMatch = adminMoodFilter === 'All' || v.mood === adminMoodFilter;
      if (!moodMatch) return false;
      if (!q) return true;
      return (
        (v.name || '').toLowerCase().includes(q) ||
        (v.note || '').toLowerCase().includes(q) ||
        (v.user_email || '').toLowerCase().includes(q) ||
        (v.mood || '').toLowerCase().includes(q)
      );
    });

    const filteredAudit = (adminData.auditLogs || []).filter((log) => {
      const q = adminAuditSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        (log.action || '').toLowerCase().includes(q) ||
        (log.user_email || '').toLowerCase().includes(q) ||
        (log.user_name || '').toLowerCase().includes(q)
      );
    });

    return (
      <div className="admin-page-root">
        {/* Top Navigation Bar */}
        <header className="admin-navbar">
          <div className="admin-navbar-left">
            <button
              type="button"
              className="admin-nav-back-btn"
              onClick={() => navigateToView('explore')}
              title="Return to Map"
            >
              ← Explore Map
            </button>
            <div className="admin-navbar-brand">
              <div className="admin-navbar-logo">🛡️</div>
              <div className="admin-navbar-title-group">
                <span className="admin-navbar-title">Vibe Atlas</span>
                <span className="admin-navbar-badge">Admin Portal</span>
              </div>
            </div>
          </div>

          <div className="admin-navbar-right">
            <div className="admin-status-pill">
              <span className="admin-status-dot" />
              <span>PostgreSQL 16 Active</span>
            </div>
            <div className="admin-user-pill">
              <div className="admin-user-avatar-sm">{String(authState.name || authState.email || 'A').charAt(0).toUpperCase()}</div>
              <div className="admin-user-info">
                <span className="admin-user-info-name">{authState.name || 'Admin'}</span>
                <span className="admin-user-info-email">{authState.email}</span>
              </div>
            </div>
            <button type="button" className="admin-nav-logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="admin-page-content">
          {/* Top KPI Metrics Row */}
          <div className="admin-kpi-row">
            <div className="admin-kpi-metric-card">
              <div className="admin-kpi-metric-top">
                <span className="admin-kpi-metric-icon">👥</span>
                <span className="admin-kpi-metric-badge">Live Accounts</span>
              </div>
              <div className="admin-kpi-metric-val">{adminData.stats?.totalUsers ?? (adminLoading ? '...' : 0)}</div>
              <div className="admin-kpi-metric-title">Registered Users</div>
            </div>

            <div className="admin-kpi-metric-card">
              <div className="admin-kpi-metric-top">
                <span className="admin-kpi-metric-icon">📍</span>
                <span className="admin-kpi-metric-badge">Spatial Points</span>
              </div>
              <div className="admin-kpi-metric-val">{adminData.stats?.totalPins ?? (adminLoading ? '...' : 0)}</div>
              <div className="admin-kpi-metric-title">Active Vibe Pins</div>
            </div>

            <div className="admin-kpi-metric-card">
              <div className="admin-kpi-metric-top">
                <span className="admin-kpi-metric-icon">📋</span>
                <span className="admin-kpi-metric-badge">Collections</span>
              </div>
              <div className="admin-kpi-metric-val">{adminData.stats?.totalBoards ?? (adminLoading ? '...' : 0)}</div>
              <div className="admin-kpi-metric-title">Travel Boards</div>
            </div>

            <div className="admin-kpi-metric-card">
              <div className="admin-kpi-metric-top">
                <span className="admin-kpi-metric-icon">⚡</span>
                <span className="admin-kpi-metric-badge">JWT Verified</span>
              </div>
              <div className="admin-kpi-metric-val">{adminData.stats?.activeSessions ?? (adminLoading ? '...' : 0)}</div>
              <div className="admin-kpi-metric-title">Active User Sessions</div>
            </div>
          </div>

          {/* Tab Navigation Toolbar */}
          <div className="admin-tab-toolbar">
            <div className="admin-tabs">
              <button
                type="button"
                className={`admin-tab-btn ${adminTab === 'overview' ? 'admin-tab-active' : ''}`}
                onClick={() => setAdminTab('overview')}
              >
                📊 Overview
              </button>
              <button
                type="button"
                className={`admin-tab-btn ${adminTab === 'users' ? 'admin-tab-active' : ''}`}
                onClick={() => setAdminTab('users')}
              >
                👥 Users ({adminData.users?.length || 0})
              </button>
              <button
                type="button"
                className={`admin-tab-btn ${adminTab === 'vibes' ? 'admin-tab-active' : ''}`}
                onClick={() => {
                  setAdminTab('vibes');
                  if (!adminAllVibes.length) loadAdminAllVibes();
                }}
              >
                📍 Pins ({adminAllVibes?.length || adminData.stats?.totalPins || 0})
              </button>
              <button
                type="button"
                className={`admin-tab-btn ${adminTab === 'boards' ? 'admin-tab-active' : ''}`}
                onClick={() => {
                  setAdminTab('boards');
                  if (!adminAllBoards.length) loadAdminAllBoards();
                }}
              >
                📋 Boards ({adminAllBoards?.length || adminData.stats?.totalBoards || 0})
              </button>
              <button
                type="button"
                className={`admin-tab-btn ${adminTab === 'audit' ? 'admin-tab-active' : ''}`}
                onClick={() => setAdminTab('audit')}
              >
                📜 Audit Logs ({adminData.auditLogs?.length || 0})
              </button>
              <button
                type="button"
                className={`admin-tab-btn ${adminTab === 'system' ? 'admin-tab-active' : ''}`}
                onClick={() => setAdminTab('system')}
              >
                ⚙️ System Tools
              </button>
            </div>

            <div className="admin-action-controls">
              <button
                type="button"
                className="admin-action-btn admin-action-refresh"
                onClick={() => {
                  loadAdminOverview();
                  loadAdminAllVibes();
                  loadAdminAllBoards();
                }}
                disabled={adminLoading}
              >
                🔄 {adminLoading ? 'Refreshing...' : 'Refresh Data'}
              </button>
            </div>
          </div>

          {/* TAB 1: OVERVIEW */}
          {adminTab === 'overview' && (
            <div className="admin-tab-content">
              {/* Mood Distribution Banner */}
              <div className="admin-card admin-mood-analytics-card">
                <div className="admin-card-header">
                  <h3>🎭 User Saved Places by Mood Distribution</h3>
                  <span className="admin-badge">Live Spatial Sentiment</span>
                </div>
                <div className="admin-card-body">
                  <div className="admin-mood-stats-grid">
                    <div className="admin-mood-stat-box admin-mood-box-calm">
                      <div className="admin-mood-stat-header">
                        <span className="admin-mood-stat-emoji">🌿</span>
                        <span className="admin-mood-stat-name">Calm</span>
                      </div>
                      <div className="admin-mood-stat-count">{adminData.stats?.moodCounts?.Calm || 0}</div>
                      <div className="admin-mood-stat-sub">Saved Spots</div>
                    </div>
                    <div className="admin-mood-stat-box admin-mood-box-excited">
                      <div className="admin-mood-stat-header">
                        <span className="admin-mood-stat-emoji">⚡</span>
                        <span className="admin-mood-stat-name">Excited</span>
                      </div>
                      <div className="admin-mood-stat-count">{adminData.stats?.moodCounts?.Excited || 0}</div>
                      <div className="admin-mood-stat-sub">Saved Spots</div>
                    </div>
                    <div className="admin-mood-stat-box admin-mood-box-musical">
                      <div className="admin-mood-stat-header">
                        <span className="admin-mood-stat-emoji">🎵</span>
                        <span className="admin-mood-stat-name">Musical</span>
                      </div>
                      <div className="admin-mood-stat-count">{adminData.stats?.moodCounts?.Musical || 0}</div>
                      <div className="admin-mood-stat-sub">Saved Spots</div>
                    </div>
                    <div className="admin-mood-stat-box admin-mood-box-reflective">
                      <div className="admin-mood-stat-header">
                        <span className="admin-mood-stat-emoji">🌊</span>
                        <span className="admin-mood-stat-name">Reflective</span>
                      </div>
                      <div className="admin-mood-stat-count">{adminData.stats?.moodCounts?.Reflective || 0}</div>
                      <div className="admin-mood-stat-sub">Saved Spots</div>
                    </div>
                    <div className="admin-mood-stat-box admin-mood-box-melancholy">
                      <div className="admin-mood-stat-header">
                        <span className="admin-mood-stat-emoji">🌧️</span>
                        <span className="admin-mood-stat-name">Melancholy</span>
                      </div>
                      <div className="admin-mood-stat-count">{adminData.stats?.moodCounts?.Melancholy || 0}</div>
                      <div className="admin-mood-stat-sub">Saved Spots</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="admin-two-col-grid">
                {/* Recent Saved Places with Mood */}
                <div className="admin-card">
                  <div className="admin-card-header">
                    <h3>📍 Recent Places Saved by Users</h3>
                    <button type="button" className="admin-card-link-btn" onClick={() => setAdminTab('vibes')}>
                      All Pins →
                    </button>
                  </div>
                  <div className="admin-card-body">
                    {adminData.recentVibes && adminData.recentVibes.length ? (
                      <div className="admin-mini-vibes-list">
                        {adminData.recentVibes.slice(0, 5).map((v) => (
                          <div key={v.id} className="admin-mini-vibe-item">
                            <div className="admin-mini-vibe-details">
                              <span className="admin-mini-vibe-name">{v.name || 'Untitled Spot'}</span>
                              <span className="admin-mini-vibe-user">Saved by: {v.user_email || `User #${v.user_id}`}</span>
                            </div>
                            <span className={`admin-mood-pill admin-mood-${String(v.mood).toLowerCase()}`}>
                              {v.mood || 'Calm'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="admin-empty-notice">No saved places recorded yet.</div>
                    )}
                  </div>
                </div>

                {/* Recent User Logins Card */}
                <div className="admin-card">
                  <div className="admin-card-header">
                    <h3>⚡ Recent User Logins</h3>
                    <button type="button" className="admin-card-link-btn" onClick={() => setAdminTab('users')}>
                      All Users →
                    </button>
                  </div>
                  <div className="admin-card-body">
                    {adminData.recentLogins && adminData.recentLogins.length ? (
                      <div className="admin-mini-user-list">
                        {adminData.recentLogins.slice(0, 5).map((s) => (
                          <div key={s.id} className="admin-mini-user-item">
                            <div className="admin-user-avatar-sm">{String(s.name || s.email || 'U').charAt(0).toUpperCase()}</div>
                            <div className="admin-mini-user-details">
                              <span className="admin-mini-user-name">{s.email || 'Anonymous User'}</span>
                              <span className="admin-mini-user-email">Logged in: {new Date(s.login_time).toLocaleString()}</span>
                            </div>
                            <span className={`admin-status-dot-sm ${s.revoked_at ? 'admin-dot-revoked' : 'admin-dot-active'}`} title={s.revoked_at ? 'Session Logged Out' : 'Active Session'} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="admin-empty-notice">No login sessions recorded.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: USERS */}
          {adminTab === 'users' && (
            <div className="admin-tab-content">
              <div className="admin-card">
                <div className="admin-card-header">
                  <div className="admin-header-with-search">
                    <h3>User Accounts & Role Permissions</h3>
                    <input
                      type="text"
                      className="admin-search-input"
                      placeholder="Search users by name, email, or role..."
                      value={adminUserSearch}
                      onChange={(e) => setAdminUserSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="admin-table-container">
                  <table className="admin-full-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Activity</th>
                        <th>Last Login</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.length ? (
                        filteredUsers.map((u) => (
                          <tr key={u.id}>
                            <td className="admin-td-user">
                              <div className="admin-user-avatar-sm">{String(u.name || u.email || 'U').charAt(0).toUpperCase()}</div>
                              <span className="admin-name-bold">{u.name || 'Anonymous User'}</span>
                            </td>
                            <td className="admin-td-email">{u.email}</td>
                            <td>
                              <span className={`admin-role-tag admin-role-${String(u.role).toLowerCase().replace(/\s+/g, '-')}`}>
                                {u.role || 'Explorer'}
                              </span>
                            </td>
                            <td>
                              <span className="admin-badge" style={{ fontSize: '11px' }}>
                                📍 {u.pin_count || 0} pins • 📋 {u.board_count || 0} boards
                              </span>
                            </td>
                            <td className="admin-td-date">
                              {u.last_login ? new Date(u.last_login).toLocaleString() : u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="admin-td-actions">
                              <button
                                type="button"
                                className="admin-btn-map admin-btn-inspect"
                                onClick={() => loadAdminUserDetails(u.id)}
                                title="Inspect user complete VibeAtlas data"
                              >
                                🔍 Inspect
                              </button>
                              <select
                                className="admin-role-select"
                                value={u.role || 'Explorer'}
                                onChange={(e) => handleAdminChangeRole(u.id, e.target.value)}
                              >
                                <option value="Explorer">Explorer</option>
                                <option value="Power Explorer">Power Explorer</option>
                                <option value="Admin">Admin</option>
                              </select>
                              {String(u.email) !== String(authState.email) && (
                                <button
                                  type="button"
                                  className="admin-delete-btn"
                                  onClick={() => handleAdminDeleteUser(u.id)}
                                  title="Delete User and Associated Data"
                                >
                                  🗑️ Delete
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" className="admin-empty-table">No matching users found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: VIBE PINS DIRECTORY */}
          {adminTab === 'vibes' && (
            <div className="admin-tab-content">
              <div className="admin-card">
                <div className="admin-card-header">
                  <div className="admin-header-with-search">
                    <h3>Spatial Vibe Pins Directory</h3>
                    <div className="admin-filter-group">
                      <select
                        className="admin-filter-select"
                        value={adminMoodFilter}
                        onChange={(e) => setAdminMoodFilter(e.target.value)}
                      >
                        <option value="All">All Moods</option>
                        <option value="Calm">Calm</option>
                        <option value="Excited">Excited</option>
                        <option value="Musical">Musical</option>
                        <option value="Reflective">Reflective</option>
                        <option value="Melancholy">Melancholy</option>
                      </select>
                      <input
                        type="text"
                        className="admin-search-input"
                        placeholder="Search pins by location, note, or creator..."
                        value={adminPinSearch}
                        onChange={(e) => setAdminPinSearch(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div className="admin-table-container">
                  <table className="admin-full-table">
                    <thead>
                      <tr>
                        <th>Spot Name</th>
                        <th>Mood</th>
                        <th>Creator</th>
                        <th>Coordinates</th>
                        <th>Budget</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVibes.length ? (
                        filteredVibes.map((v) => (
                          <tr key={v.id}>
                            <td className="admin-name-bold">{v.name || 'Untitled Spot'}</td>
                            <td>
                              <span className={`admin-mood-pill admin-mood-${String(v.mood).toLowerCase()}`}>
                                {v.mood || 'Calm'}
                              </span>
                            </td>
                            <td className="admin-td-email">{v.user_email || `User #${v.user_id || 'sys'}`}</td>
                            <td className="admin-td-mono">{Number(v.lat).toFixed(4)}, {Number(v.lon).toFixed(4)}</td>
                            <td><span className="admin-budget-pill">{v.budget || 'medium'}</span></td>
                            <td className="admin-td-date">{v.created_at ? new Date(v.created_at).toLocaleDateString() : 'N/A'}</td>
                            <td>
                              <button
                                type="button"
                                className="admin-view-pin-btn"
                                onClick={() => {
                                  setViewState((prev) => ({
                                    ...prev,
                                    latitude: Number(v.lat),
                                    longitude: Number(v.lon),
                                    zoom: 14
                                  }));
                                  setSelectedPin(v);
                                  navigateToView('explore');
                                }}
                              >
                                🗺️ View on Map
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" className="admin-empty-table">No spatial vibe pins found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: BOARDS */}
          {adminTab === 'boards' && (
            <div className="admin-tab-content">
              <div className="admin-card">
                <div className="admin-card-header">
                  <h3>User Travel Boards & Curations</h3>
                </div>
                <div className="admin-table-container">
                  <table className="admin-full-table">
                    <thead>
                      <tr>
                        <th>Board Title</th>
                        <th>Owner Email</th>
                        <th>Description</th>
                        <th>Pins Count</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminAllBoards.length ? (
                        adminAllBoards.map((b) => (
                          <tr key={b.id}>
                            <td className="admin-name-bold">{b.name || 'Untitled Board'}</td>
                            <td className="admin-td-email">{b.user_email || `User #${b.user_id}`}</td>
                            <td className="admin-td-desc">{b.description || 'No description'}</td>
                            <td><span className="admin-item-count-badge">{b.item_count || 0} spots</span></td>
                            <td className="admin-td-date">{b.created_at ? new Date(b.created_at).toLocaleDateString() : 'N/A'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="admin-empty-table">No boards found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: AUDIT LOGS */}
          {adminTab === 'audit' && (
            <div className="admin-tab-content">
              <div className="admin-card">
                <div className="admin-card-header">
                  <div className="admin-header-with-search">
                    <h3>Platform Security & Audit Event Ledger</h3>
                    <input
                      type="text"
                      className="admin-search-input"
                      placeholder="Filter audit logs by action or user..."
                      value={adminAuditSearch}
                      onChange={(e) => setAdminAuditSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="admin-audit-log-full-list">
                  {filteredAudit.length ? (
                    filteredAudit.map((log) => (
                      <div key={log.id} className="admin-audit-log-row">
                        <div className="admin-audit-log-left">
                          <span className="admin-audit-badge">{log.action}</span>
                          <span className="admin-audit-log-user">{log.user_email || log.user_name || `User #${log.user_id || 'System'}`}</span>
                          {log.metadata && (
                            <span className="admin-audit-log-meta">
                              {JSON.stringify(log.metadata).slice(0, 100)}
                            </span>
                          )}
                        </div>
                        <div className="admin-audit-log-time">
                          {new Date(log.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="admin-empty-table">No audit records found.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SYSTEM TOOLS */}
          {adminTab === 'system' && (
            <div className="admin-tab-content">
              <div className="admin-card">
                <div className="admin-card-header">
                  <h3>⚙️ System Maintenance & Developer Tooling</h3>
                </div>
                <div className="admin-card-body admin-system-grid">
                  <div className="admin-system-item">
                    <h4>🌱 Seed Demo Dataset</h4>
                    <p>Populates the database with demo landmarks, ratings, and reviews across New Delhi.</p>
                    <button
                      type="button"
                      className="admin-btn-system admin-btn-seed"
                      onClick={() => {
                        loadDemoData(false);
                        setTimeout(loadAdminOverview, 800);
                      }}
                    >
                      Seed Demo Data
                    </button>
                  </div>

                  <div className="admin-system-item">
                    <h4>⚠️ Reset Demo Store</h4>
                    <p>Purges demo-seeded records and restores default exploration points.</p>
                    <button
                      type="button"
                      className="admin-btn-system admin-btn-reset"
                      onClick={() => {
                        loadDemoData(true);
                        setTimeout(loadAdminOverview, 800);
                      }}
                    >
                      Reset Demo Store
                    </button>
                  </div>

                  <div className="admin-system-item">
                    <h4>🧹 Clean Expired Sessions</h4>
                    <p>Purges revoked JWT session tokens older than 30 days from PostgreSQL.</p>
                    <button
                      type="button"
                      className="admin-btn-system admin-btn-clean"
                      onClick={handleCleanSessions}
                      disabled={adminCleaningSessions}
                    >
                      {adminCleaningSessions ? 'Cleaning...' : 'Clean Expired Sessions'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ADMIN USER INSPECTOR MODAL */}
        {selectedAdminUser && (
          <div className="admin-inspector-overlay" onClick={() => setSelectedAdminUser(null)}>
            <div className="admin-inspector-modal" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="admin-inspector-header">
                <div className="admin-inspector-user-info">
                  <div className="admin-user-avatar-large">
                    {String(selectedAdminUser.user.name || selectedAdminUser.user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="admin-inspector-user-meta">
                    <div className="admin-inspector-user-name-row">
                      <h2>{selectedAdminUser.user.name}</h2>
                      <span className={`admin-role-tag admin-role-${String(selectedAdminUser.user.role).toLowerCase().replace(/\s+/g, '-')}`}>
                        {selectedAdminUser.user.role}
                      </span>
                      {selectedAdminUser.user.has_google_auth && (
                        <span className="admin-badge" style={{ backgroundColor: 'rgba(66, 133, 244, 0.2)', color: '#8ab4f8' }}>
                          🔵 Google Auth
                        </span>
                      )}
                    </div>
                    <div className="admin-inspector-submeta">
                      <span>✉️ {selectedAdminUser.user.email}</span>
                      <span>🆔 User ID: #{selectedAdminUser.user.id}</span>
                      <span>📅 Joined: {selectedAdminUser.user.created_at ? new Date(selectedAdminUser.user.created_at).toLocaleDateString() : 'N/A'}</span>
                      <span>🕒 Last Login: {selectedAdminUser.stats.last_login ? new Date(selectedAdminUser.stats.last_login).toLocaleString() : 'Recent'}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-inspector-close-btn"
                  onClick={() => setSelectedAdminUser(null)}
                  title="Close Inspector"
                >
                  ✕
                </button>
              </div>

              {/* KPI Stat Cards Grid */}
              <div className="admin-inspector-stats-grid">
                <div className="admin-kpi-metric-card admin-inspector-kpi">
                  <div className="admin-kpi-metric-top">
                    <span className="admin-kpi-metric-icon">📍</span>
                    <span className="admin-kpi-metric-badge">Pins</span>
                  </div>
                  <div className="admin-kpi-metric-val">{selectedAdminUser.stats.vibe_pins_count}</div>
                  <div className="admin-kpi-metric-title">Saved Vibe Pins</div>
                </div>

                <div className="admin-kpi-metric-card admin-inspector-kpi">
                  <div className="admin-kpi-metric-top">
                    <span className="admin-kpi-metric-icon">📋</span>
                    <span className="admin-kpi-metric-badge">Boards</span>
                  </div>
                  <div className="admin-kpi-metric-val">{selectedAdminUser.stats.boards_count}</div>
                  <div className="admin-kpi-metric-title">Travel Collections</div>
                </div>

                <div className="admin-kpi-metric-card admin-inspector-kpi">
                  <div className="admin-kpi-metric-top">
                    <span className="admin-kpi-metric-icon">🏠</span>
                    <span className="admin-kpi-metric-badge">Places</span>
                  </div>
                  <div className="admin-kpi-metric-val">{selectedAdminUser.stats.saved_places_count}</div>
                  <div className="admin-kpi-metric-title">Saved Shortcuts</div>
                </div>

                <div className="admin-kpi-metric-card admin-inspector-kpi">
                  <div className="admin-kpi-metric-top">
                    <span className="admin-kpi-metric-icon">🎭</span>
                    <span className="admin-kpi-metric-badge">Top Mood</span>
                  </div>
                  <div className="admin-kpi-metric-val" style={{ fontSize: '18px', textTransform: 'capitalize' }}>
                    {selectedAdminUser.stats.favorite_mood || 'None'}
                  </div>
                  <div className="admin-kpi-metric-title">Favorite Mood</div>
                </div>

                <div className="admin-kpi-metric-card admin-inspector-kpi">
                  <div className="admin-kpi-metric-top">
                    <span className="admin-kpi-metric-icon">⚡</span>
                    <span className="admin-kpi-metric-badge">Sessions</span>
                  </div>
                  <div className="admin-kpi-metric-val">{selectedAdminUser.stats.active_sessions_count}</div>
                  <div className="admin-kpi-metric-title">Active Sessions</div>
                </div>

                <div className="admin-kpi-metric-card admin-inspector-kpi">
                  <div className="admin-kpi-metric-top">
                    <span className="admin-kpi-metric-icon">📜</span>
                    <span className="admin-kpi-metric-badge">Audit</span>
                  </div>
                  <div className="admin-kpi-metric-val">{selectedAdminUser.stats.activity_events_count}</div>
                  <div className="admin-kpi-metric-title">Activity Events</div>
                </div>
              </div>

              {/* Tab Selector */}
              <div className="admin-tabs" style={{ marginBottom: '16px' }}>
                <button
                  type="button"
                  className={`admin-tab-btn ${adminInspectorTab === 'pins' ? 'admin-tab-active' : ''}`}
                  onClick={() => setAdminInspectorTab('pins')}
                >
                  📍 Saved Pins ({selectedAdminUser.vibes.length})
                </button>
                <button
                  type="button"
                  className={`admin-tab-btn ${adminInspectorTab === 'boards' ? 'admin-tab-active' : ''}`}
                  onClick={() => setAdminInspectorTab('boards')}
                >
                  📋 Travel Boards ({selectedAdminUser.boards.length})
                </button>
                <button
                  type="button"
                  className={`admin-tab-btn ${adminInspectorTab === 'places' ? 'admin-tab-active' : ''}`}
                  onClick={() => setAdminInspectorTab('places')}
                >
                  🏠 Saved Places ({selectedAdminUser.saved_places.length})
                </button>
                <button
                  type="button"
                  className={`admin-tab-btn ${adminInspectorTab === 'preferences' ? 'admin-tab-active' : ''}`}
                  onClick={() => setAdminInspectorTab('preferences')}
                >
                  ⚙️ Preferences
                </button>
                <button
                  type="button"
                  className={`admin-tab-btn ${adminInspectorTab === 'activity' ? 'admin-tab-active' : ''}`}
                  onClick={() => setAdminInspectorTab('activity')}
                >
                  📜 Activity Trail ({selectedAdminUser.activity_trail.length})
                </button>
                <button
                  type="button"
                  className={`admin-tab-btn ${adminInspectorTab === 'sessions' ? 'admin-tab-active' : ''}`}
                  onClick={() => setAdminInspectorTab('sessions')}
                >
                  ⚡ Sessions ({selectedAdminUser.sessions.length})
                </button>
              </div>

              {/* Tab Content Body */}
              <div className="admin-inspector-body">
                {/* PINS TAB */}
                {adminInspectorTab === 'pins' && (
                  <div className="admin-table-container">
                    <table className="admin-full-table">
                      <thead>
                        <tr>
                          <th>Spot Name</th>
                          <th>Mood</th>
                          <th>Coordinates</th>
                          <th>Budget</th>
                          <th>Note / Song</th>
                          <th>Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedAdminUser.vibes.length ? (
                          selectedAdminUser.vibes.map((p) => (
                            <tr key={p.id}>
                              <td className="admin-name-bold">{p.name || 'Vibe Pin'}</td>
                              <td>
                                <span className={`admin-mood-pill admin-mood-${String(p.mood).toLowerCase()}`}>
                                  {p.mood}
                                </span>
                              </td>
                              <td className="admin-td-coord">{Number(p.lat).toFixed(4)}, {Number(p.lon).toFixed(4)}</td>
                              <td><span className="admin-badge">{p.budget || 'free'}</span></td>
                              <td className="admin-td-note">{p.note || p.song || '—'}</td>
                              <td className="admin-td-date">{p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Active'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan="6" className="admin-empty-table">This user has not created any vibe pins yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* BOARDS TAB */}
                {adminInspectorTab === 'boards' && (
                  <div className="admin-table-container">
                    <table className="admin-full-table">
                      <thead>
                        <tr>
                          <th>Board Name</th>
                          <th>Description</th>
                          <th>Items Count</th>
                          <th>Created</th>
                          <th>Items</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedAdminUser.boards.length ? (
                          selectedAdminUser.boards.map((b) => (
                            <tr key={b.id}>
                              <td className="admin-name-bold">{b.name}</td>
                              <td className="admin-td-note">{b.description || 'No description'}</td>
                              <td><span className="admin-badge">{b.items?.length || b.item_count || 0} spots</span></td>
                              <td className="admin-td-date">{b.created_at ? new Date(b.created_at).toLocaleDateString() : 'Active'}</td>
                              <td>
                                <div className="admin-board-items-chips">
                                  {b.items && b.items.length ? (
                                    b.items.map((item, idx) => (
                                      <span key={item.id || idx} className="admin-item-chip">
                                        📍 {item.title || item.vibe_name || 'Spot'} ({item.vibe_mood || 'Vibe'})
                                      </span>
                                    ))
                                  ) : (
                                    <span className="admin-empty-text">No items</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan="5" className="admin-empty-table">This user has no travel boards yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* PLACES TAB */}
                {adminInspectorTab === 'places' && (
                  <div className="admin-table-container">
                    <table className="admin-full-table">
                      <thead>
                        <tr>
                          <th>Slot</th>
                          <th>Label</th>
                          <th>Address</th>
                          <th>Coordinates</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedAdminUser.saved_places.length ? (
                          selectedAdminUser.saved_places.map((sp) => (
                            <tr key={sp.id}>
                              <td className="admin-name-bold">
                                {sp.slot === 'home' ? '🏠 Home' : sp.slot === 'work' ? '💼 Work' : '⭐ ' + sp.slot}
                              </td>
                              <td>{sp.label || 'Saved Place'}</td>
                              <td>{sp.address || '—'}</td>
                              <td className="admin-td-coord">{Number(sp.lat).toFixed(4)}, {Number(sp.lon).toFixed(4)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan="4" className="admin-empty-table">No saved shortcuts found for this user.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* PREFERENCES TAB */}
                {adminInspectorTab === 'preferences' && (
                  <div className="admin-inspector-pref-card">
                    {selectedAdminUser.preferences ? (
                      <div className="admin-inspector-pref-grid">
                        <div className="admin-pref-item">
                          <span className="admin-pref-label">Theme</span>
                          <span className="admin-pref-value">{selectedAdminUser.preferences.theme || 'Dark'}</span>
                        </div>
                        <div className="admin-pref-item">
                          <span className="admin-pref-label">Default Mood</span>
                          <span className="admin-pref-value">{selectedAdminUser.preferences.default_mood || 'Calm'}</span>
                        </div>
                        <div className="admin-pref-item">
                          <span className="admin-pref-label">Route Mode</span>
                          <span className="admin-pref-value">{selectedAdminUser.preferences.route_mode || 'Walking'}</span>
                        </div>
                        <div className="admin-pref-item">
                          <span className="admin-pref-label">Budget</span>
                          <span className="admin-pref-value">{selectedAdminUser.preferences.budget || 'Medium'}</span>
                        </div>
                        <div className="admin-pref-item">
                          <span className="admin-pref-label">Prefer Scenic</span>
                          <span className="admin-pref-value">{selectedAdminUser.preferences.prefer_scenic ? '✅ Enabled' : '❌ Disabled'}</span>
                        </div>
                        <div className="admin-pref-item">
                          <span className="admin-pref-label">Voice Alerts</span>
                          <span className="admin-pref-value">{selectedAdminUser.preferences.voice_alerts ? '✅ Enabled' : '❌ Disabled'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="admin-empty-table">Default system preferences active for this user.</div>
                    )}
                  </div>
                )}

                {/* ACTIVITY TAB */}
                {adminInspectorTab === 'activity' && (
                  <div className="admin-table-container">
                    <table className="admin-full-table">
                      <thead>
                        <tr>
                          <th>Event Type</th>
                          <th>Metadata Summary</th>
                          <th>Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedAdminUser.activity_trail.length ? (
                          selectedAdminUser.activity_trail.map((ev) => (
                            <tr key={ev.id}>
                              <td><span className="admin-badge">{ev.event_type}</span></td>
                              <td className="admin-td-note">
                                {typeof ev.metadata === 'object' ? JSON.stringify(ev.metadata) : String(ev.metadata || '—')}
                              </td>
                              <td className="admin-td-date">{ev.created_at ? new Date(ev.created_at).toLocaleString() : 'Recent'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan="3" className="admin-empty-table">No recorded activity for this user.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* SESSIONS TAB */}
                {adminInspectorTab === 'sessions' && (
                  <div className="admin-table-container">
                    <table className="admin-full-table">
                      <thead>
                        <tr>
                          <th>Session ID</th>
                          <th>Status</th>
                          <th>Created At</th>
                          <th>Expires At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedAdminUser.sessions.length ? (
                          selectedAdminUser.sessions.map((sess) => (
                            <tr key={sess.id}>
                              <td className="admin-td-coord">{sess.id}</td>
                              <td>
                                <span className={`admin-badge ${sess.is_active ? 'admin-badge-active' : ''}`}>
                                  {sess.is_active ? '🟢 Active' : sess.revoked_at ? '🔴 Revoked' : '⚪ Expired'}
                                </span>
                              </td>
                              <td className="admin-td-date">{sess.created_at ? new Date(sess.created_at).toLocaleString() : 'N/A'}</td>
                              <td className="admin-td-date">{sess.expires_at ? new Date(sess.expires_at).toLocaleString() : 'N/A'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan="4" className="admin-empty-table">No active sessions found for this user.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (activeView === 'user') {
    if (!authState.isLoggedIn) {
      return (
        <div className="admin-page-root">
          <div className="admin-access-denied-card">
            <div className="admin-access-denied-icon">👤</div>
            <h2 className="admin-access-denied-title">Personal Dashboard Login Required</h2>
            <p className="admin-access-denied-text">Sign in to your account to access your saved places, curated travel boards, and mood journey preferences.</p>
            <div className="admin-access-denied-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  navigateToView('explore');
                  openAuthModalFor('Please sign in to access your personal dashboard.');
                }}
              >
                Sign In / Register
              </button>
              <button type="button" className="btn-secondary" onClick={() => navigateToView('explore')}>
                Explore Map as Guest
              </button>
            </div>
          </div>
        </div>
      );
    }

    const myPins = pins.filter((p) => {
      const matchesSearch = !userPanelSearch || 
        String(p.name || '').toLowerCase().includes(userPanelSearch.toLowerCase()) ||
        String(p.note || '').toLowerCase().includes(userPanelSearch.toLowerCase());
      const matchesMood = userPanelMoodFilter === 'All' || String(p.mood).toLowerCase() === userPanelMoodFilter.toLowerCase();
      return matchesSearch && matchesMood;
    });

    const moodCounts = {};
    pins.forEach((p) => {
      if (p.mood) moodCounts[p.mood] = (moodCounts[p.mood] || 0) + 1;
    });
    let topMood = 'Calm';
    let maxMoodCount = 0;
    Object.entries(moodCounts).forEach(([mood, count]) => {
      if (count > maxMoodCount) {
        maxMoodCount = count;
        topMood = mood;
      }
    });

    const savedPlacesList = [];
    if (favoritePlaces?.home) savedPlacesList.push({ type: 'home', name: favoritePlaces.home.label || 'Home', lat: favoritePlaces.home.lat, lon: favoritePlaces.home.lon, address: favoritePlaces.home.address });
    if (favoritePlaces?.work) savedPlacesList.push({ type: 'work', name: favoritePlaces.work.label || 'Work', lat: favoritePlaces.work.lat, lon: favoritePlaces.work.lon, address: favoritePlaces.work.address });

    return (
      <div className="admin-page-root">
        {/* User Navbar */}
        <header className="admin-navbar">
          <div className="admin-navbar-left">
            <button
              type="button"
              className="admin-back-btn"
              onClick={() => navigateToView('explore')}
            >
              ← Explore Map
            </button>
            <div className="admin-brand">
              <span className="admin-logo">VA</span>
              <span className="admin-brand-text">Vibe Atlas</span>
              <span className="user-badge-portal">USER PORTAL</span>
            </div>
          </div>

          <div className="admin-navbar-right">
            <div className="admin-status-pill">
              <span className="admin-status-dot" />
              <span>Personal Workspace Live</span>
            </div>
            {isAdminUser && (
              <button
                type="button"
                className="admin-nav-role-btn"
                onClick={() => navigateToView('admin')}
                title="Switch to Admin Portal"
              >
                🛡️ Switch to Admin
              </button>
            )}
            <div className="admin-profile-pill">
              <div className="admin-user-avatar-sm">{String(authState.name || authState.email || 'U').charAt(0).toUpperCase()}</div>
              <div className="admin-profile-meta">
                <span className="admin-profile-name">{authState.name || authState.email?.split('@')[0]}</span>
                <span className="admin-profile-role">{authState.role || 'Explorer'}</span>
              </div>
            </div>
            <button
              type="button"
              className="admin-logout-btn"
              onClick={() => {
                handleLogout();
                navigateToView('explore');
              }}
            >
              Logout
            </button>
          </div>
        </header>

        {/* User Dashboard Content */}
        <main className="admin-page-content">
          {/* Welcome Card & Summary */}
          <div className="user-welcome-card">
            <div className="user-welcome-left">
              <div className="user-avatar-large">{String(authState.name || authState.email || 'U').charAt(0).toUpperCase()}</div>
              <div className="user-welcome-meta">
                <div className="user-welcome-tag">Personal Journey Hub</div>
                <h1 className="user-welcome-title">Welcome, {authState.name || 'Explorer'}</h1>
                <p className="user-welcome-subtitle">
                  Account: <span className="user-meta-highlight">{authState.email}</span> • Role: <span className="user-meta-highlight">{authState.role || 'Explorer'}</span>
                </p>
              </div>
            </div>
            <div className="user-welcome-right">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  navigateToView('explore');
                  setTimeout(() => {
                    setIsPanelExpanded(true);
                    setActiveMenuSection('add');
                  }, 150);
                }}
              >
                ➕ Create New Vibe Pin
              </button>
            </div>
          </div>

          {/* KPI Stat Cards */}
          <div className="admin-kpi-row">
            <div className="admin-kpi-card">
              <div className="admin-kpi-header">
                <span className="admin-kpi-label">MY SAVED PLACES</span>
                <span className="admin-kpi-icon">📍</span>
              </div>
              <div className="admin-kpi-value">{pins.length}</div>
              <div className="admin-kpi-sub">Private spatial pins</div>
            </div>

            <div className="admin-kpi-card">
              <div className="admin-kpi-header">
                <span className="admin-kpi-label">FAVORITE MOOD</span>
                <span className="admin-kpi-icon">🎭</span>
              </div>
              <div className="admin-kpi-value" style={{ fontSize: '24px' }}>{topMood}</div>
              <div className="admin-kpi-sub">{maxMoodCount} places recorded</div>
            </div>

            <div className="admin-kpi-card">
              <div className="admin-kpi-header">
                <span className="admin-kpi-label">TRAVEL BOARDS</span>
                <span className="admin-kpi-icon">📋</span>
              </div>
              <div className="admin-kpi-value">{boards.length}</div>
              <div className="admin-kpi-sub">Curated journey collections</div>
            </div>

            <div className="admin-kpi-card">
              <div className="admin-kpi-header">
                <span className="admin-kpi-label">SAVED SHORTCUTS</span>
                <span className="admin-kpi-icon">🏠</span>
              </div>
              <div className="admin-kpi-value">{savedPlacesList.length}</div>
              <div className="admin-kpi-sub">Home & Work routes</div>
            </div>
          </div>

          {/* User Tab Navigation */}
          <div className="admin-tabs-bar">
            <div className="admin-tabs">
              <button
                type="button"
                className={`admin-tab-btn ${userPanelTab === 'pins' ? 'admin-tab-active' : ''}`}
                onClick={() => setUserPanelTab('pins')}
              >
                📍 My Saved Pins ({pins.length})
              </button>
              <button
                type="button"
                className={`admin-tab-btn ${userPanelTab === 'boards' ? 'admin-tab-active' : ''}`}
                onClick={() => setUserPanelTab('boards')}
              >
                📋 Travel Boards ({boards.length})
              </button>
              <button
                type="button"
                className={`admin-tab-btn ${userPanelTab === 'places' ? 'admin-tab-active' : ''}`}
                onClick={() => setUserPanelTab('places')}
              >
                🏠 Saved Places ({savedPlacesList.length})
              </button>
              <button
                type="button"
                className={`admin-tab-btn ${userPanelTab === 'preferences' ? 'admin-tab-active' : ''}`}
                onClick={() => setUserPanelTab('preferences')}
              >
                ⚙️ Profile & Preferences
              </button>
              <button
                type="button"
                className={`admin-tab-btn ${userPanelTab === 'history' ? 'admin-tab-active' : ''}`}
                onClick={() => setUserPanelTab('history')}
              >
                📜 My Activity Trail ({userHistoryList.length})
              </button>
            </div>
          </div>

          {/* USER TAB 1: PINS */}
          {userPanelTab === 'pins' && (
            <div className="admin-tab-content">
              <div className="admin-card">
                <div className="admin-card-header">
                  <div className="admin-header-with-search">
                    <h3>My Saved Vibe Places</h3>
                    <div className="admin-filter-group">
                      <select
                        className="admin-mood-filter-select"
                        value={userPanelMoodFilter}
                        onChange={(e) => setUserPanelMoodFilter(e.target.value)}
                      >
                        <option value="All">All Moods</option>
                        <option value="Calm">🌿 Calm</option>
                        <option value="Excited">⚡ Excited</option>
                        <option value="Musical">🎵 Musical</option>
                        <option value="Reflective">🌊 Reflective</option>
                        <option value="Melancholy">🌧️ Melancholy</option>
                      </select>
                      <input
                        type="text"
                        className="admin-search-input"
                        placeholder="Search my pins by name or note..."
                        value={userPanelSearch}
                        onChange={(e) => setUserPanelSearch(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div className="admin-table-container">
                  <table className="admin-full-table">
                    <thead>
                      <tr>
                        <th>Spot Name</th>
                        <th>Mood</th>
                        <th>Coordinates</th>
                        <th>Budget</th>
                        <th>Personal Note</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myPins.length ? (
                        myPins.map((p) => (
                          <tr key={p.id}>
                            <td className="admin-name-bold">{p.name || 'Untitled Place'}</td>
                            <td>
                              <span className={`admin-mood-pill admin-mood-${String(p.mood).toLowerCase()}`}>
                                {p.mood || 'Calm'}
                              </span>
                            </td>
                            <td className="admin-td-coord">{Number(p.lat || 0).toFixed(4)}, {Number(p.lon || 0).toFixed(4)}</td>
                            <td><span className="admin-budget-pill">{p.budget || 'free'}</span></td>
                            <td className="admin-td-note">{p.note || 'No notes added'}</td>
                            <td className="admin-td-actions">
                              <button
                                type="button"
                                className="admin-btn-map"
                                onClick={() => {
                                  setSelectedPin(p);
                                  setViewState((prev) => ({ ...prev, latitude: p.lat, longitude: p.lon, zoom: 15 }));
                                  navigateToView('explore');
                                }}
                                title="Zoom to spot on live map"
                              >
                                🗺️ View on Map
                              </button>
                              <button
                                type="button"
                                className="admin-delete-btn"
                                onClick={() => handleDeletePin(p.id)}
                                title="Delete this place"
                              >
                                🗑️ Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" className="admin-empty-table">
                            No saved pins found. Click "Create New Vibe Pin" to save places on the map!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* USER TAB 2: BOARDS */}
          {userPanelTab === 'boards' && (
            <div className="admin-tab-content">
              <div className="admin-card">
                <div className="admin-card-header">
                  <h3>My Curated Travel Boards</h3>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      navigateToView('explore');
                      setTimeout(() => {
                        setIsPanelExpanded(true);
                        setActiveMenuSection('boards');
                      }, 150);
                    }}
                  >
                    ➕ New Travel Board
                  </button>
                </div>
                <div className="admin-table-container">
                  <table className="admin-full-table">
                    <thead>
                      <tr>
                        <th>Board Title</th>
                        <th>Description</th>
                        <th>Saved Items</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boards.length ? (
                        boards.map((b) => (
                          <tr key={b.id}>
                            <td className="admin-name-bold">{b.name || 'Untitled Board'}</td>
                            <td className="admin-td-note">{b.description || 'Curated journey collection'}</td>
                            <td><span className="admin-badge">{b.items?.length || 0} spots</span></td>
                            <td className="admin-td-date">{b.created_at ? new Date(b.created_at).toLocaleDateString() : 'Active'}</td>
                            <td className="admin-td-actions">
                              <button
                                type="button"
                                className="admin-btn-map"
                                onClick={() => {
                                  setSelectedBoard(b);
                                  setSelectedBoardForPin(b.id);
                                  setActiveMenuSection('boards');
                                  setIsPanelExpanded(true);
                                  navigateToView('explore');
                                }}
                                title="View this board journey on map"
                              >
                                🗺️ Focus on Map
                              </button>
                              <button
                                type="button"
                                className="admin-delete-btn"
                                onClick={() => handleDeleteBoard(b.id)}
                                title="Delete this travel board"
                              >
                                🗑️ Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="admin-empty-table">
                            No travel boards created yet. Curate your first journey board in the Explore Map!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* USER TAB 3: PLACES */}
          {userPanelTab === 'places' && (
            <div className="admin-tab-content">
              <div className="admin-card">
                <div className="admin-card-header">
                  <h3>Saved Favorite Locations & Shortcuts</h3>
                </div>
                <div className="admin-table-container">
                  <table className="admin-full-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Location Name</th>
                        <th>Coordinates</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedPlacesList.length ? (
                        savedPlacesList.map((sp) => (
                          <tr key={sp.id || sp.type}>
                            <td className="admin-name-bold">
                              {sp.type === 'home' ? '🏠 Home' : sp.type === 'work' ? '💼 Work' : '⭐ Favorite'}
                            </td>
                            <td>{sp.name || sp.address || 'Saved Target'}</td>
                            <td className="admin-td-coord">{Number(sp.lat || 0).toFixed(4)}, {Number(sp.lon || 0).toFixed(4)}</td>
                            <td className="admin-td-actions">
                              <button
                                type="button"
                                className="admin-btn-map"
                                onClick={() => {
                                  setViewState((prev) => ({ ...prev, latitude: Number(sp.lat), longitude: Number(sp.lon), zoom: 15 }));
                                  setActiveMenuSection('routes');
                                  setIsPanelExpanded(true);
                                  navigateToView('explore');
                                }}
                              >
                                🚗 Focus on Map
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" className="admin-empty-table">
                            No saved home/work shortcuts yet. Add them from the Route Planner sidebar!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* USER TAB 4: PREFERENCES & SETTINGS */}
          {userPanelTab === 'preferences' && (
            <div className="admin-tab-content">
              <div className="admin-card">
                <div className="admin-card-header">
                  <h3>Emotional Travel Settings & Profile</h3>
                </div>
                <div className="admin-card-body" style={{ padding: '24px' }}>
                  <form onSubmit={handleUpdateUserProfile} className="user-profile-form">
                    <div className="user-form-group">
                      <label className="user-form-label">Display Name</label>
                      <div className="user-form-row">
                        <input
                          type="text"
                          className="admin-search-input"
                          value={userEditName}
                          onChange={(e) => setUserEditName(e.target.value)}
                          placeholder="Your display name"
                          style={{ maxWidth: '360px' }}
                        />
                        <button
                          type="submit"
                          className="btn-primary"
                          disabled={userSavingProfile}
                        >
                          {userSavingProfile ? 'Saving...' : '💾 Update Name'}
                        </button>
                      </div>
                    </div>

                    <div className="user-form-group" style={{ marginTop: '24px' }}>
                      <label className="user-form-label">Preferred Navigation Mood</label>
                      <div className="user-mood-radio-group">
                        {['Calm', 'Excited', 'Musical', 'Reflective', 'Melancholy'].map((m) => (
                          <button
                            key={m}
                            type="button"
                            className={`user-mood-choice ${currentMood === m ? 'user-mood-choice-active' : ''}`}
                            onClick={() => handleMoodChange(m)}
                          >
                            {m === 'Calm' ? '🌿' : m === 'Excited' ? '⚡' : m === 'Musical' ? '🎵' : m === 'Reflective' ? '🌊' : '🌧️'} {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="user-form-group" style={{ marginTop: '24px' }}>
                      <label className="user-form-label">Preferred Transit Mode</label>
                      <div className="user-mood-radio-group">
                        {['walking', 'cycling', 'driving'].map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            className={`user-mood-choice ${routeMode === mode ? 'user-mood-choice-active' : ''}`}
                            onClick={() => setRouteMode(mode)}
                          >
                            {mode === 'walking' ? '🚶 Walking' : mode === 'cycling' ? '🚴 Cycling' : '🚗 Driving'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* USER TAB 5: ACTIVITY TRAIL */}
          {userPanelTab === 'history' && (
            <div className="admin-tab-content">
              <div className="admin-card">
                <div className="admin-card-header">
                  <h3>My Personal Activity Trail</h3>
                  <span className="admin-badge">Audit Verified</span>
                </div>
                <div className="admin-audit-log-full-list">
                  {userHistoryList.length ? (
                    userHistoryList.map((log) => (
                      <div key={log.id} className="admin-audit-log-row">
                        <div className="admin-audit-log-left">
                          <span className="admin-audit-badge">{log.action || log.event_type}</span>
                          <span className="admin-audit-log-user">{log.details || log.spot_name || log.note || 'User Action'}</span>
                        </div>
                        <div className="admin-audit-log-time">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : 'Recent'}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="admin-empty-table">No history events recorded yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  if (activeView === 'landing') {
    return (
      <div className="landing-screen">
        <div className="landing-glow landing-glow-a" />
        <div className="landing-glow landing-glow-b" />
        <div className="landing-card">
          <div className="landing-kicker">Emotion-first journey mapping</div>
          <h1 className="landing-title">{APP_NAME}</h1>
          <p className="landing-subtitle">
            Explore the live map instantly as a guest. Login only when you want to save personal vibes, favorites, routes, or profile data.
          </p>
          <div className="landing-actions">
            <button type="button" className="btn-primary" onClick={() => navigateToView('explore')}>
              Explore as Guest
            </button>
            {!authState.isLoggedIn && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  navigateToView('explore');
                  openAuthModalFor('Login or create an account to unlock personal features.');
                }}
              >
                Login / Sign Up
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell theme-${currentMood.toLowerCase()}`}>
      <div className="ambient-orb ambient-orb-one" />
      <div className="ambient-orb ambient-orb-two" />

      <Map
        ref={mapRef}
        initialViewState={viewState}
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
        mapStyle={MAP_STYLE}
        mapLib={maplibregl}
        antialias
        maxPitch={85}
        dragPan
        scrollZoom={{ cursor: 'grab', around: 'center' }}
        doubleClickZoom
        dragRotate
        touchZoomRotate
        touchPitch
        cooperativeGestures
        attributionControl={{ compact: true }}
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
          if (userLocation) {
            const distanceFromUserKm = haversineKm(
              Number(e.viewState.latitude),
              Number(e.viewState.longitude),
              userLocation.lat,
              userLocation.lon
            );
            const centeredThresholdKm = Math.max((Number(userLocation.accuracy) || 25) / 1000, 0.03);
            setIsMapCenteredOnUser(distanceFromUserKm <= centeredThresholdKm);
          }
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
          {locationError && (
            <div className="map-error-banner map-location-banner" role="status" aria-live="polite">
              <strong>Current location:</strong> {locationError}
            </div>
          )}


        {userLocationAccuracyGeoJson && (
          <Source id="user-location-accuracy" type="geojson" data={userLocationAccuracyGeoJson}>
            <Layer
              id="user-location-accuracy-fill"
              type="fill"
              paint={{ 'fill-color': '#3b82f6', 'fill-opacity': 0.14 }}
            />
            <Layer
              id="user-location-accuracy-outline"
              type="line"
              paint={{ 'line-color': '#3b82f6', 'line-opacity': 0.45, 'line-width': 1.5 }}
            />
          </Source>
        )}

        {userLocation && (
          <Marker longitude={userLocation.lon} latitude={userLocation.lat} anchor="center">
            <div className="user-location-dot" title={userLocation.accuracy ? `Current location (±${Math.round(userLocation.accuracy)} m)` : 'Current location'}>
              <span />
            </div>
          </Marker>
        )}

        {destination && (
          <Marker longitude={Number(destination.lon)} latitude={Number(destination.lat)} anchor="bottom">
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer'
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPin(destination);
              }}
              title={`Destination: ${destination.name || destination.note || 'Target'}`}
            >
              <div
                style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: '800',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.45)',
                  marginBottom: '2px',
                  whiteSpace: 'nowrap'
                }}
              >
                🎯 {destination.name || 'Destination'}
              </div>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  border: '2.5px solid #ffffff',
                  background: '#ef4444',
                  boxShadow: '0 0 0 4px rgba(239, 68, 68, 0.25)'
                }}
              />
            </div>
          </Marker>
        )}

        {destination && effectiveStart && (
          <Marker longitude={Number(effectiveStart.lon)} latitude={Number(effectiveStart.lat)} anchor="bottom">
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer'
              }}
              title={`Route Start: ${effectiveStart.label || 'Origin'}`}
            >
              <div
                style={{
                  background: '#10b981',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: '800',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.45)',
                  marginBottom: '2px',
                  whiteSpace: 'nowrap'
                }}
              >
                🏁 Start ({effectiveStart.label || 'Origin'})
              </div>
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: '2px solid #ffffff',
                  background: '#10b981',
                  boxShadow: '0 0 0 4px rgba(16, 185, 129, 0.25)'
                }}
              />
            </div>
          </Marker>
        )}

        {/* Intermediate Route Waypoint Stop Markers */}
        {destination && Array.isArray(suggestedRoute) && suggestedRoute.map((wp, idx) => {
          const isSelected = selectedPin && String(selectedPin.id || '') === String(wp.id || '');
          return (
            <Marker
              key={wp.id || `wp_${idx}_${wp.lat}_${wp.lon}`}
              longitude={Number(wp.lon)}
              latitude={Number(wp.lat)}
              anchor="bottom"
            >
              <div
                className="route-waypoint-pin"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPin(wp);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: isSelected ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'rgba(15, 26, 44, 0.94)',
                  color: '#ffffff',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  border: '1.5px solid rgba(255, 255, 255, 0.35)',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
                  fontSize: '11px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
                title={`Stop ${idx + 1}: ${wp.name || wp.note || 'Vibe stop'} (${wp.mood || 'Vibe'})`}
              >
                <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '50%', width: '16px', height: '16px', display: 'grid', placeItems: 'center', fontSize: '10px' }}>
                  {idx + 1}
                </span>
                <span>{wp.name || `Stop ${idx + 1}`}</span>
              </div>
            </Marker>
          );
        })}

        {selectedPin && (
          <Popup
            longitude={selectedPin.lon}
            latitude={selectedPin.lat}
            onClose={() => {
              setSelectedPin(null);
              setPopupShowMore(false);
            }}
            closeButton={false}
            offset={[0, -8]}
          >
            <div className="compact-popup">
              <div className="compact-popup-header">
                <h3 className="compact-popup-name">{selectedPin.name || 'Vibe Spot'}</h3>
              </div>
              <div className="compact-popup-mood-row">
                {(selectedPin.moodTags?.length ? selectedPin.moodTags : [selectedPin.mood])
                  .filter(Boolean)
                  .slice(0, 3)
                  .map((tag) => (
                    <span
                      key={tag}
                      className="compact-popup-mood-chip"
                      style={{
                        background: `var(--accent-soft)`,
                        color: `var(--accent)`
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                      {tag}
                    </span>
                  ))}
                <span
                  className={`compact-popup-mood-chip`}
                  style={{
                    background:
                      selectedPin.budget === 'free'
                        ? 'rgba(16, 112, 65, 0.1)'
                        : selectedPin.budget === 'low'
                          ? 'rgba(37, 99, 235, 0.1)'
                          : selectedPin.budget === 'luxury'
                            ? 'rgba(139, 92, 246, 0.1)'
                            : 'rgba(15, 28, 52, 0.06)',
                    color:
                      selectedPin.budget === 'free'
                        ? '#107041'
                        : selectedPin.budget === 'low'
                          ? '#2563eb'
                          : selectedPin.budget === 'luxury'
                            ? '#8b5cf6'
                            : 'var(--text-secondary)'
                  }}
                >
                  {selectedPin.budget === 'free' ? '🆓 Free' : selectedPin.budget === 'low' ? '💸 Low' : selectedPin.budget === 'luxury' ? '💎 Luxury' : '💰 Medium'}
                </span>
              </div>
              <div className="compact-popup-rating-row">
                <div className="compact-popup-rating">
                  <span>★</span>
                  <span>{Number(selectedPin.ratings?.overall || 0).toFixed(1)}</span>
                </div>
                {userLocation && (
                  <div className="compact-popup-distance">
                    📍 {haversineKm(userLocation.lat, userLocation.lon, selectedPin.lat, selectedPin.lon).toFixed(1)} km
                  </div>
                )}
              </div>
              <p className="compact-popup-desc">{selectedPin.note || 'A vibe spot waiting to be discovered.'}</p>
              <div className="compact-popup-actions">
                <button
                  type="button"
                  className="btn-explore"
                  onClick={() => {
                    ensureDestinationPin(selectedPin.lat, selectedPin.lon, selectedPin.name || selectedPin.note || 'Vibe spot');
                    setNavDestinationQuery(selectedPin.name || selectedPin.note || 'Vibe spot');
                    setRouteActionMessage('Destination set. Open Directions to begin.');
                    setIsPanelExpanded(true);
                    setActivePanelTab('route');
                    setSelectedPin(null);
                  }}
                >
                  Explore
                </button>
                <button
                  type="button"
                  className={`btn-action-ghost ${selectedPin.favorite ? 'btn-action-ghost-active' : ''}`}
                  onClick={() => toggleFavoritePin(selectedPin)}
                  title={selectedPin.favorite ? 'Remove from favorites' : 'Save to favorites'}
                >
                  {selectedPin.favorite ? '★' : '☆'}
                </button>
                <button
                  type="button"
                  className="btn-action-ghost"
                  onClick={() => {
                    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${selectedPin.lat},${selectedPin.lon}`)}`;
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  title="Open in Google Maps"
                >
                  🧭
                </button>
              </div>
              <div className="compact-popup-extra-actions">
                <button
                  type="button"
                  className="btn-popup-extra"
                  onClick={() => handleOpenEditPin(selectedPin)}
                  title="Edit this pin"
                >
                  ✏️ Edit
                </button>
                <button
                  type="button"
                  className="btn-popup-extra"
                  onClick={() => {
                    setAddPinToBoardTarget(selectedPin);
                    if (!boards.length) loadBoards();
                  }}
                  title="Add to a Board"
                >
                  📋 + Board
                </button>
                <button
                  type="button"
                  className="btn-popup-extra btn-popup-delete-btn"
                  onClick={() => handleDeletePin(selectedPin.id)}
                  title="Delete this pin"
                >
                  🗑️ Delete
                </button>
              </div>
              <button
                type="button"
                className="compact-popup-more-toggle"
                onClick={() => setPopupShowMore((p) => !p)}
              >
                {popupShowMore ? 'Hide details ▲' : 'More details ▼'}
              </button>
              {popupShowMore && (
                <div className="compact-popup-details">
                  {selectedPin.type && (
                    <div className="popup-detail-item">
                      <p className="popup-detail-label">Type</p>
                      <p className="popup-detail-value">{selectedPin.type}</p>
                    </div>
                  )}
                  {selectedPin.bestTime && (
                    <div className="popup-detail-item">
                      <p className="popup-detail-label">Best time</p>
                      <p className="popup-detail-value">{selectedPin.bestTime}</p>
                    </div>
                  )}
                  {!!selectedPin.hiddenScore && (
                    <div className="popup-detail-item">
                      <p className="popup-detail-label">Hidden score</p>
                      <p className="popup-detail-value">{selectedPin.hiddenScore}/5</p>
                    </div>
                  )}
                  <div className="popup-detail-item">
                    <p className="popup-detail-label">Crowd</p>
                    <p className="popup-detail-value">{selectedPin.crowdLevel || 'Medium'}</p>
                  </div>
                  <div className="popup-detail-item">
                    <p className="popup-detail-label">Safety</p>
                    <p className="popup-detail-value">{Number(selectedPin.safety || selectedPin.ratings?.safety || 4).toFixed(1)}/5</p>
                  </div>
                  <div className="popup-detail-item">
                    <p className="popup-detail-label">Wi-Fi</p>
                    <p className="popup-detail-value">{selectedPin.wifi ? 'Available' : 'N/A'}</p>
                  </div>
                  <div className="popup-detail-item">
                    <p className="popup-detail-label">Song</p>
                    <p className="popup-detail-value">{selectedPin.song || 'None'}</p>
                  </div>
                  <div className="popup-detail-item">
                    <p className="popup-detail-label">Added</p>
                    <p className="popup-detail-value">{formatTime(selectedPin.time)}</p>
                  </div>
                  {selectedPin.routeType && (
                    <div className="popup-detail-item">
                      <p className="popup-detail-label">Route type</p>
                      <p className="popup-detail-value">{selectedPin.routeType}</p>
                    </div>
                  )}
                  <div className="popup-detail-item">
                    <p className="popup-detail-label">Weather</p>
                    <p className="popup-detail-value">{selectedPin.weather || weather.label}</p>
                  </div>
                  {!!selectedPin.reviews?.length && (
                    <div className="popup-detail-item" style={{ gridColumn: '1 / -1' }}>
                      <p className="popup-detail-label">Recent reviews</p>
                      {selectedPin.reviews.slice(0, 2).map((r, idx) => (
                        <p key={`${r.user}-${idx}`} className="popup-detail-value" style={{ marginTop: 4 }}>
                          <strong>{r.user}</strong>: {r.text || 'No note'} ({r.rating}/5)
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Popup>
        )}

        {tempPin && (
          <Marker
            longitude={tempPin.lng}
            latitude={tempPin.lat}
            anchor="bottom"
            style={{ zIndex: 5 }}
          >
            <div className="temppin-pin-anchor" aria-hidden="true">
              <div className="temppin-pin-pulse" />
              <div className="temppin-pin-dot" />
            </div>
          </Marker>
        )}
      </Map>

      {tempPin && (
        <div
          className="temppin-floating-layer"
          style={{ pointerEvents: 'none' }}
        >
          <div
            className="temppin-floating-card"
            style={{ pointerEvents: 'auto' }}
            role="dialog"
            aria-label="Add a Vibe Spot"
          >
            <div className="temppin-floating-grabber" aria-hidden="true" />
            <button
              type="button"
              className="temppin-floating-close"
              onClick={() => {
                setTempPin(null);
                setTempPinShowAdvanced(false);
              }}
              aria-label="Close Add Vibe form"
            >
              ✕
            </button>
            <div className="temppin-floating-body">
              <div className="compact-temppin">
                <h3 className="compact-temppin-title">Add a Vibe Spot</h3>
                <p className="temppin-location-preview">
                  Pin preview · {Number(tempPin.lat).toFixed(5)}, {Number(tempPin.lng).toFixed(5)}
                </p>

                <div className="temppin-field">
                  <p className="temppin-field-label">Name this place</p>
                  <input
                    className="temppin-text-input"
                    placeholder="Sunset viewpoint, cozy café…"
                    value={tempPin.name || ''}
                    onChange={(e) => setTempPin((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="temppin-field">
                  <p className="temppin-field-label">How does it feel?</p>
                  <div className="temppin-chip-row">
                    {MOODS.map((m) => {
                      const active = tempPin.mood === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          className={`temppin-chip ${active ? 'temppin-chip-active' : ''}`}
                          onClick={() =>
                            setTempPin((prev) => ({
                              ...prev,
                              mood: m,
                              moodTags: [moodToTag(m)]
                            }))
                          }
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="temppin-field">
                  <p className="temppin-field-label">Budget</p>
                  <div className="temppin-chip-row">
                    {[
                      { v: 'free', l: '🆓 Free' },
                      { v: 'low', l: '💸 Low' },
                      { v: 'medium', l: '💰 Mid' },
                      { v: 'luxury', l: '💎 Luxury' }
                    ].map((b) => (
                      <button
                        key={b.v}
                        type="button"
                        className={`temppin-chip ${(tempPin.budget || 'medium') === b.v ? 'temppin-chip-active' : ''}`}
                        onClick={() => setTempPin((prev) => ({ ...prev, budget: b.v }))}
                      >
                        {b.l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="temppin-field">
                  <p className="temppin-field-label">Memory or note</p>
                  <textarea
                    className="temppin-text-input temppin-textarea"
                    placeholder="A short note about the vibe…"
                    value={tempPin.note || ''}
                    onChange={(e) => setTempPin((prev) => ({ ...prev, note: e.target.value }))}
                  />
                </div>

                <button
                  type="button"
                  className="temppin-advanced-toggle"
                  onClick={() => setTempPinShowAdvanced((p) => !p)}
                >
                  {tempPinShowAdvanced ? 'Hide advanced ▲' : 'Advanced options ▼'}
                </button>

                {tempPinShowAdvanced && (
                  <div className="temppin-advanced">
                    <div className="temppin-field">
                      <p className="temppin-field-label">Mood tag</p>
                      <div className="temppin-chip-row">
                        {SMART_MOOD_TAGS.map((t) => (
                          <button
                            key={t}
                            type="button"
                            className={`temppin-chip ${(tempPin.moodTags?.[0] || 'calm') === t ? 'temppin-chip-active' : ''}`}
                            onClick={() => setTempPin((prev) => ({ ...prev, moodTags: [t] }))}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="temppin-field">
                      <p className="temppin-field-label">Ratings</p>
                      <div className="temppin-chip-row" style={{ marginBottom: 8 }}>
                        {[
                          { k: 'overall', l: 'Overall' },
                          { k: 'safety', l: 'Safety' },
                          { k: 'vibe', l: 'Vibe' },
                          { k: 'crowd', l: 'Crowd' }
                        ].map((r) => (
                          <label
                            key={r.k}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '6px 10px',
                              borderRadius: 100,
                              border: '1px solid var(--panel-border)',
                              background: '#fff',
                              fontSize: 12,
                              color: 'var(--text-secondary)'
                            }}
                          >
                            <span style={{ fontWeight: 500 }}>{r.l}</span>
                            <input
                              type="number"
                              min="1"
                              max="5"
                              step="0.1"
                              style={{
                                width: 46,
                                border: 'none',
                                outline: 'none',
                                fontSize: 12,
                                fontWeight: 600,
                                background: 'transparent',
                                color: 'var(--text-primary)',
                                textAlign: 'center'
                              }}
                              value={
                                r.k === 'crowd'
                                  ? tempPin.ratings?.crowd ?? 3.5
                                  : tempPin.ratings?.[r.k] ?? 4
                              }
                              onChange={(e) =>
                                setTempPin((prev) => ({
                                  ...prev,
                                  ratings: {
                                    ...(prev.ratings || {}),
                                    [r.k]: Number(e.target.value || 0)
                                  }
                                }))
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="temppin-field">
                      <p className="temppin-field-label">Review preview</p>
                      <textarea
                        className="temppin-text-input temppin-textarea"
                        placeholder="Quick review snippet…"
                        value={tempPin.reviewText || ''}
                        onChange={(e) => setTempPin((prev) => ({ ...prev, reviewText: e.target.value }))}
                        style={{ minHeight: 50 }}
                      />
                    </div>

                    <div className="temppin-field">
                      <p className="temppin-field-label">Music</p>
                      <input
                        className="temppin-text-input"
                        placeholder="Song / playlist name"
                        value={tempPin.song || ''}
                        onChange={(e) => setTempPin((prev) => ({ ...prev, song: e.target.value }))}
                        style={{ marginBottom: 8 }}
                      />
                      <input
                        className="temppin-text-input"
                        placeholder="Spotify Track ID (optional)"
                        value={tempPin.spotifyTrackId || ''}
                        onChange={(e) => setTempPin((prev) => ({ ...prev, spotifyTrackId: e.target.value }))}
                        style={{ marginBottom: 8 }}
                      />
                      <input
                        className="temppin-text-input"
                        placeholder="Spotify Playlist ID (optional)"
                        value={tempPin.spotifyPlaylistId || ''}
                        onChange={(e) => setTempPin((prev) => ({ ...prev, spotifyPlaylistId: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                <div className="temppin-actions">
                  <button type="button" className="temppin-btn-secondary" onClick={suggestMood}>
                    AI Suggest
                  </button>
                  <button
                    type="button"
                    className="temppin-btn-primary"
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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          NEW MAP-HERO FLOATING UI LAYOUT
          ========================================================= */}

      {/* ---------- Top-left: Floating Logo ---------- */}
      <button
        type="button"
        className="map-sidebar-toggle"
        onClick={() => setIsSidebarOpen((open) => !open)}
        aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isSidebarOpen}
      >
        <span aria-hidden="true">☰</span>
        <span className="map-sidebar-toggle-label">{APP_NAME}</span>
      </button>

      <aside className={`map-sidebar ${isSidebarOpen ? 'map-sidebar-open' : ''}`} aria-label="Map navigation">
        <div className="map-sidebar-header">
          <strong>{APP_NAME}</strong>
          <button type="button" onClick={() => setIsSidebarOpen(false)} aria-label="Close navigation menu">✕</button>
        </div>
        <nav className="map-sidebar-nav">
          <button type="button" onClick={() => { setIsSidebarOpen(false); setShowFloatingSheet(true); setIsPanelExpanded(true); setActivePanelTab('route'); setActiveMenuSection('dashboard'); }}>
            <span aria-hidden="true">🧭</span> Plan Route
          </button>
          <button type="button" onClick={() => { setIsSidebarOpen(false); recenterOnCurrentLocation(); }}>
            <span aria-hidden="true">◎</span> Current Location
          </button>
          <button type="button" onClick={() => { setIsSidebarOpen(false); setActiveMoodFilter('All'); setShowFloatingSheet(true); setIsPanelExpanded(true); setActiveMenuSection('dashboard'); }}>
            <span aria-hidden="true">♥</span> Mood & Pins
          </button>
          <button type="button" onClick={() => { setIsSidebarOpen(false); setShowFloatingSheet(true); setIsPanelExpanded(true); setActiveMenuSection('profile'); }}>
            <span aria-hidden="true">★</span> Saved Places
          </button>
          <button type="button" onClick={() => { setIsSidebarOpen(false); setShowOptionsPanel(true); }}>
            <span aria-hidden="true">⚙</span> Settings
          </button>
        </nav>
      </aside>

      <div
        className="floating-logo"
        onClick={() => {
          setCurrentMood('Calm');
          setSelectedPin(null);
          setDestination(null);
          setManualStartPoint(null);
          const mapInstance = mapRef.current?.getMap?.();
          if (mapInstance) mapInstance.easeTo({ center: [77.209, 28.6139], zoom: 4.5, duration: 600 });
        }}
        title="VibeAtlas — return to overview"
      >
        <div className="floating-logo-mark" />
        <div className="floating-logo-text">{APP_NAME}</div>
      </div>

      {/* ---------- Top-center: Floating Search ---------- */}
      <div className="floating-search">
        <div className="floating-search-bar">
          <svg className="floating-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="floating-search-input"
            type="text"
            placeholder="Where do you want to feel?"
            value={floatingSearchQuery}
            onFocus={() => setFloatingSearchFocused(true)}
            onChange={(e) => handleFloatingSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                (e.target).blur();
                setFloatingSearchFocused(false);
              } else if (e.key === 'Enter' && floatingPlaceResults[0]) {
                handleSelectFloatingResult(floatingPlaceResults[0]);
              }
            }}
          />
          <button
            type="button"
            className="floating-search-btn"
            aria-label="Search"
            onClick={() => floatingPlaceResults[0] && handleSelectFloatingResult(floatingPlaceResults[0])}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>

        {(floatingSearchFocused || floatingSearchQuery || floatingPlaceResults.length) && (
          <div className="floating-search-expand">
            {!floatingSearchQuery.trim() && (
              <>
                <p className="floating-search-section-label">Explore by mood</p>
                <div className="floating-search-categories">
                  {FLOATING_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`category-chip ${activeFloatingCategory === c.id ? 'category-chip-active' : ''}`}
                      onClick={() => handleFloatingCategoryClick(c)}
                    >
                      <span style={{ marginRight: 4 }}>{c.emoji}</span>
                      {c.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {recentSearches.length > 0 && !floatingSearchQuery.trim() && (
              <>
                <p className="floating-search-section-label">Recent</p>
                <div className="floating-search-results">
                  {recentSearches.slice(0, 4).map((place) => (
                    <div
                      key={`recent-${place.id || place.label}`}
                      className="search-result-item"
                      onClick={() => handleSelectFloatingResult({ ...place, name: place.label, sub: 'Recent search', emoji: '🕐' })}
                    >
                      <div className="search-result-icon">🕐</div>
                      <div className="search-result-meta">
                        <p className="search-result-name">{place.label}</p>
                        <p className="search-result-sub">Recent search</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {floatingSearchQuery.trim() && (
              <>
                <p className="floating-search-section-label">
                  {floatingSearching ? 'Searching…' : floatingPlaceResults.length ? 'Results' : 'No matches'}
                </p>
                {floatingPlaceResults.length ? (
                  <div className="floating-search-results">
                    {floatingPlaceResults.map((place) => (
                      <div
                        key={`fres-${place.id}`}
                        className="search-result-item"
                        onClick={() => handleSelectFloatingResult(place)}
                      >
                        <div className="search-result-icon">{place.emoji || '📍'}</div>
                        <div className="search-result-meta">
                          <p className="search-result-name">{place.name || place.label}</p>
                          <p className="search-result-sub">{place.sub || (place.isPin ? 'Saved vibe' : 'Place')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  !floatingSearching && <div className="search-empty-state">Try a city, mood, or vibe keyword.</div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Click-catcher to close search on outside click */}
      {floatingSearchFocused && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 895, pointerEvents: 'none' }}
          onClick={() => {
            setFloatingSearchFocused(false);
          }}
          onMouseDown={(e) => {
            if ((e.target).closest?.('.floating-search')) e.stopPropagation();
          }}
        >
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }} />
        </div>
      )}

      {/* ---------- Top-right: Profile / Login ---------- */}
      <div className="floating-profile">
        {authState.isLoggedIn ? (
          <div className="floating-profile-card">
            <button
              type="button"
              className="floating-profile-btn"
              onClick={() => navigateToView('user')}
              title={`Open Personal User Dashboard (${authState.email})`}
            >
              <div className="floating-avatar">{String(authState.name || authState.email || 'U').charAt(0).toUpperCase()}</div>
              <div className="floating-profile-meta">
                <span className="floating-profile-name">{authState.name || authState.email?.split('@')[0] || 'Explorer'}</span>
                <span className="floating-profile-email">{authState.email}</span>
              </div>
            </button>
            <button
              type="button"
              className="floating-dashboard-mini-btn"
              onClick={() => navigateToView('user')}
              title="Open Personal User Dashboard"
            >
              👤 Dashboard
            </button>
            {isAdminUser && (
              <button
                type="button"
                className="floating-admin-mini-btn"
                onClick={() => navigateToView('admin')}
                title="Open Dedicated Admin Portal"
              >
                🛡️ Admin Portal
              </button>
            )}
            <button
              type="button"
              className="floating-logout-mini-btn"
              onClick={handleLogout}
              title="Logout from session"
            >
              Logout
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="floating-login-btn"
            onClick={() => openAuthModalFor('Sign in to save vibes and favorites.')}
          >
            Sign in
          </button>
        )}
      </div>

      {/* ---------- Right: Compact Controls Stack ---------- */}
      <div className="floating-controls">
        <div className="floating-controls-group">
          <button
            type="button"
            className={`control-icon-btn ${userLocation && isMapCenteredOnUser ? 'control-icon-btn-active' : ''}`}
            onClick={recenterOnCurrentLocation}
            title={userLocation && !isMapCenteredOnUser ? 'Return to current location' : 'Current location'}
            aria-label={userLocation && !isMapCenteredOnUser ? 'Return to current location' : 'Current location'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
              <circle cx="12" cy="12" r="3.5" />
              <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="control-icon-btn"
            onClick={() => {
              const mapInstance = mapRef.current?.getMap?.();
              if (mapInstance) {
                mapInstance.zoomIn({ duration: 260 });
              }
            }}
            title="Zoom in"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            type="button"
            className="control-icon-btn"
            onClick={() => {
              const mapInstance = mapRef.current?.getMap?.();
              if (mapInstance) mapInstance.zoomOut({ duration: 260 });
            }}
            title="Zoom out"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            type="button"
            className="control-icon-btn"
            onClick={() => {
              const mapInstance = mapRef.current?.getMap?.();
              if (mapInstance) mapInstance.easeTo({ bearing: 0, pitch: 0, duration: 450 });
            }}
            title="Reset compass / view"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 3 15 10.5 12 9 9 10.5 12 3" />
              <polygon points="12 21 9 13.5 12 15 15 13.5 12 21" />
            </svg>
          </button>
        </div>

        <div className="floating-controls-group">
          <button
            type="button"
            className={`control-icon-btn ${showOptionsPanel ? 'control-icon-btn-active' : ''}`}
            onClick={() => setShowOptionsPanel((p) => !p)}
            title="Layers & settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </button>
          <button
            type="button"
            className={`control-icon-btn ${enable3DView ? 'control-icon-btn-active' : ''}`}
            onClick={() => setEnable3DView((prev) => !prev)}
            title="Toggle 3D perspective"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 2 7v10l10 5 10-5V7z" />
              <path d="M2 7l10 5 10-5" />
              <path d="M12 12v10" />
            </svg>
          </button>
          <button
            type="button"
            className={`control-icon-btn ${destination ? 'control-icon-btn-active' : ''}`}
            onClick={() => {
              if (!isPanelExpanded) {
                setShowFloatingSheet(true);
                setIsPanelExpanded(true);
              }
              setActivePanelTab('route');
              setActiveMenuSection('dashboard');
            }}
            title="Directions / route"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="19" r="2" />
              <circle cx="18" cy="5" r="2" />
              <path d="M6 17V9a2 2 0 0 1 2-2h8" />
              <path d="m14 5 4 0 0 4" />
              <polyline points="13 7 17 7 17 11" />
            </svg>
          </button>
        </div>
      </div>

      {/* ---------- Right: Floating Layers/Options expand panel ---------- */}
      {showOptionsPanel && (
        <div className="floating-options-panel">
          <h3 className="floating-options-title">Map & Experience</h3>

          <div className="option-row">
            <label className="option-row-label">
              <span className="option-row-icon">🧊</span>3D perspective
            </label>
            <div
              className={`toggle-switch ${enable3DView ? 'toggle-switch-on' : ''}`}
              onClick={() => setEnable3DView((p) => !p)}
              role="switch"
              aria-checked={enable3DView}
            />
          </div>
          <div className="option-row">
            <label className="option-row-label">
              <span className="option-row-icon">⛰️</span>Terrain relief
            </label>
            <div
              className={`toggle-switch ${enableTerrain && enable3DView ? 'toggle-switch-on' : ''}`}
              onClick={() => setEnableTerrain((p) => !p)}
              role="switch"
              aria-checked={enableTerrain}
              title={!MAPTILER_KEY ? 'Add REACT_APP_MAPTILER_KEY to enable terrain' : 'Toggle terrain'}
            />
          </div>
          <div className="option-row">
            <label className="option-row-label">
              <span className="option-row-icon">🏙️</span>3D buildings
            </label>
            <div
              className={`toggle-switch ${enableBuildings3D && enable3DView ? 'toggle-switch-on' : ''}`}
              onClick={() => setEnableBuildings3D((p) => !p)}
              role="switch"
              aria-checked={enableBuildings3D}
            />
          </div>
          <div className="option-row">
            <label className="option-row-label">
              <span className="option-row-icon">🔥</span>Mood heatmap
            </label>
            <div
              className={`toggle-switch ${showHeatmap ? 'toggle-switch-on' : ''}`}
              onClick={() => setShowHeatmap((p) => !p)}
              role="switch"
              aria-checked={showHeatmap}
            />
          </div>
          <div className="option-row">
            <label className="option-row-label">
              <span className="option-row-icon">🛰️</span>Fly-through
            </label>
            <div
              className={`toggle-switch ${flyThroughActive ? 'toggle-switch-on' : ''}`}
              onClick={() => (flyThroughActive ? stopFlyThrough(true) : startFlyThrough())}
              role="switch"
              aria-checked={flyThroughActive}
            />
          </div>
          <div className="option-row">
            <label className="option-row-label">
              <span className="option-row-icon">🧭</span>Open full panel
            </label>
            <button
              type="button"
              className="temppin-chip temppin-chip-active"
              onClick={() => {
                setShowOptionsPanel(false);
                setShowFloatingSheet(true);
                setIsPanelExpanded(true);
                setActiveMenuSection('dashboard');
              }}
              style={{ padding: '6px 12px', fontSize: 12 }}
            >
              All controls
            </button>
          </div>
        </div>
      )}

      {/* ---------- Bottom: Slim Action Bar (pill) ---------- */}
      <div className="bottom-action-bar">
        <div className="bottom-action-group">
          <button
            type="button"
            className="bottom-mood-pill"
            onClick={() => {
              setShowFloatingSheet(true);
              setIsPanelExpanded(true);
              setActiveMenuSection('dashboard');
            }}
            title="Current mood — click to change"
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} />
            {currentMood}
          </button>
          <button
            type="button"
            className="bottom-info-pill"
            title={panelBudgetLabel}
          >
            {panelBudgetLabel}
          </button>
        </div>

        {destination && (
          <div className="bottom-action-group">
            <div className="bottom-info-pill">
              🧭 {panelRouteDistance}
            </div>
            <div className="bottom-info-pill">
              ⏱ {panelRouteDuration}
            </div>
            <div className="bottom-info-pill" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              {activeRouteModeMeta.label}
            </div>
          </div>
        )}

        <div className="bottom-action-group" style={{ gap: 2 }}>
          <button
            type="button"
            className={`bottom-icon-btn ${activePanelTab === 'route' ? 'bottom-icon-btn-primary' : ''}`}
            onClick={() => {
              setShowFloatingSheet(true);
              setIsPanelExpanded(true);
              setActivePanelTab('route');
              setActiveMenuSection('dashboard');
            }}
            title="Route & directions"
          >
            🧭
          </button>
          <button
            type="button"
            className="bottom-icon-btn"
            onClick={() => {
              openAuthModalFor('Login to add a vibe at your current location.', () => {
                if (userLocation) {
                  setTempPin({
                    lat: userLocation.lat,
                    lng: userLocation.lon,
                    name: '',
                    mood: currentMood,
                    moodTags: [moodToTag(currentMood)],
                    budget: 'medium',
                    note: '',
                    weather: weather.label,
                    time: new Date().toISOString(),
                    ratings: { overall: 4, safety: 4, vibe: 4, crowd: 3.5 },
                    reviews: [],
                    song: '',
                    crowdLevel: 'medium',
                    safety: 4,
                    wifi: false
                  });
                } else {
                  setRouteActionMessage('Enable location tracking or right-click the map to drop a pin.');
                }
              });
            }}
            title="Add a vibe pin here"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            type="button"
            className="bottom-icon-btn"
            onClick={() => {
              setShowFloatingSheet(true);
              setIsPanelExpanded(true);
              setActivePanelTab('climate');
              setActiveMenuSection('dashboard');
            }}
            title="Filters & climate"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
          </button>
        </div>

        <div
          className="bottom-expand-indicator"
          onClick={() => {
            setShowFloatingSheet(true);
            setIsPanelExpanded(true);
            setActiveMenuSection('dashboard');
          }}
          title="Open full controls"
        >
          <span />
          <span />
          <span />
        </div>
      </div>

      {/* ---------- Standalone Chat Launcher (fixed bug: only 1 instance) ---------- */}
      <button
        type="button"
        className="chat-launcher"
        onClick={() => {
          setActiveMenuSection('guide');
          setShowFloatingSheet(true);
          setIsPanelExpanded(true);
        }}
        aria-label="Open chat guide"
        title="Ask VibeAtlas guide"
      >
        💬
      </button>

      {/* ---------- Case Isolation Monitor (floating) ---------- */}
      {activeView === 'explore' && caseMonitorSnapshot.total > 0 && (
        <div className="case-monitor case-monitor-floating" role="region" aria-label="Case isolation monitor">
          <div className="case-monitor-head">
            <span className="case-monitor-mark">⟁</span>
            <div className="case-monitor-title">
              <div>Case Monitor</div>
              <small>
                {caseMonitorSnapshot.open} open · {caseMonitorSnapshot.resolved} resolved · {caseMonitorSnapshot.closed} closed
                {caseMonitorSnapshot.exceptions > 0 && <span className="case-monitor-exception-badge">{caseMonitorSnapshot.exceptions} exception</span>}
              </small>
            </div>
            <button
              type="button"
              className="case-monitor-expand"
              onClick={() => {
                setShowFloatingSheet(true);
                setIsPanelExpanded(true);
                setActivePanelTab('settings');
                setActiveMenuSection('dashboard');
              }}
              title="Open full Case Monitor in dashboard"
            >
              {caseMonitorSnapshot.exceptions > 0 ? 'Review' : 'Open'}
            </button>
          </div>
        </div>
      )}

      {/* ---------- Exception Alert Banner (progressive disclosure) ---------- */}
      {activeView === 'explore' && caseMonitorSnapshot.exceptions > 0 && (
        <div className="exception-banner" role="alert">
          <div className="exception-banner-row">
            <span className="exception-banner-icon">⚠</span>
            <div className="exception-banner-text">
              <strong>{caseMonitorSnapshot.exceptions} case{caseMonitorSnapshot.exceptions === 1 ? '' : 's'} handled with auto remediation</strong>
              <span>Data stays separated per user session and case. Open Case Monitor for details.</span>
            </div>
            <button type="button" className="exception-banner-dismiss" onClick={() => {
              const snap = CaseIsolation.snapshot();
              snap.cases.filter((c) => c.status === CASE_STATUS.EXCEPTION).forEach((c) => {
                CaseIsolation.resolve(c.id, { message: 'User dismissed exception banner; exception already auto-remediated within case scope.', applyStructuredPatch: { bannerDismissed: true } });
                CaseIsolation.closeCase(c.id);
              });
            }}>Dismiss</button>
          </div>
        </div>
      )}

      {/* ---------- Mobile: Bottom Navigation ---------- */}
      <nav className="mobile-bottom-nav" aria-label="Primary">
        <div className="mobile-bottom-nav-inner">
          <button
            type="button"
            className={`mobile-nav-item mobile-nav-item-active`}
            onClick={() => {
              setShowFloatingSheet(false);
              setIsPanelExpanded(false);
              setSelectedPin(null);
            }}
          >
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>Map</span>
          </button>
          <button
            type="button"
            className="mobile-nav-item"
            onClick={() => {
              setFloatingSearchFocused(true);
              const el = document.querySelector?.('.floating-search-input');
              if (el) el.focus?.();
            }}
          >
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Search</span>
          </button>
          <button
            type="button"
            className="mobile-nav-item"
            onClick={() => {
              openAuthModalFor('Login to add and save a vibe pin.', () => {
                if (userLocation) {
                  setTempPin({
                    lat: userLocation.lat,
                    lng: userLocation.lon,
                    name: '',
                    mood: currentMood,
                    moodTags: [moodToTag(currentMood)],
                    budget: 'medium',
                    note: '',
                    weather: weather.label,
                    time: new Date().toISOString(),
                    ratings: { overall: 4, safety: 4, vibe: 4, crowd: 3.5 },
                    reviews: [],
                    song: '',
                    crowdLevel: 'medium',
                    safety: 4,
                    wifi: false
                  });
                } else {
                  setRouteActionMessage('Right-click the map to drop a vibe pin.');
                }
              });
            }}
          >
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add</span>
          </button>
          <button
            type="button"
            className="mobile-nav-item"
            onClick={() => {
              setShowFloatingSheet(true);
              setIsPanelExpanded(true);
              setActivePanelTab('route');
              setActiveMenuSection('dashboard');
            }}
          >
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <span>Saved</span>
          </button>
          <button
            type="button"
            className="mobile-nav-item"
            onClick={() => {
              if (authState.isLoggedIn) {
                setActiveMenuSection('profile');
                setShowFloatingSheet(true);
                setIsPanelExpanded(true);
              } else {
                openAuthModalFor('Sign in to view your profile.');
              }
            }}
          >
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Profile</span>
          </button>
        </div>
      </nav>

      {/* =========================================================
          EXISTING LEGACY UI PANELS (now inside progressive disclosure)
          The control-panel will render when expanded; quick-dock & legend
          are demoted to hidden-by-default on small screens, and visually
          toned down — but fully functional.
          ========================================================= */}

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
              const newWp = {
                id: `wp_${Date.now()}`,
                name: `Waypoint (${mapActionMenu.lat.toFixed(4)}, ${mapActionMenu.lon.toFixed(4)})`,
                note: `User added stop (${mapActionMenu.lat.toFixed(4)}, ${mapActionMenu.lon.toFixed(4)})`,
                lat: mapActionMenu.lat,
                lon: mapActionMenu.lon,
                mood: currentMood,
                moodTags: [moodToTag(currentMood)],
                score: 4.5
              };
              setSuggestedRoute((prev) => [...prev, newWp]);
              setRouteActionMessage('Waypoint added to route.');
              setMapActionMenu((prev) => ({ ...prev, open: false }));
            }}
          >
            ➕ Add as Waypoint Stop
          </button>
          <button
            type="button"
            className="map-action-menu-btn"
            onClick={() => {
              setAddPinToBoardTarget({
                lat: mapActionMenu.lat,
                lon: mapActionMenu.lon,
                name: `Spot (${mapActionMenu.lat.toFixed(4)}, ${mapActionMenu.lon.toFixed(4)})`,
                note: 'Location saved from map'
              });
              if (!boards.length) loadBoards();
              setMapActionMenu((prev) => ({ ...prev, open: false }));
            }}
          >
            Save to Board
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

      {(showFloatingSheet || isPanelExpanded) && (
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
      )}

      {(showFloatingSheet || isPanelExpanded) && (
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
      )}

      {(showFloatingSheet || isPanelExpanded) && (
        <>
          <div
            className="bottom-sheet"
            role={showFloatingSheet ? 'dialog' : undefined}
            aria-modal={showFloatingSheet ? 'false' : undefined}
            style={{ display: showFloatingSheet ? 'block' : 'contents' }}
          >
            {showFloatingSheet && (
              <>
                <div
                  className="bottom-sheet-grabber"
                  onClick={() => {
                    setShowFloatingSheet(false);
                    setIsPanelExpanded(false);
                  }}
                />
                <button
                  type="button"
                  className="bottom-sheet-close"
                  onClick={() => {
                    setShowFloatingSheet(false);
                    setIsPanelExpanded(false);
                  }}
                  aria-label="Close panel"
                >
                  ✕
                </button>
              </>
            )}
            <div
              className="bottom-sheet-content"
              style={{ display: showFloatingSheet ? 'block' : 'contents' }}
            >
        <div
          className="control-panel"
          style={{
            position: showFloatingSheet ? 'static' : 'absolute',
            bottom: showFloatingSheet ? 'auto' : undefined,
            left: showFloatingSheet ? 'auto' : undefined,
            right: showFloatingSheet ? 'auto' : undefined,
            transform: showFloatingSheet ? 'none' : undefined,
            width: showFloatingSheet ? '100%' : undefined,
            maxWidth: showFloatingSheet ? 'none' : undefined,
            borderRadius: showFloatingSheet ? 0 : undefined,
            border: showFloatingSheet ? 'none' : undefined,
            boxShadow: showFloatingSheet ? 'none' : undefined,
            background: showFloatingSheet ? 'transparent' : undefined,
            backdropFilter: showFloatingSheet ? 'none' : undefined,
            padding: showFloatingSheet ? 0 : undefined,
            marginTop: showFloatingSheet ? 0 : undefined
          }}
        >
        <div className="panel-headline">
          <h3>{APP_NAME}</h3>
          {authState.isLoggedIn ? (
            <span className="badge-live">Live</span>
          ) : (
            <span className="badge-live badge-live-guest">Exploring as Guest</span>
          )}
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
          <button
            type="button"
            className={`menu-btn ${activeMenuSection === 'boards' ? 'menu-btn-active' : ''}`}
            onClick={() => {
              if (authState.isLoggedIn) {
                setActiveMenuSection('boards');
                loadBoards();
              } else {
                openAuthModalFor('Please login to access your boards.', () => {
                  setActiveMenuSection('boards');
                  loadBoards();
                });
              }
            }}
          >
            Boards
          </button>
          <button type="button" className={`menu-btn ${activeMenuSection === 'demo' ? 'menu-btn-active' : ''}`} onClick={() => setActiveMenuSection('demo')}>Demo</button>
          <button type="button" className={`menu-btn ${activeMenuSection === 'guide' ? 'menu-btn-active' : ''}`} onClick={() => setActiveMenuSection('guide')}>Guide Bot</button>
          <button
            type="button"
            className={`menu-btn ${activeMenuSection === 'profile' ? 'menu-btn-active' : ''}`}
            onClick={() => {
              if (authState.isLoggedIn) {
                setActiveMenuSection('profile');
              } else {
                openAuthModalFor('Please login to access your profile.', () => setActiveMenuSection('profile'));
              }
            }}
          >
            Profile
          </button>
          <button type="button" className={`menu-btn ${activeMenuSection === 'auth' ? 'menu-btn-active' : ''}`} onClick={() => setActiveMenuSection('auth')}>Auth</button>
        </div>

        {activeMenuSection === 'boards' && (
          <div className="boards-section">
            {!selectedBoard ? (
              <>
                <div className="boards-header-card">
                  <div className="boards-title-group">
                    <h2>My Travel Boards</h2>
                    <p>Organize, plan, and collect your personal vibe spots and routes</p>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setBoardForm({ name: '', description: '' });
                      setIsCreatingBoard(true);
                    }}
                  >
                    + New Board
                  </button>
                </div>

                {boardsLoading && <div className="small-row">Loading your boards...</div>}

                {boards.length === 0 && !boardsLoading ? (
                  <div className="board-empty-state">
                    <h3>No boards created yet</h3>
                    <p>Create boards to organize your spots by city, trip, mood, or soundtrack.</p>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setBoardForm({ name: '', description: '' });
                        setIsCreatingBoard(true);
                      }}
                    >
                      Create Your First Board
                    </button>
                  </div>
                ) : (
                  <div className="boards-grid">
                    {boards.map((b) => (
                      <div key={b.id} className="board-card">
                        <div>
                          <div className="board-card-header">
                            <h3 className="board-card-name">{b.name}</h3>
                            <span className="board-card-badge">{b.item_count || 0} spots</span>
                          </div>
                          {b.description && <p className="board-card-desc">{b.description}</p>}
                        </div>
                        <div className="board-card-actions">
                          <button
                            type="button"
                            className="board-card-btn-open"
                            onClick={() => handleOpenBoard(b)}
                          >
                            Open Board
                          </button>
                          <button
                            type="button"
                            className="board-card-btn-icon"
                            title="Edit board name and description"
                            onClick={() => {
                              setSelectedBoard(b);
                              setBoardForm({ name: b.name, description: b.description || '' });
                              setIsEditingBoard(true);
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="board-card-btn-icon board-card-btn-danger"
                            title="Delete board"
                            onClick={() => handleDeleteBoard(b.id)}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="board-detail-container">
                <div className="board-detail-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      type="button"
                      className="btn-action-ghost"
                      onClick={() => {
                        setSelectedBoard(null);
                        setSelectedBoardItems([]);
                        loadBoards();
                      }}
                    >
                      ← Back to Boards
                    </button>
                    <div>
                      <h3 style={{ margin: 0, fontFamily: 'Syne, sans-serif', fontSize: 18, color: 'var(--text-primary)' }}>
                        {selectedBoard.name}
                      </h3>
                      {selectedBoard.description && (
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                          {selectedBoard.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setBoardForm({ name: selectedBoard.name, description: selectedBoard.description || '' });
                      setIsEditingBoard(true);
                    }}
                  >
                    Edit Board
                  </button>
                </div>

                {selectedBoardItems.length === 0 ? (
                  <div className="board-empty-state">
                    <h3>This board is empty</h3>
                    <p>Add spots from the map by clicking any pin and choosing "+ Board", or right-clicking anywhere on the map.</p>
                  </div>
                ) : (
                  <div className="board-items-list">
                    {selectedBoardItems.map((item) => (
                      <div key={item.id} className="board-item-row">
                        <div className="board-item-info">
                          <h4>{item.title || 'Saved Place'}</h4>
                          <p>
                            {item.mood && <span className="compact-popup-mood-chip" style={{ marginRight: 6, padding: '2px 8px', fontSize: 11 }}>{item.mood}</span>}
                            {item.note ? item.note : `Coordinates: ${Number(item.lat).toFixed(4)}, ${Number(item.lon).toFixed(4)}`}
                          </p>
                        </div>
                        <div className="board-item-actions">
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: 12 }}
                            onClick={() => {
                              const mapInstance = mapRef.current?.getMap?.();
                              if (mapInstance) {
                                mapInstance.easeTo({ center: [Number(item.lon), Number(item.lat)], zoom: 14, duration: 600 });
                              }
                              ensureDestinationPin(Number(item.lat), Number(item.lon), item.title || 'Board Spot');
                              setNavDestinationQuery(item.title || 'Board Spot');
                              setRouteActionMessage(`Destination set from board: ${item.title || 'Spot'}`);
                              setIsPanelExpanded(true);
                              setActivePanelTab('route');
                            }}
                          >
                            Explore
                          </button>
                          <button
                            type="button"
                            className="board-card-btn-icon board-card-btn-danger"
                            title="Remove from board"
                            onClick={() => handleRemoveBoardItem(item.id)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
            <div className="card-title">{authState.isLoggedIn ? 'Account' : 'Login / Sign Up'}</div>
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

        <div className="panel-card case-isolation-card" role="region" aria-label="Case isolation history">
          <div className="card-title case-isolation-title">
            <span>Case Isolation Monitor</span>
            <span className="case-isolation-summary">
              <span className={`case-isolation-pill pill-open`}>Open: {caseMonitorSnapshot.open}</span>
              {caseMonitorSnapshot.exceptions > 0 && <span className="case-isolation-pill pill-exception">Exception: {caseMonitorSnapshot.exceptions}</span>}
              <span className="case-isolation-pill pill-resolved">Resolved: {caseMonitorSnapshot.resolved}</span>
              <span className="case-isolation-pill pill-closed">Closed: {caseMonitorSnapshot.closed}</span>
              <span className="case-isolation-pill pill-total">Total: {caseMonitorSnapshot.total}</span>
            </span>
          </div>
          <div className="small-row">Each decision is processed inside its own isolated case. Raw inputs are transformed into typed structured data, and exceptions are handled within case scope to avoid cross-contamination between requests, users, or moods.</div>
          {caseMonitorSnapshot.cases.length === 0 ? (
            <div className="small-row top-gap case-empty-state">No decisions yet. Interact with the map, change your mood, save a pin, favorite a spot, or pick a destination to see isolated cases populate here.</div>
          ) : (
            <div className="case-history-list top-gap">
              {caseMonitorSnapshot.cases.slice(0, 8).map((c) => {
                const typeLabel = c.type === CASE_TYPES.ROUTE ? 'Route' : c.type === CASE_TYPES.PIN_SAVE ? 'Pin Save' : c.type === CASE_TYPES.FAVORITE ? 'Favorite' : c.type === CASE_TYPES.MOOD_SELECT ? 'Mood' : c.type;
                const statusClass = c.status === CASE_STATUS.EXCEPTION ? 'case-status-exception' : c.status === CASE_STATUS.RESOLVED ? 'case-status-resolved' : c.status === CASE_STATUS.CLOSED ? 'case-status-closed' : 'case-status-open';
                const hasException = c.exceptions && c.exceptions.length > 0;
                return (
                  <details key={c.id} className="case-history-item" open={c.status === CASE_STATUS.EXCEPTION}>
                    <summary className="case-history-summary">
                      <span className={`case-status-dot ${statusClass}`} title={c.status} />
                      <div className="case-history-headline">
                        <span className="case-history-type">{typeLabel}</span>
                        <span className="case-history-label">{c.label}</span>
                        {hasException && <span className="case-history-tag">⚠ Exception</span>}
                        <span className="case-history-owner">{String(c.owner || '').length > 20 ? `${String(c.owner).slice(0, 17)}…` : c.owner || 'guest'}</span>
                      </div>
                      <span className="case-history-time">{new Date(c.createdAt).toLocaleTimeString()}</span>
                    </summary>
                    <div className="case-history-body">
                      <div className="case-history-section">
                        <div className="case-history-subtitle">Raw input</div>
                        <pre className="case-history-raw">{JSON.stringify(c.rawInput, null, 2).slice(0, 600)}</pre>
                      </div>
                      <div className="case-history-section">
                        <div className="case-history-subtitle">Structured data</div>
                        <pre className="case-history-structured">{JSON.stringify(c.structured, null, 2).slice(0, 600)}</pre>
                      </div>
                      {hasException && (
                        <div className="case-history-section case-history-section-exception">
                          <div className="case-history-subtitle case-exception-title">Exceptions ({c.exceptions.length})</div>
                          <ul className="case-exception-list">
                            {c.exceptions.map((e, i) => (
                              <li key={`${c.id}-e-${i}`}>
                                <code>{e.code}</code> <span>{e.message}</span>
                                {e.remediation && <small> · Remediation: {e.remediation}</small>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {c.decisions && c.decisions.length > 0 && (
                        <div className="case-history-section">
                          <div className="case-history-subtitle">Decisions ({c.decisions.length})</div>
                          <ol className="case-decision-list">
                            {c.decisions.map((d, i) => (
                              <li key={`${c.id}-d-${i}`}>
                                <div className="case-decision-row">
                                  <span className="case-decision-kind">{d.kind || d.type || 'decision'}</span>
                                  <span className="case-decision-time">{new Date(d.ts || c.createdAt).toLocaleTimeString()}</span>
                                </div>
                                <pre className="case-decision-detail">{JSON.stringify((() => { const { id, ts, ...rest } = d || {}; return rest; })(), null, 2).slice(0, 800)}</pre>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
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
        </div>
            </div>
          </div>

          <div className="map-fab-container" style={showFloatingSheet ? { display: 'none' } : undefined}>
            <button 
              className={`fab-btn fab-location ${userLocation && isMapCenteredOnUser ? 'fab-active' : ''}`}
              onClick={recenterOnCurrentLocation}
              title={userLocation && !isMapCenteredOnUser ? 'Return to current location' : 'Current location'}
              aria-label={userLocation && !isMapCenteredOnUser ? 'Return to current location' : 'Current location'}
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
        </>
      )}

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

      {isCreatingBoard && (
        <div className="vibe-modal-backdrop" onClick={() => setIsCreatingBoard(false)}>
          <div className="vibe-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="vibe-modal-header">
              <h3>Create New Board</h3>
              <button type="button" className="btn-action-ghost" onClick={() => setIsCreatingBoard(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateBoard} className="vibe-modal-body">
              <div className="vibe-modal-field">
                <label>Board Name</label>
                <input
                  className="vibe-modal-input"
                  placeholder="e.g. My Favorite Cafes, Monsoon Escapes"
                  value={boardForm.name}
                  onChange={(e) => setBoardForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                  autoFocus
                />
              </div>
              <div className="vibe-modal-field">
                <label>Description (optional)</label>
                <textarea
                  className="vibe-modal-textarea"
                  rows="3"
                  placeholder="What is this board for?"
                  value={boardForm.description}
                  onChange={(e) => setBoardForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              {boardActionError && <div className="login-error">{boardActionError}</div>}
              <div className="vibe-modal-footer">
                <button type="button" className="btn-modal-cancel" onClick={() => setIsCreatingBoard(false)}>Cancel</button>
                <button type="submit" className="btn-modal-confirm">Create Board</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditingBoard && (
        <div className="vibe-modal-backdrop" onClick={() => setIsEditingBoard(false)}>
          <div className="vibe-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="vibe-modal-header">
              <h3>Edit Board</h3>
              <button type="button" className="btn-action-ghost" onClick={() => setIsEditingBoard(false)}>✕</button>
            </div>
            <form onSubmit={handleUpdateBoard} className="vibe-modal-body">
              <div className="vibe-modal-field">
                <label>Board Name</label>
                <input
                  className="vibe-modal-input"
                  value={boardForm.name}
                  onChange={(e) => setBoardForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="vibe-modal-field">
                <label>Description</label>
                <textarea
                  className="vibe-modal-textarea"
                  rows="3"
                  value={boardForm.description}
                  onChange={(e) => setBoardForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              {boardActionError && <div className="login-error">{boardActionError}</div>}
              <div className="vibe-modal-footer">
                <button type="button" className="btn-modal-cancel" onClick={() => setIsEditingBoard(false)}>Cancel</button>
                <button type="submit" className="btn-modal-confirm">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {addPinToBoardTarget && (
        <div className="vibe-modal-backdrop" onClick={() => setAddPinToBoardTarget(null)}>
          <div className="vibe-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="vibe-modal-header">
              <h3>Add to Board</h3>
              <button type="button" className="btn-action-ghost" onClick={() => setAddPinToBoardTarget(null)}>✕</button>
            </div>
            <div className="vibe-modal-body">
              <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-secondary)' }}>
                Adding <strong>{addPinToBoardTarget.name || addPinToBoardTarget.note || 'Spot'}</strong> to:
              </p>
              {boards.length > 0 ? (
                <div className="vibe-modal-field">
                  <label>Select Board</label>
                  <select
                    className="vibe-modal-select"
                    value={selectedBoardForPin}
                    onChange={(e) => setSelectedBoardForPin(e.target.value)}
                  >
                    <option value="">-- Choose a Board --</option>
                    {boards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.item_count || 0} items)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="small-row">
                  You don't have any boards yet. Create a board first!
                </div>
              )}
              {boardActionError && <div className="login-error">{boardActionError}</div>}
              <div className="vibe-modal-footer">
                <button type="button" className="btn-modal-cancel" onClick={() => setAddPinToBoardTarget(null)}>Cancel</button>
                {boards.length > 0 ? (
                  <button
                    type="button"
                    className="btn-modal-confirm"
                    disabled={!selectedBoardForPin}
                    onClick={() => handleAddPinToBoard(addPinToBoardTarget, selectedBoardForPin)}
                  >
                    Add to Selected Board
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-modal-confirm"
                    onClick={() => {
                      setAddPinToBoardTarget(null);
                      setBoardForm({ name: '', description: '' });
                      setIsCreatingBoard(true);
                    }}
                  >
                    Create Board Now
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {editingPin && (
        <div className="vibe-modal-backdrop" onClick={() => setEditingPin(null)}>
          <div className="vibe-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="vibe-modal-header">
              <h3>Edit Vibe Pin</h3>
              <button type="button" className="btn-action-ghost" onClick={() => setEditingPin(null)}>✕</button>
            </div>
            <form onSubmit={handleSavePinEdit} className="vibe-modal-body">
              <div className="vibe-modal-field">
                <label>Spot Name</label>
                <input
                  className="vibe-modal-input"
                  value={pinEditForm.name}
                  onChange={(e) => setPinEditForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Sunset Point"
                  required
                />
              </div>
              <div className="vibe-modal-field">
                <label>Mood</label>
                <select
                  className="vibe-modal-select"
                  value={pinEditForm.mood}
                  onChange={(e) => setPinEditForm((prev) => ({ ...prev, mood: e.target.value }))}
                >
                  {MOODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="vibe-modal-field">
                <label>Note / Atmosphere</label>
                <textarea
                  className="vibe-modal-textarea"
                  rows="3"
                  value={pinEditForm.note}
                  onChange={(e) => setPinEditForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="Describe the feeling of this place..."
                />
              </div>
              <div className="vibe-modal-field">
                <label>Budget</label>
                <select
                  className="vibe-modal-select"
                  value={pinEditForm.budget}
                  onChange={(e) => setPinEditForm((prev) => ({ ...prev, budget: e.target.value }))}
                >
                  <option value="free">Free</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="luxury">Luxury</option>
                </select>
              </div>
              <div className="vibe-modal-field">
                <label>Linked Song / Soundtrack</label>
                <input
                  className="vibe-modal-input"
                  value={pinEditForm.song}
                  onChange={(e) => setPinEditForm((prev) => ({ ...prev, song: e.target.value }))}
                  placeholder="e.g. Ambient Chill Wave"
                />
              </div>
              <div className="vibe-modal-footer">
                <button type="button" className="btn-modal-cancel" onClick={() => setEditingPin(null)}>Cancel</button>
                <button type="submit" className="btn-modal-confirm">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAuthModal && (
        <div className="auth-modal-overlay" role="dialog" aria-modal="true" aria-label="Login or sign up">
          <div className="auth-modal-card">
            <button
              type="button"
              className="auth-modal-close"
              onClick={closeAuthModal}
              aria-label="Close"
            >
              ✕
            </button>
            <div className="auth-modal-header">
              <div className="auth-modal-hero-mark" />
              <h2 className="auth-modal-title">Your journey starts here</h2>
              <p className="auth-modal-subtitle">
                {authModalReason || 'Sign in to save your places and memories.'}
              </p>
            </div>
            <div className="auth-modal-body">
              <button
                type="button"
                className="auth-social-btn"
                onClick={handleGoogleSignIn}
                title="Continue with Google"
              >
                <svg className="auth-social-icon" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>

              <div className="auth-divider">or with email</div>

              <Login
                displayMode="modal"
                showGuestButton={false}
                onContinue={closeAuthModal}
                onLogin={async ({ email, password }) => {
                  const result = await performLogin(email, password);
                  if (result?.ok) {
                    completeAuthModalFlow();
                  }
                  return result;
                }}
                onRegister={async ({ name, email, password }) => {
                  const result = await performRegister(name, email, password);
                  if (result?.ok) {
                    completeAuthModalFlow();
                  }
                  return result;
                }}
              />

              <button
                type="button"
                className="auth-guest-link"
                onClick={closeAuthModal}
              >
                Continue as guest →
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdminPanel && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-label="Admin Control Panel" onClick={() => setShowAdminPanel(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-header-title-row">
                <div className="admin-badge">🛡️ System Administration</div>
                <button
                  type="button"
                  className="admin-close-btn"
                  onClick={() => setShowAdminPanel(false)}
                  aria-label="Close Admin Panel"
                >
                  ✕
                </button>
              </div>
              <h2 className="admin-title">Vibe Atlas Admin Control Center</h2>
              <p className="admin-subtitle">Monitor multi-tenant users, platform statistics, role permissions, and database audit logs.</p>
            </div>

            <div className="admin-modal-body">
              {/* Top KPI Cards */}
              <div className="admin-kpi-grid">
                <div className="admin-kpi-card">
                  <span className="admin-kpi-label">Registered Users</span>
                  <span className="admin-kpi-value">{adminData.stats?.totalUsers ?? (adminLoading ? '...' : '0')}</span>
                  <span className="admin-kpi-sub">Total Accounts</span>
                </div>
                <div className="admin-kpi-card">
                  <span className="admin-kpi-label">Active Vibe Pins</span>
                  <span className="admin-kpi-value">{adminData.stats?.totalPins ?? (adminLoading ? '...' : '0')}</span>
                  <span className="admin-kpi-sub">Total Spatial Points</span>
                </div>
                <div className="admin-kpi-card">
                  <span className="admin-kpi-label">Travel Boards</span>
                  <span className="admin-kpi-value">{adminData.stats?.totalBoards ?? (adminLoading ? '...' : '0')}</span>
                  <span className="admin-kpi-sub">User Collections</span>
                </div>
                <div className="admin-kpi-card">
                  <span className="admin-kpi-label">Active Sessions</span>
                  <span className="admin-kpi-value">{adminData.stats?.activeSessions ?? (adminLoading ? '...' : '0')}</span>
                  <span className="admin-kpi-sub">JWT Validated</span>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="admin-toolbar">
                <button
                  type="button"
                  className="admin-btn admin-btn-refresh"
                  onClick={loadAdminOverview}
                  disabled={adminLoading}
                >
                  🔄 {adminLoading ? 'Refreshing...' : 'Refresh Stats'}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-seed"
                  onClick={() => {
                    loadDemoData(false);
                    setTimeout(loadAdminOverview, 800);
                  }}
                >
                  🌱 Seed Demo Data
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-reset"
                  onClick={() => {
                    loadDemoData(true);
                    setTimeout(loadAdminOverview, 800);
                  }}
                >
                  ⚠️ Reset Demo Store
                </button>
              </div>

              {/* Users Management Section */}
              <div className="admin-section">
                <h3 className="admin-section-heading">👥 User Management & Role Control</h3>
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Joined</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminData.users && adminData.users.length ? (
                        adminData.users.map((u) => (
                          <tr key={u.id}>
                            <td className="admin-user-cell">
                              <div className="admin-user-avatar">{String(u.name || u.email || 'U').charAt(0).toUpperCase()}</div>
                              <span className="admin-user-name">{u.name || 'Anonymous'}</span>
                            </td>
                            <td className="admin-email-cell">{u.email}</td>
                            <td>
                              <span className={`admin-role-tag admin-role-${String(u.role).toLowerCase().replace(/\s+/g, '-')}`}>
                                {u.role || 'Explorer'}
                              </span>
                            </td>
                            <td className="admin-date-cell">
                              {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="admin-actions-cell">
                              <select
                                className="admin-role-select"
                                value={u.role || 'Explorer'}
                                onChange={(e) => handleAdminChangeRole(u.id, e.target.value)}
                              >
                                <option value="Explorer">Explorer</option>
                                <option value="Power Explorer">Power Explorer</option>
                                <option value="Admin">Admin</option>
                              </select>
                              {String(u.email) !== String(authState.email) && (
                                <button
                                  type="button"
                                  className="admin-delete-user-btn"
                                  onClick={() => handleAdminDeleteUser(u.id)}
                                  title="Delete user and associated pins/boards"
                                >
                                  🗑️
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="admin-empty-table">No users loaded. Click Refresh Stats above.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* System Audit Events Section */}
              <div className="admin-section">
                <h3 className="admin-section-heading">📜 Platform Audit & Security Ledger</h3>
                <div className="admin-audit-list">
                  {adminData.auditLogs && adminData.auditLogs.length ? (
                    adminData.auditLogs.map((log) => (
                      <div key={log.id} className="admin-audit-item">
                        <div className="admin-audit-left">
                          <span className="admin-audit-action">{log.action}</span>
                          <span className="admin-audit-user">{log.user_email || log.user_name || `User #${log.user_id || 'System'}`}</span>
                        </div>
                        <div className="admin-audit-right">
                          <span className="admin-audit-time">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="admin-empty-table">No recent audit events recorded.</div>
                  )}
                </div>
              </div>
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
