# 🗺️ Vibe Atlas (Personal Cartographer)

> **Emotion-First Journey Mapping, Intelligent Vibe Discovery, Multi-User Board Planner & Real-Time Administrative Mirror**  
> Powered by PostgreSQL, PostGIS, MapLibre GL, and Strict Multi-Tenant Data Isolation.

---

## 🌟 Executive Overview

**Vibe Atlas** transforms spatial exploration by pairing physical navigation with emotional intelligence. Rather than merely calculating shortest Euclidean paths, Vibe Atlas ranks, charts, and journals journeys based on emotional resonance—mood, budget, atmosphere, community safety ratings, reviews, and real-time environmental context.

With the unified relational architecture, Vibe Atlas implements a **Single Source of Truth** in PostgreSQL, featuring automated **Live User $\to$ Admin Data Synchronization** and a deep **Admin User Inspector**.

---

## ✨ Key Capabilities

1. **Single Source of Truth (PostgreSQL Engine)**:
   - 100% relational storage backed by automated, sequential schema migrations.
   - All User Portal and Admin Portal operations read and write directly to the same underlying PostgreSQL tables (`users`, `vibes`, `boards`, `board_items`, `saved_places`, `user_preferences`, `user_route_profiles`, `user_sessions`, `route_feedback`, `audit_events`).
2. **Live Administrative Mirror & Real-Time Sync**:
   - The Admin Portal continuously reflects user creations, modifications, and deletions in real-time via an intelligent 3-second non-blocking synchronization loop.
   - Dynamic Admin endpoints enforce `Cache-Control: no-store` to prevent stale proxy or browser cache retention.
3. **Admin User Inspector & Deep Diagnostics**:
   - Administrators can select any user to inspect an administrative mirror of their complete profile, live aggregated metrics, saved pins, travel boards with nested spot items, saved shortcuts, preferences, activity trail, and active sessions.
4. **Strict Multi-User Tenant Isolation**:
   - Personal resources are scoped at the database layer (`WHERE user_id = $1`). User A can never view or modify User B's pins, collections, or preferences.
   - Ownership is stamped strictly from cryptographically verified server-side JWT session identity; client-supplied `user_id` bodies are untrusted.
5. **Dual Authentication & Session Engine**:
   - **Email & Password**: Bcrypt password hashing ($10$ rounds) and JWT authentication with database-tracked revocable sessions in `user_sessions`.
   - **Google OAuth 2.0**: Direct Google authorization with secure token exchange, plus one-click demo access.
6. **Travel Boards Planner**:
   - Curate, organize, and manage multi-stop itineraries with direct "Focus on Map" spatial centering.
7. **Smart Spot Ranking Engine**:
   - Multi-factor algorithm weighing ratings, mood compatibility, distance, budget affinity, and time-of-day relevance.

---

## 🏗️ Architecture & Data Flow

### Live Administrative Mirror Architecture

```text
                  ┌────────────────────────────────────────┐
                  │          PostgreSQL Database           │
                  │        (SINGLE SOURCE OF TRUTH)        │
                  │ users · vibes · boards · board_items   │
                  │ saved_places · user_preferences · audit│
                  └───────────────────┬────────────────────┘
                                      │
                 ┌────────────────────┴────────────────────┐
                 │                                         │
                 ▼                                         ▼
         User REST APIs                             Admin REST APIs
  (POST/PUT/DELETE /api/vibes,              (GET /api/admin/overview,
   /api/boards, /api/preferences, etc.)      GET /api/admin/users/:id,
                 │                           GET /api/admin/vibes, boards)
                 ▼                                         │
            User Portal                                    ▼
       (Creates / Modifies / Deletes)                 Admin Portal
                                            (Intelligent 3s Live Sync Loop)
                                                           │
                                                           ▼
                                            Automatic Real-Time UI Mirror
```

---

## 📁 Repository Structure

