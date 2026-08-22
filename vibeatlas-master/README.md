# VibeAtlas (Personal Cartographer)

Emotion-first journey mapping with smart vibe pins, route ranking, climate-aware routing, demo tooling, and secure authentication.

## Overview

VibeAtlas helps users discover and navigate places based on emotional context (mood, budget, time, reviews, ratings) instead of only shortest distance.

Core capabilities include:

- Smart emotional place profiles (Vibe Pins)
- Ranked route engine with score breakdown
- Emotion-dot visualization on map
- Climate-aware and vibe-sync routing modes
- Route feedback loop for mood improvement tracking
- Demo control and guided presentation flow
- JWT authentication with role-based authorization (RBAC)

## Tech Stack

- Frontend: React (react-scripts), react-map-gl, maplibre-gl
- Backend: Node.js, Express
- Database: PostgreSQL with PostGIS (required for backend persistence)
- Auth: bcryptjs + JWT

## Project Structure

- backend/ : API server and scoring logic
- frontend/ : React UI and map experience
- package.json (root) : run both frontend and backend together

## Quick Start

### 1) Install dependencies

Run from repository root:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

### 2) Run full app (frontend + backend)

```bash
npm start
```

Default URLs:

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

The frontend uses a development proxy for `/api`, so no frontend API URL is
needed locally. For a separately hosted API, set `REACT_APP_BACKEND_URL` in the
frontend environment and add the frontend URL to `FRONTEND_URL` in the backend
environment (comma-separated values are supported).

Note:

- The root prestart script clears ports 3001 and 5173 automatically.

### 3) Build frontend

```bash
npm run build --prefix frontend
```

## Environment Variables

Create .env files as needed.

### Backend (.env)

- DATABASE_URL=postgresql://user:password@localhost:5432/vibeatlas
- DATABASE_POOL_MAX=10 (optional)
- DATABASE_CONNECTION_TIMEOUT_MS=5000 (optional)
- JWT_SECRET=your_strong_secret
- JWT_EXPIRES_IN=7d (optional)
- OPENWEATHER_KEY=... (optional)
- OPENAI_API_KEY=... (optional)
- SPOTIFY_CLIENT_ID=... (optional)
- SPOTIFY_CLIENT_SECRET=... (optional)
- SPOTIFY_REDIRECT_URI=http://localhost:5173 (optional)
- NOTION_TOKEN=... (optional)
- NOTION_DATABASE_ID=... (optional)
- NOTION_VERSION=2022-06-28 (optional)
- NOTION_PROPERTY_NAME=Name (optional)
- NOTION_PROPERTY_LAT=Latitude (optional)
- NOTION_PROPERTY_LON=Longitude (optional)
- NOTION_PROPERTY_MOOD=Mood (optional)
- NOTION_PROPERTY_TAGS=Mood Tags (optional)
- NOTION_PROPERTY_BUDGET=Budget (optional)
- NOTION_PROPERTY_NOTE=Note (optional)
- NOTION_PROPERTY_SONG=Song (optional)

### Frontend (.env)

- REACT_APP_BACKEND_URL=http://localhost:3001
- REACT_APP_MAPTILER_KEY=... (optional)
- REACT_APP_N8N_WEBHOOK_URL=... (optional)
- REACT_APP_SPOTIFY_REDIRECT_URI=http://localhost:5173 (optional)

## Spotify API Setup (Required for Connect/Play)

Use Spotify Developer Dashboard and make sure redirect URI is exactly the same in both dashboard and backend env.

1. Create an app at https://developer.spotify.com/dashboard
2. In app settings, add redirect URI:
  - http://localhost:5173
3. Create `backend/.env` from `backend/.env.example` and set:
  - SPOTIFY_CLIENT_ID=your_client_id
  - SPOTIFY_CLIENT_SECRET=your_client_secret
  - SPOTIFY_REDIRECT_URI=http://localhost:5173
4. Optional frontend setting in `frontend/.env.local`:
  - REACT_APP_SPOTIFY_REDIRECT_URI=http://localhost:5173
5. Restart app:
  - npm start

Notes:

- Backend now exposes `GET /api/spotify/config` to verify if Spotify credentials are configured.
- Spotify playback requires an active Spotify device/session for the logged-in account.

## Authentication and RBAC

Backend auth routes:

- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- PUT /api/auth/profile
- POST /api/auth/logout
- GET /api/auth/users (Admin only)

Authorization model:

