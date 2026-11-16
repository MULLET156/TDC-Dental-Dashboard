'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startAll, setupOwner, login, addUser, OWNER } = require('./helpers');

const MIN = 60000;

test('idle timeout (default 30 minutes) logs out', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const owner = await setupOwner(ctx);
  await addUser(ctx, owner, { username: 'nopin', roles: ['front'] });
  const { cookie } = await login(ctx, 'nopin', 'staff-password-1');

  ctx.clock.t += 29 * MIN;
  assert.equal((await ctx.req('GET', '/', { cookie })).status, 200, 'still in after 29 min');
  ctx.clock.t += 29 * MIN;
  assert.equal((await ctx.req('GET', '/', { cookie })).status, 200, 'activity resets the idle timer');
  ctx.clock.t += 31 * MIN;
  const r = await ctx.req('GET', '/', { cookie, headers: { 'sec-fetch-mode': 'navigate' } });
  assert.equal(r.status, 302);
  assert.match(r.headers.location, /^\/login\?next=/);
});

test('background requests (tiles, nav) do not keep a session alive', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const owner = await setupOwner(ctx);
  await addUser(ctx, owner, { username: 'nopin', roles: ['front'] });
  const { cookie } = await login(ctx, 'nopin', 'staff-password-1');
  for (let i = 0; i < 4; i++) {
    ctx.clock.t += 10 * MIN;
    await ctx.req('GET', '/api/tiles', { cookie });
    await ctx.req('GET', '/api/nav', { cookie });
    await ctx.req('GET', '/api/session', { cookie });
  }
  assert.equal((await ctx.req('GET', '/api/me', { cookie })).status, 401);
});

test('/api/activity (sent by shell.js when someone taps or types) keeps it alive', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const owner = await setupOwner(ctx);
  await addUser(ctx, owner, { username: 'nopin', roles: ['front'] });
  const { cookie } = await login(ctx, 'nopin', 'staff-password-1');
  for (let i = 0; i < 4; i++) {
    ctx.clock.t += 20 * MIN;
    assert.equal((await ctx.post('/api/activity', {}, { cookie })).status, 204);
  }
  assert.equal((await ctx.req('GET', '/api/me', { cookie })).status, 200);
});

test('sessions end 12 hours after login even with activity', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const owner = await setupOwner(ctx);
  await addUser(ctx, owner, { username: 'nopin', roles: ['front'] });
  const { cookie } = await login(ctx, 'nopin', 'staff-password-1');
  for (let i = 0; i < 12 * 3; i++) { ctx.clock.t += 20 * MIN; await ctx.post('/api/activity', {}, { cookie }); }
  ctx.clock.t += 1 * MIN;
  assert.equal((await ctx.req('GET', '/api/me', { cookie })).status, 401);
});

test('idle time is set per role; the shortest of a user\'s roles wins', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const owner = await setupOwner(ctx);
  const form = { lockMinutes: '5' };
  for (const r of ['owner', 'admin', 'doctor', 'hygienist', 'assistant', 'front']) form[`idle_${r}`] = r === 'front' ? '10' : '60';
  const saved = await ctx.post('/settings/sessions', form, { cookie: owner });
  assert.equal(saved.status, 303);
  await addUser(ctx, owner, { username: 'mix', roles: ['doctor', 'front'] });
  const { cookie } = await login(ctx, 'mix', 'staff-password-1');
  ctx.clock.t += 11 * MIN;
  assert.equal((await ctx.req('GET', '/api/me', { cookie })).status, 401);
});

test('PIN quick lock: locks when idle, unlocks with PIN, 5 wrong PINs end the session', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  await setupOwner(ctx);
  const { cookie } = await login(ctx, OWNER.username, OWNER.password);

  ctx.clock.t += 6 * MIN; // default quick lock is 5 minutes for users with a PIN
  const nav = await ctx.req('GET', '/m/hello/', { cookie, headers: { 'sec-fetch-mode': 'navigate' } });
  assert.equal(nav.status, 302);
  assert.equal(nav.headers.location, '/lock?next=%2Fm%2Fhello%2F');
  assert.equal((await ctx.req('GET', '/api/me', { cookie })).status, 423);
  assert.equal((await ctx.req('GET', '/api/session', { cookie })).json.state, 'locked');

  const wrong = await ctx.post('/unlock', { pin: '0000', next: '/' }, { cookie });
  assert.equal(wrong.headers.location, '/lock?next=%2F');
  const right = await ctx.post('/unlock', { pin: OWNER.pin, next: '/account' }, { cookie });
  assert.equal(right.headers.location, '/account');
  assert.equal((await ctx.req('GET', '/api/me', { cookie })).status, 200);

  // Lock by hand, then 5 wrong PINs
  await ctx.post('/lock', { next: '/' }, { cookie });
  assert.equal((await ctx.req('GET', '/api/me', { cookie })).status, 423);
  for (let i = 0; i < 4; i++) await ctx.post('/unlock', { pin: '1111' }, { cookie });
  const last = await ctx.post('/unlock', { pin: '1111' }, { cookie });
  assert.match(last.text, /Too many wrong PINs/);
  assert.equal((await ctx.req('GET', '/api/me', { cookie })).status, 401);
  assert.equal((await ctx.post('/unlock', { pin: OWNER.pin }, { cookie })).headers.location, '/login');
});

test('users without a PIN are not quick-locked; "Lock" logs them out', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const owner = await setupOwner(ctx);
  await addUser(ctx, owner, { username: 'nopin', roles: ['front'] });
  const { cookie } = await login(ctx, 'nopin', 'staff-password-1');
  ctx.clock.t += 10 * MIN;
  assert.equal((await ctx.req('GET', '/api/me', { cookie })).status, 200);
  const r = await ctx.post('/lock', {}, { cookie });
  assert.equal(r.headers.location, '/login');
  assert.equal((await ctx.req('GET', '/api/me', { cookie })).status, 401);
});

test('restarting the Dashboard logs everyone out (sessions live in memory)', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const cookie = await setupOwner(ctx);
  ctx.app.sessions.map.clear();
  assert.equal((await ctx.req('GET', '/api/me', { cookie })).status, 401);
});