```text
vibeatlas-master/
├── backend/
│   ├── migrations/
│   │   ├── 001_initial.sql                          # Core schema: users, sessions, vibes, feedback, audit
│   │   ├── 002_boards_and_preferences.sql            # Boards, board items, preferences, saved places, route profiles
│   │   ├── 003_google_oauth.sql                     # Google OAuth columns (google_id, avatar_url)
│   │   └── 004_challenge_655_created_by_is_demo.sql # Creator tracking & demo dataset isolation
│   ├── test/
│   │   ├── admin_user_inspector.test.js             # User Inspector & overview verification (6 tests)
│   │   ├── live_user_admin_sync.test.js             # Real-time User -> Admin sync verification (7 tests)
│   │   ├── migrations.test.js                       # Migration integrity verification (4 tests)
│   │   └── multi_user_isolation.test.js             # Cross-tenant data isolation test suite (5 tests)
│   ├── migrate.js                                   # Automated sequential migration runner
│   ├── server.js                                    # Express REST API & business logic
│   ├── package.json                                 # Backend dependencies & scripts
│   ├── .env.example                                 # Local development environment template
│   └── .env.production.example                      # Production environment template
├── frontend/
│   ├── public/                                      # Static assets & HTML template
│   ├── src/
│   │   ├── App.jsx                                  # Core Map interface, User & Admin Portals
│   │   ├── App.css                                  # Design system & Glassmorphic styling
│   │   ├── Login.jsx                                # Auth modal form component
│   │   ├── Login.css                                # Auth modal styling
│   │   ├── GuideBot.jsx                             # In-app assistant component
│   │   └── index.js                                 # React entrypoint
│   ├── package.json                                 # Frontend dependencies & CRA build scripts
│   ├── .env.example                                 # Frontend local environment template
│   └── .env.production.example                      # Frontend production environment template
├── package.json                                     # Root orchestration scripts
└── README.md                                        # Technical documentation
```

---

## 📋 Comprehensive Feature Breakdown

### 1. User Features
- **Interactive Vibe Pins**:
  - Place custom pins on the map with name, mood category, mood tags, budget level, ratings (overall, safety, vibe, crowd), custom notes, and soundtrack/song pairing.
  - Full CRUD operations with live edit modal and confirmation before deletion.
- **Mood System**:
  - Filter and visualize pins categorized across 5 distinct moods: `Calm`, `Excited`, `Musical`, `Reflective`, and `Melancholy`.
- **Travel Boards Planner**:
  - Create themed collections (e.g., "Weekend Acoustic Spots", "Monsoon Heritage").
  - Add pins directly to boards with custom notes.
  - Inspect board items and click "Focus on Map" to navigate directly to spots.
- **Saved Places & Shortcuts**:
  - Save essential locations (`Home`, `Work`, `Custom`) with geographic coordinates and address metadata.
- **User Profile & Emotional Preferences**:
  - Manage user name and profile info.
  - Customize persistent preferences: Theme (`dark`, `light`, `system`), Default Mood, Route Mode (`walking`, `bicycling`, `driving`), Budget affinity, Scenic preference, and Voice alerts.
- **Smart Spot Ranking Formula**:
  $$\text{Score} = (\text{Rating} \times 0.40) + (\text{MoodMatch} \times 0.30) + (\text{DistanceScore} \times 0.10) + (\text{BudgetMatch} \times 0.10) + (\text{TimeMatch} \times 0.10)$$
- **Activity Trail**:
  - Chronological log of personal actions (pin creations, board edits, preference updates).

---

### 2. Admin Portal & Live Administrative Mirror
- **Overview Dashboard**:
  - Live aggregate KPI metrics querying PostgreSQL directly:
    - `Live Accounts`: Real count of registered users in `users`.
    - `Spatial Points`: Real count of vibe pins in `vibes`.
    - `Collections`: Real count of travel boards in `boards`.
    - `JWT Verified`: Real count of active unrevoked sessions in `user_sessions`.
  - Mood distribution charts and live system audit event stream.
