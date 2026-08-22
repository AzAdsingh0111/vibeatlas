const assert = require('node:assert/strict');
const test = require('node:test');
const { app, pool } = require('../server');
const { runMigrations } = require('../migrate');

let server;
let baseUrl;

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

test('Admin User Inspector and Multi-User Isolation Test Suite', async (t) => {
  // 1. Run migrations to ensure DB schema is current
  await runMigrations(pool);

  // 2. Start temporary test server
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });

  const rand = Math.random().toString(36).slice(2, 8);
  const adminEmail = `admin_${rand}@vibeatlas.test`;
  const userAEmail = `inspector_usera_${rand}@vibeatlas.test`;
  const userBEmail = `inspector_userb_${rand}@vibeatlas.test`;
  const password = 'InspectorPassword123!';

  let adminToken = '';
  let userAToken = '';
  let userBToken = '';
  let userAId;
  let userBId;
  let userAPinId;
  let userBPinId;
  let userABoardId;

  // Setup: Register Admin, User A, and User B
  await t.test('Setup: Register Admin and Normal Users with Scoped Data', async () => {
    // 1. Register Admin User
    const adminReg = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Super Admin', email: adminEmail, password }
    });
    assert.strictEqual(adminReg.status, 201, 'Admin registered');
    assert.ok(adminReg.data.token, 'Admin token received');
    adminToken = adminReg.data.token;
    const adminId = adminReg.data.user.id;

    // Elevate admin to Admin role in DB
    await pool.query("UPDATE users SET role = 'Admin' WHERE id = $1", [adminId]);

    // 2. Register User A (Explorer)
    const userAReg = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Alice Explorer', email: userAEmail, password }
    });
    assert.strictEqual(userAReg.status, 201, 'User A registered');
    userAToken = userAReg.data.token;
    userAId = userAReg.data.user.id;

    // 3. Register User B (Explorer)
    const userBReg = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Bob Explorer', email: userBEmail, password }
    });
    assert.strictEqual(userBReg.status, 201, 'User B registered');
    userBToken = userBReg.data.token;
    userBId = userBReg.data.user.id;

    // 4. Create Vibe Pin for User A (Calm)
    const pinARes = await request('/api/vibes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        name: 'Alice Secret Garden',
        mood: 'Calm',
        lat: 28.6139,
        lon: 77.2090,
        budget: 'free',
        note: 'Peaceful garden owned by Alice'
      }
    });
    assert.strictEqual(pinARes.status, 201, 'Alice Pin created');
    userAPinId = pinARes.data.id || pinARes.data.vibe?.id;

    // 5. Create Travel Board for User A
    const boardARes = await request('/api/boards', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: { name: 'Alice Calm Retreats', description: 'Collection of quiet spots' }
    });
    assert.strictEqual(boardARes.status, 201, 'Alice Board created');
    userABoardId = boardARes.data.board?.id || boardARes.data.id;

    // Add item to Alice's board
    await request(`/api/boards/${userABoardId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: { vibeId: userAPinId, title: 'Alice Garden Stop', note: 'First spot' }
    });

    // 6. Set Preferences for User A
    await request('/api/preferences', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: { theme: 'dark', defaultMood: 'Calm', routeMode: 'walking', preferScenic: true }
    });

    // 7. Save Home Place for User A
    await request('/api/saved-places', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: { slot: 'home', label: 'Alice Home', lat: 28.6100, lon: 77.2000, address: 'Alice Villa' }
    });

    // 8. Create Vibe Pin for User B (Excited)
    const pinBRes = await request('/api/vibes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userBToken}` },
      body: {
        name: 'Bob Electric Nightclub',
        mood: 'Excited',
        lat: 28.6300,
        lon: 77.2200,
        budget: 'high',
        note: 'Excited dancing place owned by Bob'
      }
    });
    assert.strictEqual(pinBRes.status, 201, 'Bob Pin created');
    userBPinId = pinBRes.data.id || pinBRes.data.vibe?.id;
  });

  // TEST A: Admin can inspect User A
  await t.test('TEST A: Admin can inspect User A complete data (200 OK)', async () => {
    const res = await request(`/api/admin/users/${userAId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.strictEqual(res.status, 200, 'Admin can inspect user');
    assert.strictEqual(res.data.user.id, userAId, 'Correct User A ID');
    assert.strictEqual(res.data.user.email, userAEmail, 'Correct User A email');
    assert.strictEqual(res.data.user.name, 'Alice Explorer', 'Correct User A name');
    assert.strictEqual(res.data.stats.vibe_pins_count, 1, 'Stats show 1 pin for Alice');
    assert.strictEqual(res.data.stats.boards_count, 1, 'Stats show 1 board for Alice');
    assert.strictEqual(res.data.stats.saved_places_count, 1, 'Stats show 1 saved place for Alice');
    assert.strictEqual(res.data.stats.favorite_mood, 'Calm', 'Favorite mood is Calm');

    // Scoped vibes
    assert.strictEqual(res.data.vibes.length, 1, 'Alice has 1 vibe pin');
    assert.strictEqual(res.data.vibes[0].name, 'Alice Secret Garden', 'Correct pin title');
    assert.strictEqual(res.data.vibes[0].mood, 'Calm', 'Correct pin mood');

    // Scoped boards
    assert.strictEqual(res.data.boards.length, 1, 'Alice has 1 board');
    assert.strictEqual(res.data.boards[0].name, 'Alice Calm Retreats', 'Correct board name');
    assert.strictEqual(res.data.boards[0].items.length, 1, 'Board has 1 item');

    // Scoped saved places
    assert.strictEqual(res.data.saved_places.length, 1, 'Alice has 1 saved place');
    assert.strictEqual(res.data.saved_places[0].slot, 'home', 'Saved place slot is home');

    // Scoped preferences
    assert.ok(res.data.preferences, 'Preferences returned');
    assert.strictEqual(res.data.preferences.default_mood, 'Calm', 'Default mood Calm');

    // Activity trail & sessions
    assert.ok(Array.isArray(res.data.activity_trail), 'Activity trail array');
    assert.ok(Array.isArray(res.data.sessions), 'Sessions array');
    assert.ok(res.data.sessions.length >= 1, 'At least 1 session');
  });

  // TEST B: Explorer cannot inspect User A (403 Forbidden) and Unauthenticated gets 401
  await t.test('TEST B: Explorer cannot inspect User A (403 Forbidden) and Unauthenticated gets 401', async () => {
    // Normal user (Bob) attempting to inspect Alice
    const explorerRes = await request(`/api/admin/users/${userAId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    assert.strictEqual(explorerRes.status, 403, 'Normal Explorer receives 403 Forbidden');

    // Unauthenticated request
    const unauthRes = await request(`/api/admin/users/${userAId}`, {
      method: 'GET'
    });
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request receives 401 Unauthorized');
  });

  // TEST C: User data is correctly scoped (User A vs User B data isolation)
  await t.test('TEST C: User data is correctly scoped (User A vs User B data isolation)', async () => {
    // Inspect User A
    const resA = await request(`/api/admin/users/${userAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    // Inspect User B
    const resB = await request(`/api/admin/users/${userBId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.strictEqual(resA.data.vibes[0].name, 'Alice Secret Garden');
    assert.strictEqual(resB.data.vibes[0].name, 'Bob Electric Nightclub');
    assert.strictEqual(resA.data.stats.favorite_mood, 'Calm');
    assert.strictEqual(resB.data.stats.favorite_mood, 'Excited');

    // Verify Alice does not have Bob's pin
    const aliceHasBobPin = resA.data.vibes.some((v) => v.id === userBPinId);
    assert.strictEqual(aliceHasBobPin, false, "Alice's inspected data does not contain Bob's pin");

    // Verify Bob does not have Alice's pin
    const bobHasAlicePin = resB.data.vibes.some((v) => v.id === userAPinId);
    assert.strictEqual(bobHasAlicePin, false, "Bob's inspected data does not contain Alice's pin");
  });

  // TEST D: Admin Overview endpoint returns actual database counts
  await t.test('TEST D: Admin Overview endpoint returns actual database counts', async () => {
    const overviewRes = await request('/api/admin/overview', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.strictEqual(overviewRes.status, 200, 'Admin overview returns 200');
    assert.ok(overviewRes.data.stats, 'Stats object exists');
    assert.ok(overviewRes.data.stats.totalUsers >= 3, 'Total users reflects registered accounts');
    assert.ok(overviewRes.data.stats.totalPins >= 2, 'Total pins reflects user pins');
    assert.ok(overviewRes.data.stats.totalBoards >= 1, 'Total boards reflects created boards');
    assert.ok(overviewRes.data.stats.activeSessions >= 1, 'Active sessions reflects logins');
  });

  // TEST E: Sensitive data protection (no secrets/passwords exposed)
  await t.test('TEST E: Sensitive data protection (no password_hash, JWT, secrets)', async () => {
    const res = await request(`/api/admin/users/${userAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.strictEqual(res.status, 200);
    const jsonStr = JSON.stringify(res.data);

    assert.strictEqual(res.data.user.password_hash, undefined, 'password_hash is not present in user');
    assert.strictEqual(res.data.user.password, undefined, 'password is not present in user');
    assert.strictEqual(res.data.user.jwt, undefined, 'jwt is not present');
    assert.strictEqual(jsonStr.includes('password_hash'), false, 'Response payload never mentions password_hash');
    assert.strictEqual(jsonStr.includes('JWT_SECRET'), false, 'Response payload never mentions JWT_SECRET');
    assert.strictEqual(jsonStr.includes('DATABASE_URL'), false, 'Response payload never mentions DATABASE_URL');
  });

  // Teardown: Close temporary test server
  server.close();
});
