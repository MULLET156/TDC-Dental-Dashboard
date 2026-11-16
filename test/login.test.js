'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startAll, setupOwner, login, addUser, cookieFrom, OWNER, SETUP_CODE } = require('./helpers');
const { hashSecret, verifySecret } = require('../lib/users');

test('passwords are hashed with scrypt and checked correctly', async () => {
  const h = await hashSecret('correct horse battery');
  assert.match(h, /^scrypt\$16384\$8\$1\$/);
  assert.ok(!h.includes('correct horse'));
  assert.equal(await verifySecret('correct horse battery', h), true);
  assert.equal(await verifySecret('correct horse batterz', h), false);
  assert.notEqual(await hashSecret('same'), await hashSecret('same'), 'salted');
});

test('first run: setup page, setup code, owner account', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());

  const home = await ctx.req('GET', '/', { headers: { 'sec-fetch-mode': 'navigate' } });
  assert.equal(home.status, 302);
  assert.equal(home.headers.location, '/setup');

  const wrong = await ctx.post('/setup', { code: 'nope', name: 'X', username: 'x1', password: 'aaaaaaaaaaaa', password2: 'aaaaaaaaaaaa' });
  assert.equal(wrong.status, 400);
  assert.match(wrong.text, /setup code is not right/);
  assert.equal(ctx.app.users.count(), 0);

  const mismatch = await ctx.post('/setup', { code: SETUP_CODE, name: 'X', username: 'x1', password: 'aaaaaaaaaaaa', password2: 'bbbbbbbbbbbb' });
  assert.match(mismatch.text, /different/);

  const cookie = await setupOwner(ctx);
  assert.ok(cookie, 'logged in after setup');
  const u = ctx.app.users.get(OWNER.username);
  assert.deepEqual(u.roles, ['owner']);
  assert.ok(u.pinHash);

  // users.json holds hashes only
  const raw = fs.readFileSync(path.join(ctx.dataDir, 'users.json'), 'utf8');
  assert.ok(!raw.includes(OWNER.password));
  assert.ok(!raw.includes(OWNER.pin));

  // setup is closed once an account exists
  const again = await ctx.req('GET', '/setup');
  assert.equal(again.status, 302);
  assert.equal(again.headers.location, '/login');
  const again2 = await ctx.post('/setup', { code: SETUP_CODE, name: 'Evil', username: 'evil', password: 'aaaaaaaaaaaa', password2: 'aaaaaaaaaaaa' });
  assert.equal(again2.status, 302);
  assert.equal(ctx.app.users.get('evil'), null);
});

test('login: right and wrong passwords, cookie flags, logout', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  await setupOwner(ctx);

  const bad = await login(ctx, OWNER.username, 'wrong-password');
  assert.equal(bad.res.status, 401);
  assert.equal(bad.cookie, null);
  assert.match(bad.res.text, /Login name or password is wrong/);

  const unknown = await login(ctx, 'nobody', 'whatever-password');
  assert.match(unknown.res.text, /Login name or password is wrong/, 'same message for unknown users');

  const good = await login(ctx, OWNER.username, OWNER.password);
  assert.equal(good.res.status, 303);
  const setCookie = [].concat(good.res.headers['set-cookie'])[0];
  assert.match(setCookie, /^__Host-tdc_sid=[A-Za-z0-9_-]{40,};/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Path=\//);

  const me = await ctx.req('GET', '/api/me', { cookie: good.cookie });
  assert.deepEqual(me.json, { user: OWNER.username, name: OWNER.name, roles: ['owner'] });

  const out = await ctx.post('/logout', {}, { cookie: good.cookie });
  assert.equal(out.status, 303);
  assert.match([].concat(out.headers['set-cookie'])[0], /Max-Age=0/);
  const after = await ctx.req('GET', '/api/me', { cookie: good.cookie });
  assert.equal(after.status, 401);
});