- **Users Directory**:
  - Full list of registered accounts with email, role badges, pin/board counts, last login timestamp, role switcher (`Explorer`, `Power Explorer`, `Admin`), and user account deletion.
- **Admin User Inspector Modal**:
  - Accessible via the **`🔍 Inspect`** button on any user row.
  - **Header**: User avatar initial, name, role badge, Google Auth tag, user ID, joined date, last login.
  - **Live Aggregate KPIs**: 6 cards displaying calculated statistics (`vibe_pins_count`, `boards_count`, `saved_places_count`, `favorite_mood`, `active_sessions_count`, `activity_events_count`).
  - **6 Dedicated Inspection Tabs**:
    1. 📍 **Saved Pins**: Complete table of user's pins (Name, Mood, Coordinates, Budget, Notes, Created date).
    2. 📋 **Travel Boards**: List of user boards with nested spot items and notes.
    3. 🏠 **Saved Places**: Home, Work, and custom shortcut destinations.
    4. ⚙️ **Preferences**: Theme, Default mood, Route mode, Budget, Scenic preference.
    5. 📜 **Activity Trail**: Chronological audit trail of user actions.
    6. ⚡ **Login Sessions**: Active and expired JWT sessions.
- **Live User $\to$ Admin Synchronization**:
  - While the Admin Portal is open, an intelligent background polling loop refreshes data every **3 seconds**.
  - When inspecting a user, the Inspector Modal silently refreshes without closing or flickering, instantly reflecting real-time user mutations (pin creation/deletion, board changes, profile renames, preference updates).

---

## 🔐 Security & Multi-User Isolation

1. **Server-Side Ownership Enforcement**:
   - The backend never trusts `user_id` supplied in HTTP request bodies.
   - Resource ownership is strictly resolved from `req.authUser.id` extracted from the verified JWT payload and validated against active database sessions in `user_sessions`.
2. **Role-Based Access Control (RBAC)**:
   - Admin endpoints (`/api/admin/*`, `/api/auth/users`) require `requireAuth` + `requireRoles(['Admin'])`.
   - Regular `Explorer` users attempting to access Admin endpoints receive `HTTP 403 Forbidden`.
   - Unauthenticated requests receive `HTTP 401 Unauthorized`.
3. **Sensitive Credential Protection**:
   - `password_hash`, `JWT_SECRET`, `DATABASE_URL`, and OAuth access/refresh tokens are stripped and never returned in API responses or user inspection objects.
4. **Parameterized SQL Queries**:
   - 100% of PostgreSQL queries use parameterized placeholders (`$1`, `$2`, etc.) preventing SQL injection vulnerabilities.

---

## 📡 REST API Reference

### Authentication & Profile
| Method | Path | Auth Required | Role | Purpose |
|:---|:---|:---|:---|:---|
| `POST` | `/api/auth/register` | No | Public | Register new user account |
| `POST` | `/api/auth/login` | No | Public | Authenticate with email/password and receive JWT |
| `GET` | `/api/auth/me` | Yes | Any | Retrieve current authenticated user profile |
| `PUT` | `/api/auth/profile` | Yes | Any | Update profile display name |
| `POST` | `/api/auth/logout` | Yes | Any | Revoke session in `user_sessions` |
| `GET` | `/api/auth/google/url` | No | Public | Get Google OAuth 2.0 authorization URL |
| `POST` | `/api/auth/google/callback` | No | Public | Exchange Google authorization code for JWT session |
| `POST` | `/api/auth/google/demo` | No | Public | One-click demo Google session generation |
| `GET` | `/api/auth/users` | Yes | Admin | Retrieve user accounts list |

