'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startAll, setupOwner, login, addUser, OWNER } = require('./helpers');

test('security headers on every kind of response', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  await setupOwner(ctx);
  for (const p of ['/login', '/health', '/shared/tdc.css', '/nope', '/api/me']) {
    const r = await ctx.req('GET', p);
    assert.match(r.headers['content-security-policy'] || '', /default-src 'self'/, p);
    assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/, p);
    assert.equal(r.headers['x-content-type-options'], 'nosniff', p);
    assert.equal(r.headers['x-frame-options'], 'DENY', p);
    assert.equal(r.headers['referrer-policy'], 'same-origin', p);
    assert.match(r.headers['permissions-policy'], /microphone=\(self\)/, p);
  }
});

test('writes need Origin from this site (login, settings, logout)', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const cookie = await setupOwner(ctx);
  const body = new URLSearchParams({ username: OWNER.username, password: OWNER.password }).toString();
  const type = { 'content-type': 'application/x-www-form-urlencoded' };
  assert.equal((await ctx.req('POST', '/login', { headers: type, body })).status, 403);
  assert.equal((await ctx.req('POST', '/login', { headers: { ...type, origin: 'http://evil.example' }, body })).status, 403);
  assert.equal((await ctx.req('POST', '/login', { headers: { ...type, origin: 'null' }, body })).status, 403);
  const add = new URLSearchParams({ username: 'sneaky', name: 'S', password: 'aaaaaaaaaaaa', roles: 'owner' }).toString();
  assert.equal((await ctx.req('POST', '/settings/staff/add', { cookie, headers: { ...type, origin: 'http://evil.example' }, body: add })).status, 403);
  assert.equal(ctx.app.users.get('sneaky'), null);
});

test('PUT/DELETE also need Origin; odd methods are refused', async (t) => {
  const ctx = await startAll();
  t.after(() => ctx.close());
  const cookie = await setupOwner(ctx);
  assert.equal((await ctx.req('DELETE', '/m/hello/api/time', { cookie })).status, 403);
  assert.equal((await ctx.req('TRACE', '/', { cookie })).status, 405);
});

test('Settings: only owner and admin', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const owner = await setupOwner(ctx);
  for (const role of ['doctor', 'hygienist', 'assistant', 'front']) {
    await addUser(ctx, owner, { username: `u${role}`, roles: [role] });
    const { cookie } = await login(ctx, `u${role}`, 'staff-password-1');
    assert.equal((await ctx.req('GET', '/settings/staff', { cookie })).status, 403, role);
    assert.equal((await ctx.post('/settings/staff/add', { username: 'x9', name: 'x', password: 'aaaaaaaaaaaa', roles: 'owner' }, { cookie })).status, 403, role);
  }
  await addUser(ctx, owner, { username: 'adm', roles: ['admin'] });
  const { cookie: adm } = await login(ctx, 'adm', 'staff-password-1');
  assert.equal((await ctx.req('GET', '/settings/staff', { cookie: adm })).status, 200);
  assert.equal(ctx.app.users.get('x9'), null);
});

test('admins cannot make owners or change owner accounts', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const owner = await setupOwner(ctx);
  await addUser(ctx, owner, { username: 'adm', roles: ['admin'] });
  const { cookie: adm } = await login(ctx, 'adm', 'staff-password-1');

  await addUser(ctx, adm, { username: 'newboss', roles: ['owner', 'front'] });
  assert.deepEqual(ctx.app.users.get('newboss').roles, ['front']);

  await ctx.post('/settings/staff/adm', { name: 'adm', roles: 'owner' }, { cookie: adm });
  assert.deepEqual(ctx.app.users.get('adm').roles, ['admin'], 'admin cannot promote self... roles filtered');

  await ctx.post(`/settings/staff/${OWNER.username}/password`, { password: 'taken-over-123' }, { cookie: adm });
  assert.equal((await login(ctx, OWNER.username, 'taken-over-123')).cookie, null);
  await ctx.post(`/settings/staff/${OWNER.username}/delete`, {}, { cookie: adm });
  assert.ok(ctx.app.users.get(OWNER.username));
});

test('there is always at least one owner; you cannot delete or turn off yourself', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const owner = await setupOwner(ctx);
  const r1 = await ctx.post(`/settings/staff/${OWNER.username}`, { name: OWNER.name, roles: 'admin' }, { cookie: owner });
  assert.equal(r1.status, 303);
  assert.deepEqual(ctx.app.users.get(OWNER.username).roles, ['owner']);
  await ctx.post(`/settings/staff/${OWNER.username}`, { name: OWNER.name, roles: 'owner', disabled: '1' }, { cookie: owner });
  assert.equal(ctx.app.users.get(OWNER.username).disabled, false);
  await ctx.post(`/settings/staff/${OWNER.username}/delete`, {}, { cookie: owner });
  assert.ok(ctx.app.users.get(OWNER.username));

  // With a second owner, the first can step down
  await addUser(ctx, owner, { username: 'owner2', roles: ['owner'] });
  await ctx.post(`/settings/staff/${OWNER.username}`, { name: OWNER.name, roles: 'doctor' }, { cookie: owner });
  assert.deepEqual(ctx.app.users.get(OWNER.username).roles, ['doctor']);
});

