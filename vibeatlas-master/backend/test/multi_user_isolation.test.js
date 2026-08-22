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

test('Multi-User Isolation and Complete Relational Ownership Test', async (t) => {
  // Ensure database migrations are run
  await runMigrations(pool);

  // Start temporary test server
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });

  const rand = Math.random().toString(36).slice(2, 8);
  const userAEmail = `usera_${rand}@vibeatlas.test`;
  const userBEmail = `userb_${rand}@vibeatlas.test`;
  const password = 'Password123!';

  let userAToken = '';
  let userBToken = '';
  let userAPin1Id;
  let userAPin2Id;
  let userABoardId;
  let userABoardItemId;
  let userBPinId;
  let userBBoardId;

  await t.test('TEST A: Register & Login User A, create resources, logout (Normal Case Part 1)', async () => {
    // 1. Register User A
    const regRes = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'User Alpha', email: userAEmail, password }
    });
    assert.strictEqual(regRes.status, 201, 'User A registered');
    assert.ok(regRes.data.token, 'Token received for User A');
    userAToken = regRes.data.token;

    // 2. Create India Gate (Calm/Happy) for User A
    const pin1Res = await request('/api/vibes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        name: 'India Gate',
        lat: 28.6129,
        lon: 77.2295,
        mood: 'Calm',
        moodTags: ['calm', 'heritage'],
        note: 'Peaceful evening walk at India Gate for User A',
        budget: 'free'
      }
    });
    assert.strictEqual(pin1Res.status, 201, 'User A Pin 1 created');
    userAPin1Id = pin1Res.data.id;
    assert.ok(userAPin1Id, 'Pin 1 ID generated');
    assert.strictEqual(pin1Res.data.name, 'India Gate');
    assert.strictEqual(pin1Res.data.mood, 'Calm');

    const pin2Res = await request('/api/vibes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        name: 'User A Coffee Corner',
        lat: 28.6300,
        lon: 77.2100,
        mood: 'Excited',
        moodTags: ['energetic', 'coffee'],
        note: 'Best espresso',
        budget: 'medium'
      }
    });
    assert.strictEqual(pin2Res.status, 201, 'User A Pin 2 created');
    userAPin2Id = pin2Res.data.id;

    // 3. Create 1 Board for User A
    const boardRes = await request('/api/boards', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        name: 'User A Weekend Escapes',
        description: 'Private collection of peaceful weekend spots'
      }
    });
    assert.strictEqual(boardRes.status, 201, 'User A Board created');
    userABoardId = boardRes.data.board.id;
    assert.ok(userABoardId, 'Board ID generated');

    // 4. Add Pin to Board for User A
    const itemRes = await request(`/api/boards/${userABoardId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        vibeId: userAPin1Id,
        title: 'India Gate Spot',
        note: 'Must visit on Sundays'
      }
    });
    assert.strictEqual(itemRes.status, 201, 'User A Board Item added');
    userABoardItemId = itemRes.data.item.id;

    // 5. Save Place (Home) for User A
    const savePlaceRes = await request('/api/saved-places', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        slot: 'home',
        label: 'User A Home',
        lat: 28.6100,
        lon: 77.2300,
        address: 'Delhi Central'
      }
    });
    assert.strictEqual(savePlaceRes.status, 201, 'User A saved place created');

    // 6. Set Preferences for User A
    const prefRes = await request('/api/preferences', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        theme: 'calm',
        default_mood: 'Calm',
        route_mode: 'cycling',
        budget: 'free',
        prefer_scenic: true
      }
    });
    assert.strictEqual(prefRes.status, 200, 'User A preferences saved');

    // 7. Verify User A decision/change history
    const historyRes = await request('/api/vibes/history', {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.strictEqual(historyRes.status, 200);
    assert.ok(historyRes.data.history.length >= 2, 'User A history records generated');
    assert.strictEqual(historyRes.data.history[0].action, 'CREATED');

    // 8. Logout User A
    const logoutRes = await request('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.strictEqual(logoutRes.status, 200, 'User A logged out');
  });

  await t.test('TEST B: Register & Login User B, verify User A data is NOT visible, create User B data (Normal Case Part 2)', async () => {
    // 1. Register User B
    const regRes = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'User Beta', email: userBEmail, password }
    });
    assert.strictEqual(regRes.status, 201, 'User B registered');
    userBToken = regRes.data.token;

    // 2. Verify User B sees 0 pins (User A pins MUST NOT appear)
    const vibesRes = await request('/api/vibes', {
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    assert.strictEqual(vibesRes.status, 200);
    assert.strictEqual(vibesRes.data.length, 0, 'User B must see ZERO pins from User A');

    // 3. Verify User B sees 0 boards (User A boards MUST NOT appear)
    const boardsRes = await request('/api/boards', {
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    assert.strictEqual(boardsRes.status, 200);
    assert.strictEqual(boardsRes.data.boards.length, 0, 'User B must see ZERO boards from User A');

    // 4. Verify User B sees 0 saved places
    const placesRes = await request('/api/saved-places', {
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    assert.strictEqual(placesRes.status, 200);
    assert.strictEqual(placesRes.data.places.length, 0, 'User B must see ZERO saved places from User A');

    // 5. Verify User B preferences are fresh defaults (not User A's custom preferences)
    const prefRes = await request('/api/preferences', {
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    assert.strictEqual(prefRes.status, 200);
    assert.strictEqual(prefRes.data.preferences.route_mode, 'walking', 'User B should have default route_mode, not User A cycling');

    // 6. User B creates pin at the SAME PHYSICAL LOCATION (India Gate) but with Melancholy/Sad mood
    const bPinRes = await request('/api/vibes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userBToken}` },
      body: {
        name: 'India Gate',
        lat: 28.6129,
        lon: 77.2295,
        mood: 'Melancholy',
        moodTags: ['melancholy', 'rain'],
        note: 'Gloomy memories at India Gate for User B'
      }
    });
    assert.strictEqual(bPinRes.status, 201, 'User B pin created');
    userBPinId = bPinRes.data.id;
    assert.strictEqual(bPinRes.data.name, 'India Gate');
    assert.strictEqual(bPinRes.data.mood, 'Melancholy');

    // 7. Create User B's own Board
    const bBoardRes = await request('/api/boards', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userBToken}` },
      body: {
        name: 'User B Night Vibes',
        description: 'Night spots only'
      }
    });
    assert.strictEqual(bBoardRes.status, 201, 'User B board created');
    userBBoardId = bBoardRes.data.board.id;

    // 8. Add item to User B board
    const bItemRes = await request(`/api/boards/${userBBoardId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userBToken}` },
      body: {
        vibeId: userBPinId,
        title: 'Melancholy India Gate'
      }
    });
    assert.strictEqual(bItemRes.status, 201, 'User B board item created');

    // 9. Logout User B
    await request('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userBToken}` }
    });
  });

  await t.test('TEST C: Login User A again, verify User A sees original Calm pin and NO User B Melancholy pin', async () => {
    // 1. Login User A again
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: { email: userAEmail, password }
    });
    assert.strictEqual(loginRes.status, 200, 'User A logged in again');
    userAToken = loginRes.data.token;

    // 2. Verify User A sees exactly their 2 pins, including India Gate -> Calm, and NOT User B's pin
    const vibesRes = await request('/api/vibes', {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.strictEqual(vibesRes.status, 200);
    const pinIds = vibesRes.data.map((p) => Number(p.id));
    assert.strictEqual(vibesRes.data.length, 2, 'User A sees exactly their 2 pins');
    assert.ok(pinIds.includes(Number(userAPin1Id)), 'Contains User A pin 1');
    assert.ok(pinIds.includes(Number(userAPin2Id)), 'Contains User A pin 2');
    assert.ok(!pinIds.includes(Number(userBPinId)), 'MUST NOT contain User B pin');

    const indiaGatePin = vibesRes.data.find((p) => Number(p.id) === Number(userAPin1Id));
    assert.strictEqual(indiaGatePin.name, 'India Gate');
    assert.strictEqual(indiaGatePin.mood, 'Calm', 'User A sees India Gate as Calm (Happy/Peaceful)');

    // 3. Verify User A sees their 1 Board with 1 item, and NOT User B's board
    const boardsRes = await request('/api/boards', {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.strictEqual(boardsRes.status, 200);
    assert.strictEqual(boardsRes.data.boards.length, 1, 'User A sees exactly 1 board');
    assert.strictEqual(Number(boardsRes.data.boards[0].id), Number(userABoardId), 'User A board ID matches');
    assert.strictEqual(boardsRes.data.boards[0].name, 'User A Weekend Escapes');

    // 4. Verify User A board details and items
    const boardDetailRes = await request(`/api/boards/${userABoardId}`, {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.strictEqual(boardDetailRes.status, 200);
    assert.strictEqual(boardDetailRes.data.items.length, 1);
    assert.strictEqual(boardDetailRes.data.items[0].title, 'India Gate Spot');
  });

  await t.test('TEST D: Realistic Exception Case (User B tries to update or delete User A pin -> 403 Forbidden)', async () => {
    // Login User B to get a fresh active token
    const loginB = await request('/api/auth/login', {
      method: 'POST',
      body: { email: userBEmail, password }
    });
    userBToken = loginB.data.token;

    // 1. User B tries to PUT / update User A's pin -> MUST return 403 Forbidden
    const updatePinRes = await request(`/api/vibes/${userAPin1Id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userBToken}` },
      body: { name: 'Defaced India Gate', mood: 'Melancholy' }
    });
    assert.strictEqual(updatePinRes.status, 403, 'User B must be rejected with 403 Forbidden when updating User A pin');

    // 2. User B tries to DELETE User A's pin -> MUST return 403 Forbidden
    const deletePinRes = await request(`/api/vibes/${userAPin1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    assert.strictEqual(deletePinRes.status, 403, 'User B must be rejected with 403 Forbidden when deleting User A pin');

    // 3. User B tries to GET User A's board -> 404
    const getBoardRes = await request(`/api/boards/${userABoardId}`, {
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    assert.strictEqual(getBoardRes.status, 404, 'User B must be rejected when fetching User A board');

    // 4. User B tries to PUT / rename User A's board -> 404
    const updateBoardRes = await request(`/api/boards/${userABoardId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userBToken}` },
      body: { name: 'Hacked by B' }
    });
    assert.strictEqual(updateBoardRes.status, 404, 'User B must be rejected when modifying User A board');

    // 5. Verify User A's pin is completely untouched in database
    const verifyPin = await pool.query('SELECT * FROM vibes WHERE id = $1', [userAPin1Id]);
    assert.strictEqual(verifyPin.rows[0].name, 'India Gate', 'User A pin name unchanged');
    assert.strictEqual(verifyPin.rows[0].mood, 'Calm', 'User A pin mood unchanged');
  });

  await t.test('TEST E: Ownership Spoofing Protection (User A submits User B ID in body -> backend ignores and stamps User A)', async () => {
    // Get User B's actual ID from database
    const userBRow = await pool.query('SELECT id FROM users WHERE email = $1', [userBEmail]);
    const userBActualId = userBRow.rows[0].id;

    // User A submits a pin explicitly spoofing user_id / created_by = User B
    const spoofRes = await request('/api/vibes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        name: 'Spoofed Ownership Spot',
        lat: 28.6500,
        lon: 77.2400,
        mood: 'Excited',
        note: 'Attempting to inject User B ownership',
        created_by: userBActualId,
        user_id: userBActualId,
        owner_id: userBActualId
      }
    });
    assert.strictEqual(spoofRes.status, 201, 'Pin created successfully');
    const spoofedPinId = spoofRes.data.id;

    // Verify in PostgreSQL database directly that the record belongs to User A, NOT User B
    const dbCheck = await pool.query('SELECT id, user_id, created_by, is_demo FROM vibes WHERE id = $1', [spoofedPinId]);
    assert.strictEqual(dbCheck.rowCount, 1);
    const pinRecord = dbCheck.rows[0];

    const userARow = await pool.query('SELECT id FROM users WHERE email = $1', [userAEmail]);
    const userAActualId = userARow.rows[0].id;

    assert.strictEqual(String(pinRecord.user_id), String(userAActualId), 'user_id MUST belong to User A');
    assert.strictEqual(String(pinRecord.created_by), String(userAActualId), 'created_by MUST belong to User A');
    assert.notStrictEqual(String(pinRecord.user_id), String(userBActualId), 'user_id MUST NOT be spoofed to User B');
    assert.strictEqual(pinRecord.is_demo, false, 'is_demo must be false');

    // Login as User B and verify User B cannot see the spoofed pin
    const userBVibes = await request('/api/vibes', {
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    const userBPinIds = userBVibes.data.map((p) => Number(p.id));
    assert.ok(!userBPinIds.includes(Number(spoofedPinId)), 'User B MUST NOT see User A spoofed pin');
  });

  // Teardown test server
  await new Promise((resolve) => server.close(resolve));
});