### Vibe Pins
| Method | Path | Auth Required | Role | Purpose |
|:---|:---|:---|:---|:---|
| `GET` | `/api/vibes` | Optional | Any | List vibe pins (user-scoped when authenticated) |
| `POST` | `/api/vibes` | Yes | Any | Create a new vibe pin |
| `GET` | `/api/vibes/:id` | No | Public | Retrieve single vibe pin details |
| `PUT` | `/api/vibes/:id` | Yes | Owner/Admin | Update pin details (403 on mismatch) |
| `DELETE` | `/api/vibes/:id` | Yes | Owner/Admin | Delete pin (403 on mismatch) |
| `GET` | `/api/vibes/history` | Yes | Any | List authenticated user's change history |
| `GET` | `/api/vibes/heatmap` | Optional | Any | Retrieve coordinate clusters for heatmap overlay |
| `POST` | `/api/vibes/route` | Optional | Any | Generate emotion-ranked waypoint routes |

### Travel Boards & Items
| Method | Path | Auth Required | Role | Purpose |
|:---|:---|:---|:---|:---|
| `GET` | `/api/boards` | Yes | Any | List user's travel boards with item counts |
| `POST` | `/api/boards` | Yes | Any | Create a new travel board |
| `GET` | `/api/boards/:id` | Yes | Owner/Admin | Get board details and contained spot items |
| `PUT` | `/api/boards/:id` | Yes | Owner/Admin | Update board name / description |
| `DELETE` | `/api/boards/:id` | Yes | Owner/Admin | Delete board and cascading items |
| `POST` | `/api/boards/:id/items` | Yes | Owner/Admin | Add a spot/vibe item to a board |
| `DELETE` | `/api/boards/:id/items/:itemId` | Yes | Owner/Admin | Remove an item from a board |

### Preferences, Saved Places & Route Profiles
| Method | Path | Auth Required | Role | Purpose |
|:---|:---|:---|:---|:---|
| `GET` | `/api/preferences` | Yes | Any | Get user routing and UI preferences |
| `PUT` | `/api/preferences` | Yes | Any | Update routing and UI preferences |
| `GET` | `/api/saved-places` | Yes | Any | List user's saved shortcuts (Home, Work, etc.) |
| `POST` | `/api/saved-places` | Yes | Any | Save or update a place shortcut |
| `DELETE` | `/api/saved-places/:id` | Yes | Owner/Admin | Delete a saved place shortcut |
| `GET` | `/api/route-profiles` | Yes | Any | List saved route preference profiles |
| `POST` | `/api/route-profiles` | Yes | Any | Save a new custom route profile |
| `DELETE` | `/api/route-profiles/:id` | Yes | Owner/Admin | Delete a custom route profile |
| `POST` | `/api/route-feedback` | Yes | Any | Submit mood before/after feedback |

### Admin Endpoints
| Method | Path | Auth Required | Role | Purpose |
|:---|:---|:---|:---|:---|
| `GET` | `/api/admin/overview` | Yes | Admin | Live aggregate counts and mood analytics |
| `GET` | `/api/admin/users/:id` | Yes | Admin | Deep user inspector (profile, stats, pins, boards, places, preferences, audit, sessions) |
| `GET` | `/api/admin/vibes` | Yes | Admin | Directory of all system vibe pins with creator info |
| `GET` | `/api/admin/boards` | Yes | Admin | Directory of all travel boards with creator info |
| `PUT` | `/api/admin/users/:id/role` | Yes | Admin | Change a user's role (`Explorer`, `Power Explorer`, `Admin`) |
| `DELETE` | `/api/admin/users/:id` | Yes | Admin | Delete a user account and cascade user data |
| `POST` | `/api/admin/sessions/clean` | Yes | Admin | Purge expired and revoked sessions |
| `POST` | `/api/dev/seed` | Yes | Admin | Seed demo landmarks for testing |

---

## 🗄️ Database & Schema Migrations

### Requirements
- **PostgreSQL**: Version 14 or higher (supports PostGIS geometry types where enabled).