test('login: "next" only goes to pages on this site', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  await setupOwner(ctx);
  for (const [next, want] of [['/m/hello/echo', '/m/hello/echo'], ['https://evil.example', '/'], ['//evil.example', '/'], ['/\\evil.example', '/']]) {
    const res = await ctx.post('/login', { username: OWNER.username, password: OWNER.password, next });
    assert.equal(res.headers.location, want, next);
  }
});

test('login: locks out after 5 wrong passwords, owner can clear it', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const ownerCookie = await setupOwner(ctx);
  await addUser(ctx, ownerCookie, { username: 'fran', roles: ['front'], password: 'front-password-1' });

  for (let i = 0; i < 5; i++) await login(ctx, 'fran', 'not-the-password');
  const blocked = await login(ctx, 'fran', 'front-password-1');
  assert.equal(blocked.res.status, 429);
  assert.equal(blocked.cookie, null, 'right password is refused while locked out');
  assert.match(blocked.res.text, /Too many wrong tries/);

  // 15 minutes later it works again
  ctx.clock.t += 16 * 60000;
  const later = await login(ctx, 'fran', 'front-password-1');
  assert.ok(later.cookie);

  // Lock out again, then the owner clears it
  for (let i = 0; i < 5; i++) await login(ctx, 'fran', 'not-the-password');
  assert.equal((await login(ctx, 'fran', 'front-password-1')).res.status, 429);
  const { cookie: owner2 } = await login(ctx, OWNER.username, OWNER.password); // the first session quick-locked meanwhile
  await ctx.post('/settings/staff/fran/unblock', {}, { cookie: owner2 });
  assert.ok((await login(ctx, 'fran', 'front-password-1')).cookie);
});

test('login: one address trying many accounts is blocked', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  await setupOwner(ctx);
  for (let i = 0; i < 20; i++) await login(ctx, `guess${i}`, 'whatever-password');
  const r = await login(ctx, OWNER.username, OWNER.password);
  assert.equal(r.res.status, 429);
});

test('turned-off accounts cannot log in and are logged out', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const ownerCookie = await setupOwner(ctx);
  await addUser(ctx, ownerCookie, { username: 'dana', roles: ['doctor'] });
  const { cookie } = await login(ctx, 'dana', 'staff-password-1');
  assert.equal((await ctx.req('GET', '/api/me', { cookie })).status, 200);

  await ctx.post('/settings/staff/dana', { name: 'dana', roles: 'doctor', disabled: '1' }, { cookie: ownerCookie });
  assert.equal((await ctx.req('GET', '/api/me', { cookie })).status, 401);
  assert.equal((await login(ctx, 'dana', 'staff-password-1')).cookie, null);
});

test('my account: change password needs the current one and logs out other sessions', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const c1 = await setupOwner(ctx);
  const { cookie: c2 } = await login(ctx, OWNER.username, OWNER.password);

  await ctx.post('/account/password', { current: 'wrong', password: 'brand-new-password', password2: 'brand-new-password' }, { cookie: c1 });
  assert.equal((await login(ctx, OWNER.username, 'brand-new-password')).cookie, null);

  await ctx.post('/account/password', { current: OWNER.password, password: 'brand-new-password', password2: 'brand-new-password' }, { cookie: c1 });
  assert.equal((await ctx.req('GET', '/api/me', { cookie: c1 })).status, 200, 'this session stays');
  assert.equal((await ctx.req('GET', '/api/me', { cookie: c2 })).status, 401, 'other session ended');
  assert.ok((await login(ctx, OWNER.username, 'brand-new-password')).cookie);
});

test('a new login replaces the old session id (no session fixation)', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const c1 = await setupOwner(ctx);
  const { cookie: c2 } = await (async () => {
    const res = await ctx.post('/login', { username: OWNER.username, password: OWNER.password }, { cookie: c1 });
    return { cookie: cookieFrom(res) };
  })();
  assert.notEqual(c1, c2);
  assert.equal((await ctx.req('GET', '/api/me', { cookie: c1 })).status, 401);
});