- Explorer
- Power Explorer
- Admin

RBAC rules (current):

- Demo seed/reset route is Admin only:
  - POST /api/dev/seed
- Protected write routes require authentication:
  - POST /api/vibes
  - POST /api/route-feedback

Bootstrap rule:

- First registered account becomes Admin automatically.
- Subsequent registrations default to Explorer.

## Main Features

### Smart Review + Rating System

Each Vibe Pin supports:

- name/location
- moodTags
- budget (low, medium, luxury)
- ratings (overall, safety, vibe, crowd)
- reviews (user, mood, rating, text, time)

### Smart Spot Ranking Engine

Route scoring formula:

score =
(rating * 0.4) +
(mood_match * 0.3) +
(distance_score * 0.1) +
(budget_match * 0.1) +
(time_match * 0.1)

### Demo and Presentation Features

- Demo menu section
- Seed Demo / Reset Demo / Guided Flow
- Top Ranked Spots panel with live component scores
- Demo Narrator Script (30s pitch)
- Narrator tones: Auto, Technical, Emotional, Judge Pitch
- Audience modes: General, Judges, Developers, Wellness

## Troubleshooting

### npm start exits with code 1

Usually caused by stale ports. This project already runs:

- prestart -> kill-port 3001 5173

If needed, manually run:

```bash
npx kill-port 3001 5173
npm start
```

### PostgreSQL setup

The backend requires `DATABASE_URL` and initializes its tables on startup. The
database must have the PostGIS extension available because vibe pins store a
geographic point. The backend exits with a clear error if PostgreSQL or the
schema is unavailable; it never silently switches to file or in-memory storage.

If you have existing data in `backend/local-store.json`, migrate it once before
starting the backend:

```bash
npm run migrate:local-store --prefix backend
```

Set `DATABASE_URL` in `backend/.env` before running the migration. The migration
upserts users and imports vibe pins and route feedback with their original
timestamps. Run it once for the existing store; later writes go only to
PostgreSQL.

## Postman Quick Test Guide

Use this section to quickly validate auth and RBAC APIs.

### Postman Environment Variables

Create a Postman environment with:

- baseUrl = http://localhost:3001
- token = (leave empty initially)

### 1) Register (first account becomes Admin)

- Method: POST
- URL: {{baseUrl}}/api/auth/register
- Body (raw JSON):

```json
{
  "name": "Admin User",
  "email": "admin@example.com",
  "password": "admin1234"
}
```

Expected:

- 201 Created
- response contains token and user
- save token from response to environment variable token

### 2) Login

- Method: POST
- URL: {{baseUrl}}/api/auth/login
- Body (raw JSON):

```json
{
  "email": "admin@example.com",
  "password": "admin1234"
}
```

Expected:

- 200 OK
- response contains token and user

### 3) Get Current User Profile (Protected)

- Method: GET
- URL: {{baseUrl}}/api/auth/me
- Headers:
  - Authorization: Bearer {{token}}

Expected:

- 200 OK
- user object returned

### 4) Update Profile (Protected)

- Method: PUT
- URL: {{baseUrl}}/api/auth/profile
- Headers:
  - Authorization: Bearer {{token}}
- Body (raw JSON):

```json
{
  "name": "Admin Updated",
  "role": "Admin"
}
```

Expected:

- 200 OK
- updated user object returned

Note:

- Role updates are restricted by backend checks.

### 5) Admin-Only: List Users

- Method: GET
- URL: {{baseUrl}}/api/auth/users
- Headers:
  - Authorization: Bearer {{token}}

Expected:

- 200 OK for Admin
- 403 Forbidden for non-Admin

### 6) Admin-Only: Seed Demo Data

- Method: POST
- URL: {{baseUrl}}/api/dev/seed
- Headers:
  - Authorization: Bearer {{token}}
- Body (raw JSON):

```json
{
  "reset": false
}
```

Expected:

- 200 OK for Admin
- 403 Forbidden for non-Admin

### 7) Protected Write Routes

Test these with and without Authorization header:

- POST {{baseUrl}}/api/vibes
- POST {{baseUrl}}/api/route-feedback

Expected:

- With valid token: success
- Without token: 401 Unauthorized

## Suggested Next Improvements

- Add refresh token flow and token revocation/blacklist
- Add role management UI for Admin users
- Add automated tests for auth + RBAC
- Add API documentation (OpenAPI/Swagger)

---

Built for emotionally intelligent route planning and presentation-ready demos.