### Migrations
Migrations are stored in `backend/migrations/` and run sequentially using `backend/migrate.js`. Schema state is tracked in `schema_migrations`.

```text
backend/migrations/
├── 001_initial.sql                          # Core schema: users, user_sessions, vibes, route_feedback, audit_events
├── 002_boards_and_preferences.sql            # Boards, board_items, user_preferences, saved_places, user_route_profiles
├── 003_google_oauth.sql                     # Adds google_id and avatar_url to users table
└── 004_challenge_655_created_by_is_demo.sql # Adds created_by and is_demo columns to vibes table
```

### Relational Schema Summary
- `users`: `id`, `name`, `email`, `password_hash`, `role`, `avatar_url`, `google_id`, `created_at`, `updated_at`
- `user_sessions`: `id`, `user_id` (FK $\to$ `users.id` ON DELETE CASCADE), `created_at`, `expires_at`, `revoked_at`
- `vibes`: `id`, `name`, `mood`, `mood_tags` (JSONB), `lat`, `lon`, `budget`, `ratings` (JSONB), `reviews` (JSONB), `note`, `song`, `spotify_track_id`, `spotify_playlist_id`, `weather`, `time`, `user_id` (FK $\to$ `users.id`), `created_by` (FK $\to$ `users.id`), `is_demo`, `created_at`, `updated_at`
- `boards`: `id`, `user_id` (FK $\to$ `users.id` ON DELETE CASCADE), `name`, `description`, `created_at`, `updated_at`
- `board_items`: `id`, `board_id` (FK $\to$ `boards.id` ON DELETE CASCADE), `user_id` (FK $\to$ `users.id`), `vibe_id` (FK $\to$ `vibes.id` ON DELETE SET NULL), `title`, `note`, `mood`, `lat`, `lon`, `metadata` (JSONB), `created_at`
- `saved_places`: `id`, `user_id` (FK $\to$ `users.id` ON DELETE CASCADE), `slot`, `label`, `lat`, `lon`, `address`, `mood`, `created_at`, `updated_at`
- `user_preferences`: `user_id` (PK, FK $\to$ `users.id` ON DELETE CASCADE), `theme`, `default_mood`, `route_mode`, `budget`, `voice_alerts`, `prefer_scenic`, `minimize_stops`, `return_to_start`, `max_stops`, `custom_settings` (JSONB), `updated_at`
- `user_route_profiles`: `id`, `user_id` (FK $\to$ `users.id` ON DELETE CASCADE), `name`, `settings` (JSONB), `created_at`
- `audit_events`: `id`, `user_id` (FK $\to$ `users.id` ON DELETE SET NULL), `event_type`, `metadata` (JSONB), `created_at`
- `route_feedback`: `id`, `route_id`, `before_mood`, `after_mood`, `improvement_score`, `feedback_rating`, `created_at`, `user_id` (FK $\to$ `users.id` ON DELETE CASCADE)

---

## ⚙️ Environment Variables

### Backend Variables (`backend/.env`)

