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

test('LIVE USER → ADMIN DATA SYNCHRONIZATION TEST SUITE', async (t) => {
  await runMigrations(pool);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });

  const rand = Math.random().toString(36).slice(2, 8);
  const adminEmail = `sync_admin_${rand}@vibeatlas.test`;
  const userAEmail = `sync_usera_${rand}@vibeatlas.test`;
  const userBEmail = `sync_userb_${rand}@vibeatlas.test`;
  const password = 'SyncPassword123!';

  let adminToken = '';
  let userAToken = '';
  let userBToken = '';
  let userAId;
  let userBId;
  let pinId;
  let boardId;

  // Setup: Register Admin, User A, and User B
  await t.test('Setup: Register Admin and Explorers', async () => {
    // 1. Register Admin
    const adminReg = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Live Admin', email: adminEmail, password }
    });
    assert.strictEqual(adminReg.status, 201);
    adminToken = adminReg.data.token;
    const adminId = adminReg.data.user.id;
    await pool.query("UPDATE users SET role = 'Admin' WHERE id = $1", [adminId]);

    // 2. Register User A
    const userAReg = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Alice Initial', email: userAEmail, password }
    });
    assert.strictEqual(userAReg.status, 201);
    userAToken = userAReg.data.token;
    userAId = userAReg.data.user.id;

    // 3. Register User B
    const userBReg = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Bob Normal', email: userBEmail, password }
    });
    assert.strictEqual(userBReg.status, 201);
    userBToken = userBReg.data.token;
    userBId = userBReg.data.user.id;
  });

  // TEST 1: Vibe Pin Live Sync (Create & Delete)
  await t.test('TEST 1: Vibe Pin Live Sync (User creates pin -> Admin sees it; User deletes -> Admin sees removal)', async () => {
    // Check initial state: 0 pins
    const inspect1 = await request(`/api/admin/users/${userAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(inspect1.status, 200);
    assert.strictEqual(inspect1.data.stats.vibe_pins_count, 0);
    assert.strictEqual(inspect1.data.vibes.length, 0);

    // User A creates pin
    const createPinRes = await request('/api/vibes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        name: 'Live Sync Sunset Spot',
        mood: 'Musical',
        lat: 28.5500,
        lon: 77.1900,
        budget: 'medium',
        note: 'Live sync test note'
      }
    });
    assert.strictEqual(createPinRes.status, 201);
    pinId = createPinRes.data.id;
    assert.ok(pinId, 'Pin ID created');

    // Admin inspects User A: pin is immediately visible
    const inspect2 = await request(`/api/admin/users/${userAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(inspect2.status, 200);
    assert.strictEqual(inspect2.data.stats.vibe_pins_count, 1);
    assert.strictEqual(inspect2.data.vibes.length, 1);
    assert.strictEqual(inspect2.data.vibes[0].name, 'Live Sync Sunset Spot');
    assert.strictEqual(inspect2.data.vibes[0].mood, 'Musical');

    // User A deletes pin
    const delPinRes = await request(`/api/vibes/${pinId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.strictEqual(delPinRes.status, 200);

    // Admin inspects User A: pin is removed
    const inspect3 = await request(`/api/admin/users/${userAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(inspect3.status, 200);
    assert.strictEqual(inspect3.data.stats.vibe_pins_count, 0);
    assert.strictEqual(inspect3.data.vibes.length, 0);
  });

  // TEST 2: Profile Update Live Sync
  await t.test('TEST 2: Profile Update Live Sync (User changes name -> Admin sees new name)', async () => {
    // User A updates profile name
    const updateProfileRes = await request('/api/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: { name: 'Alice Renamed Master' }
    });
    assert.strictEqual(updateProfileRes.status, 200);

    // Admin inspects User A: new name reflected
    const inspect = await request(`/api/admin/users/${userAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(inspect.status, 200);
    assert.strictEqual(inspect.data.user.name, 'Alice Renamed Master');
  });

  // TEST 3: Travel Board & Items Live Sync (Create, Add Item, Delete)
  await t.test('TEST 3: Travel Board & Items Live Sync', async () => {
    // User A creates travel board
    const createBoardRes = await request('/api/boards', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: { name: 'Monsoon Acoustic Board', description: 'Rainy vibes' }
    });
    assert.strictEqual(createBoardRes.status, 201);
    boardId = createBoardRes.data.board?.id || createBoardRes.data.id;

    // User A creates pin & adds item to board
    const pinRes = await request('/api/vibes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: { name: 'Lake Stop', mood: 'Calm', lat: 28.54, lon: 77.18 }
    });
    const spotId = pinRes.data.id;

    const addItemRes = await request(`/api/boards/${boardId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: { vibeId: spotId, title: 'Lake Haven Stop', note: 'Calm water' }
    });
    assert.strictEqual(addItemRes.status, 201);

    // Admin inspects User A: board with items is live
    const inspect1 = await request(`/api/admin/users/${userAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(inspect1.status, 200);
    assert.strictEqual(inspect1.data.stats.boards_count, 1);
    assert.strictEqual(inspect1.data.boards.length, 1);
    assert.strictEqual(inspect1.data.boards[0].name, 'Monsoon Acoustic Board');
    assert.strictEqual(inspect1.data.boards[0].items.length, 1);
    assert.strictEqual(inspect1.data.boards[0].items[0].title, 'Lake Haven Stop');

    // User A deletes board
    const delBoardRes = await request(`/api/boards/${boardId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.strictEqual(delBoardRes.status, 200);

    // Admin inspects User A: board count drops to 0
    const inspect2 = await request(`/api/admin/users/${userAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(inspect2.status, 200);
    assert.strictEqual(inspect2.data.stats.boards_count, 0);
    assert.strictEqual(inspect2.data.boards.length, 0);
  });

  // TEST 4: User Preferences Live Sync
  await t.test('TEST 4: User Preferences Live Sync', async () => {
    // User A updates preferences
    const prefRes = await request('/api/preferences', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        theme: 'dark',
        defaultMood: 'Melancholy',
        routeMode: 'bicycling',
        budget: 'high',
        preferScenic: true
      }
    });
    assert.strictEqual(prefRes.status, 200);

    // Admin inspects User A: updated preferences reflected
    const inspect = await request(`/api/admin/users/${userAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(inspect.status, 200);
    assert.ok(inspect.data.preferences);
    assert.strictEqual(inspect.data.preferences.default_mood, 'Melancholy');
    assert.strictEqual(inspect.data.preferences.route_mode, 'bicycling');
    assert.strictEqual(inspect.data.preferences.budget, 'high');
  });

  // TEST 5: Activity Trail Live Sync
  await t.test('TEST 5: Activity Trail Live Sync', async () => {
    const inspect = await request(`/api/admin/users/${userAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(inspect.status, 200);
    assert.ok(inspect.data.activity_trail.length >= 3, 'Multiple audit events recorded for User A');
    assert.ok(inspect.data.stats.activity_events_count >= 3);
  });

  // TEST 6: Multi-User Isolation & Non-Admin Rejection
  await t.test('TEST 6: Security and Non-Admin Rejection', async () => {
    // Normal User B receives 403 Forbidden
    const unauthInspect = await request(`/api/admin/users/${userAId}`, {
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    assert.strictEqual(unauthInspect.status, 403, 'Explorer receives 403 Forbidden');
  });

  server.close();
});