test('module settings: design stage requires https for internet addresses; new secret is shown once', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const owner = await setupOwner(ctx);
  await ctx.post('/settings/modules/add', { id: 'daysheet', name: 'Daysheet', baseUrl: 'http://daysheet-dev.example.com' }, { cookie: owner });
  assert.equal(ctx.app.config.module('daysheet'), null);
  await ctx.post('/settings/modules/add', { id: 'daysheet', name: 'Daysheet', baseUrl: 'https://daysheet-dev.example.com/some/path' }, { cookie: owner });
  assert.equal(ctx.app.config.module('daysheet'), null, 'address must be just the site');

  await ctx.post('/settings/modules/add', { id: 'daysheet', name: 'Daysheet', baseUrl: 'https://daysheet-dev.example.com' }, { cookie: owner });
  const m = ctx.app.config.module('daysheet');
  assert.match(m.secret, /^[0-9a-f]{64}$/);
  const page1 = await ctx.req('GET', '/settings/modules', { cookie: owner });
  assert.ok(page1.text.includes(m.secret), 'shown right after creating');
  const page2 = await ctx.req('GET', '/settings/modules', { cookie: owner });
  assert.ok(!page2.text.includes(m.secret), 'not shown again');

  await ctx.post('/settings/modules/add', { id: 'api', baseUrl: 'https://x.example.com' }, { cookie: owner });
  assert.equal(ctx.app.config.module('api'), null, 'reserved id');
});

test('static files cannot escape the public folder', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  await setupOwner(ctx);
  for (const p of ['/shared/..%2f..%2fpackage.json', '/shared/../server.js', '/js/%2e%2e%2fserver.js', '/shared/.env']) {
    const r = await ctx.req('GET', p);
    assert.notEqual(r.status, 200, p);
    assert.ok(!r.text.includes('createApp'), p);
  }
  const sh = await ctx.req('GET', '/shared/shell.js');
  assert.equal(sh.status, 200);
  assert.equal(sh.headers['cache-control'], 'no-cache', 'shared CSS/JS re-check after every update');
  assert.ok(sh.headers.etag);
  assert.equal((await ctx.req('GET', '/shared/shell.js', { headers: { 'if-none-match': sh.headers.etag } })).status, 304);
  assert.equal((await ctx.req('GET', '/shared/tdc.css')).headers['cache-control'], 'no-cache');
  // Home-screen icon and manifest (DESIGN.md §10)
  const man = await ctx.req('GET', '/manifest.webmanifest');
  assert.equal(man.status, 200);
  assert.equal(man.headers['content-type'], 'application/manifest+json');
  assert.equal(man.json.short_name, 'TDC Office');
  assert.equal((await ctx.req('GET', '/apple-touch-icon.png')).headers['content-type'], 'image/png');
  assert.equal((await ctx.req('GET', '/shared/tdc-shared.js')).status, 200);
  const font = await ctx.req('GET', '/shared/fonts/figtree.woff2');
  assert.equal(font.status, 200);
  assert.equal(font.headers['content-type'], 'font/woff2');
  for (const p of ['/shared/fonts/.hidden', '/shared/fonts/x/y.woff2', '/shared/fonts/..%2f..%2f..%2fpackage.json']) assert.notEqual((await ctx.req('GET', p)).status, 200, p);
});

test('trusting a proxy (Hostinger): https detected, Origin checked against https, client IP from the proxy', async () => {
  const http = require('node:http');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { createApp } = require('../lib/app');
  const { request } = require('./helpers');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdc-proxy-'));
  const app = createApp({ stage: 'design', dataDir, trustProxy: true, publicUrl: 'https://office-dev.example.com', setupCode: 'c', log: () => {} });
  const server = http.createServer(app.handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    const r = await request(port, 'GET', '/health', { headers: { 'x-forwarded-proto': 'https' } });
    assert.match(r.headers['strict-transport-security'], /max-age=/);
    const body = 'code=c&name=R&username=rr&password=aaaaaaaaaaaa&password2=aaaaaaaaaaaa';
    const type = { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-proto': 'https' };
    assert.equal((await request(port, 'POST', '/setup', { headers: { ...type, origin: `http://127.0.0.1:${port}` }, body })).status, 403);
    assert.equal((await request(port, 'POST', '/setup', { headers: { ...type, origin: 'https://office-dev.example.com' }, body })).status, 303);
  } finally {
    app.close(); server.close(); fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