| Variable | Required? | Used By | Purpose | Production Notes |
|:---|:---|:---|:---|:---|
| `DATABASE_URL` | **Yes** | Backend | PostgreSQL connection connection URI | Must include credentials & SSL parameters (`sslmode=require`) |
| `JWT_SECRET` | **Yes** | Backend | Secret key used for signing JWT tokens | Must be a high-entropy string (min 32 characters) |
| `PORT` | No | Backend | HTTP listener port | Defaults to `3001` or host-assigned `$PORT` |
| `FRONTEND_URL` | **Yes** | Backend | Allowed CORS origin | Must match production frontend domain (e.g., `https://your-domain.com`) |
| `DATABASE_SSL` | No | Backend | Enable SSL for PostgreSQL | Set `true` on managed cloud databases |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | No | Backend | Enforce strict SSL certificate verification | Set `true` in secure production environments |
| `DATABASE_POOL_MAX` | No | Backend | Max connection pool size | Default `10` |
| `DATABASE_CONNECTION_TIMEOUT_MS` | No | Backend | DB connection timeout in ms | Default `5000` |
| `JWT_EXPIRES_IN` | No | Backend | JWT expiration duration | Default `7d` |
| `GOOGLE_CLIENT_ID` | Optional | Backend | Google OAuth client ID | Required only if Google OAuth is enabled |
| `GOOGLE_CLIENT_SECRET` | Optional | Backend | Google OAuth client secret | Required only if Google OAuth is enabled |
| `GOOGLE_REDIRECT_URI` | Optional | Backend | Google OAuth callback redirect URL | Defaults to `${FRONTEND_URL}/auth/google/callback` |
| `OPENWEATHER_KEY` | Optional | Backend | Weather overlay integration | Optional weather data API |
| `OPENAI_API_KEY` | Optional | Backend | AI GuideBot suggestions | Optional recommendation engine |
| `SPOTIFY_CLIENT_ID` | Optional | Backend | Spotify track curation | Optional music player integration |
| `SPOTIFY_CLIENT_SECRET`| Optional | Backend | Spotify secret | Optional music player integration |
| `NOTION_TOKEN` | Optional | Backend | Notion export integration | Optional database export |

### Frontend Variables (`frontend/.env`)

| Variable | Required? | Used By | Purpose | Production Notes |
|:---|:---|:---|:---|:---|
| `REACT_APP_BACKEND_URL` | **Yes (in prod)** | Frontend | Base URL of backend REST API | Set to production backend URL (e.g. `https://api.your-domain.com`) |
| `REACT_APP_MAPTILER_KEY` | Optional | Frontend | MapTiler vector map styles | Optional custom map tiles |
| `REACT_APP_N8N_WEBHOOK_URL` | Optional | Frontend | n8n automation webhook | Optional automation trigger |
| `REACT_APP_SPOTIFY_REDIRECT_URI` | Optional | Frontend | Spotify OAuth redirect | Optional Spotify integration |

> ⚠️ **Security Notice**: Never commit real passwords, JWT secrets, or production connection strings to version control.

---

## 🚀 Local Development Setup

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **PostgreSQL**: v14.0 or higher running locally
- **npm**: v8.0.0 or higher

### 2. Install Dependencies
```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

### 3. Configure Local Environment
Create `backend/.env` (based on `backend/.env.example`):
```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vibeatlas
DATABASE_SSL=false
JWT_SECRET=local_development_jwt_secret_min_32_chars_long
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
```

### 4. Run Migrations
```bash
npm run migrate --prefix backend
```

### 5. Start Development Servers
```bash
npm start
```
- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:3001](http://localhost:3001)

---

## 🌐 Production Deployment

*Ready for production deployment after environment/hosting configuration.*

### Production Architecture

```text
                               INTERNET
                                  │
                  ┌───────────────┴───────────────┐
                  │                               │
                  ▼                               ▼
      Frontend Static Hosting            Backend Node.js Service
   (Vercel / Netlify / Cloudflare)          (Render / Railway / Fly)
                  │                               │
                  │                               ▼
                  │                    Managed PostgreSQL + PostGIS
                  │                    (Supabase / Neon / AWS RDS)
                  │
                  └──────── HTTPS API Calls ──────►
```

### 1. Production Database Setup
1. Provision a managed PostgreSQL instance (e.g. Supabase, Neon, AWS RDS).
2. Obtain connection string with SSL enabled (`sslmode=require`).
3. Set `DATABASE_URL` in backend environment.
4. Migrations execute automatically on backend startup via `runMigrations(pool)`. Alternatively, run `npm run migrate --prefix backend` in release phase.

### 2. Backend Service Deployment
- **Build Step**: No build step required for Node.js backend.
- **Start Command**: `node server.js` (or `npm start` in `backend/`).
- **Environment Variables**:
  - `NODE_ENV=production`
  - `DATABASE_URL=postgresql://user:pass@host:5432/vibeatlas?sslmode=require`
  - `DATABASE_SSL=true`
  - `DATABASE_SSL_REJECT_UNAUTHORIZED=true`
  - `JWT_SECRET=your_production_secure_random_key_min_32_chars`
  - `FRONTEND_URL=https://your-frontend-domain.example`
  - `PORT=3001` (or host-assigned `$PORT`)

### 3. Frontend Static Deployment
- **Build Command**: `npm run build` in `frontend/`.
- **Output Directory**: `frontend/build/`.
- **Environment Variable**: Provide `REACT_APP_BACKEND_URL=https://your-backend-domain.example` during build.
- **SPA Fallback**: Configure routing rules to serve `index.html` on all unmatched routes (`/*`).

### 4. Google OAuth Production Configuration
- In Google Cloud Console $\to$ Credentials $\to$ OAuth 2.0 Client IDs:
  - **Authorized JavaScript Origins**: `https://your-frontend-domain.example`
  - **Authorized Redirect URIs**: `https://your-frontend-domain.example/auth/google/callback`
- In backend environment:
  - `GOOGLE_CLIENT_ID=your_production_client_id.apps.googleusercontent.com`
  - `GOOGLE_CLIENT_SECRET=your_production_client_secret`
  - `GOOGLE_REDIRECT_URI=https://your-frontend-domain.example/auth/google/callback`

---

## 🔒 Production Security

### Already Implemented in Codebase
- Server-side authenticated identity resolution (`req.authUser.id` stamped from JWT; untrusted client `user_id` ignored).
- Role-based authorization (`requireRoles(['Admin'])`) on all Admin APIs.
- Non-admin `Explorer` access to `/api/admin/*` blocked with `403 Forbidden`.
- Bcrypt password hashing (10 salt rounds).
- Database-tracked revocable session tokens in `user_sessions`.
- Parameterized SQL queries on all database operations.
- Sensitive credentials (`password_hash`, `JWT_SECRET`, `DATABASE_URL`, OAuth tokens) stripped from responses.
- `Cache-Control: no-store` header on dynamic Admin endpoints.

### Must Configure Before Production
- Provision a strong, random `JWT_SECRET` (min 32 characters).
- Configure production `DATABASE_URL` with SSL (`sslmode=require`).
- Restrict `FRONTEND_URL` to production domain for CORS protection.
- Enforce HTTPS across frontend and backend hosting.
- Enable automated daily snapshots and point-in-time recovery (PITR) on managed PostgreSQL host.

---

## 💾 Database Backup & Recovery

- **Application Responsibility**: All schema definitions and migrations are versioned under `backend/migrations/` and track execution state in `schema_migrations`.
- **Hosting / Provider Responsibility**: Production database persistence, automated point-in-time recovery (PITR), and daily snapshot backups are managed by the PostgreSQL hosting provider (Supabase, Neon, AWS RDS).

---

## 🧪 Testing & Verification

Execute the complete backend test suite:
```bash
cd backend
npm test
```

### Verified Test Suites (25 / 25 Passing)
```text
TAP version 13
ok 1 - Admin User Inspector and Multi-User Isolation Test Suite (6 tests)
ok 2 - LIVE USER → ADMIN DATA SYNCHRONIZATION TEST SUITE (7 tests)
ok 3 - initial migration creates persistent user-owned and audit tables (1 test)
ok 4 - boards migration creates boards, board items, preferences and saved places tables (1 test)
ok 5 - google oauth migration adds google_id and avatar_url to users table (1 test)
ok 6 - challenge 655 migration ensures created_by and is_demo columns exist (1 test)
ok 7 - Multi-User Isolation and Complete Relational Ownership Test (5 tests)
1..7
# tests 25
# pass 25
# fail 0
```

Build verification:
```bash
cd frontend
npm run build
```
*(Compiled successfully with 0 errors)*

---

## 📊 Current Feature Status

| Feature | Status | Verified By |
|:---|:---:|:---|
| **Registration & Login** | ✅ Verified | Automated integration tests (`live_user_admin_sync.test.js`, `multi_user_isolation.test.js`) |
| **Session Revocation (Logout)** | ✅ Verified | Automated integration test (`multi_user_isolation.test.js`) |
| **Google OAuth 2.0 & Demo** | ✅ Verified | Backend auth endpoints & frontend modal verification |
| **Vibe Pins CRUD** | ✅ Verified | Automated integration tests (`live_user_admin_sync.test.js`) |
| **Travel Boards & Items** | ✅ Verified | Automated integration tests (`live_user_admin_sync.test.js`) |
| **Saved Places Shortcuts** | ✅ Verified | Automated integration tests (`admin_user_inspector.test.js`) |
| **Preferences Sync** | ✅ Verified | Automated integration tests (`live_user_admin_sync.test.js`) |
| **Spot Ranking Formula** | ✅ Verified | Smart scoring algorithm in `backend/server.js` |
| **Admin Overview KPIs** | ✅ Verified | Automated integration tests (`admin_user_inspector.test.js`) |
| **Admin Users Directory** | ✅ Verified | User list & role management endpoints |
| **Admin User Inspector** | ✅ Verified | Automated integration tests (`admin_user_inspector.test.js`, `live_user_admin_sync.test.js`) |
| **Live User $\to$ Admin Sync** | ✅ Verified | Automated integration tests (`live_user_admin_sync.test.js`) & 3s polling loop |
| **Multi-User Tenant Isolation** | ✅ Verified | Automated integration tests (`multi_user_isolation.test.js`) |
| **PostgreSQL Persistence** | ✅ Verified | Sequential migrations `001`–`004` & schema verification |
| **Frontend Production Build** | ✅ Verified | `react-scripts build` (0 compilation errors) |
| **Backend Integration Tests** | ✅ Verified | `node --test` (25/25 passing) |

---

## ⚠️ Known Limitations

1. **Third-Party API Integrations**: Weather overlays (`OPENWEATHER_KEY`), AI recommendations (`OPENAI_API_KEY`), and Spotify playback (`SPOTIFY_CLIENT_ID`) require individual external API credentials.
2. **Real-Time Transport**: Live Admin synchronization currently utilizes an intelligent 3-second non-blocking HTTP polling loop with `Cache-Control: no-store`. WebSocket/SSE transport is optional for future high-concurrency scaling.

---

## 📝 Changelog

### Version 1.2.0 (August 22, 2026)
- **Single Source of Truth**: Unified all User and Admin data models into PostgreSQL without separate admin stores or duplicate caches.
- **Live User $\to$ Admin Synchronization**: Added an intelligent 3-second background synchronization loop in the Admin Portal.
- **Admin User Inspector Modal**: Implemented comprehensive user inspector modal featuring profile metadata, 6 live statistics KPI cards, and 6 inspection tabs (*Pins*, *Boards*, *Places*, *Preferences*, *Activity*, *Sessions*).
- **Admin Overview Fix**: Resolved SQL column naming mismatch in `/api/admin/overview`, enabling real-time PostgreSQL aggregate metrics.
- **Preferences API Enhancement**: Updated `/api/preferences` to support both camelCase and snake_case request payloads.
- **Automated Test Suite**: Added `live_user_admin_sync.test.js` and `admin_user_inspector.test.js` bringing total passing integration tests to 25/25.
- **Cache Invalidation**: Added `Cache-Control: no-store` to all dynamic Admin endpoints.

---

## 📄 License & Credits
Developed for **Vibe Atlas**. Built with MapLibre GL, PostgreSQL, Node.js Express, and React.
