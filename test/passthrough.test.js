'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const { startAll, setupOwner, login, addUser } = require('./helpers');
const { verifyTdcRequest } = require('../examples/hello-module/tdc-verify');

test('pass-through strips browser X-TDC-* headers and cookies, and signs the request', async (t) => {
  const ctx = await startAll();
  t.after(() => ctx.close());
  const cookie = await setupOwner(ctx);

  const r = await ctx.req('GET', '/m/hello/api/headers?q=1', {
    cookie: `${cookie}; other=secret-cookie`,
    headers: {
      'x-tdc-user': 'attacker', 'x-tdc-roles': 'owner', 'x-tdc-sig': 'f'.repeat(64), 'x-tdc-time': '1', 'X-Tdc-Base': '/m/evil',
      'x-tdc-extra': 'nope', authorization: 'Bearer stolen', 'x-forwarded-for': '6.6.6.6', 'x-custom': 'dropped',
      'accept-language': 'en-US',
    },
  });
  assert.equal(r.status, 200);
  const got = r.json;
  assert.equal(got.url, '/api/headers?q=1', 'prefix removed, query kept');
  const h = got.headers;
  assert.equal(h['x-tdc-user'], 'owner1');
  assert.equal(h['x-tdc-roles'], 'owner');
  assert.equal(h['x-tdc-base'], '/m/hello');
  assert.equal(h['x-tdc-extra'], undefined);
  assert.equal(h.cookie, undefined, 'Dashboard login cookie never reaches modules');
  assert.equal(h.authorization, undefined);
  assert.equal(h['x-custom'], undefined);
  assert.equal(h['x-forwarded-for'], '127.0.0.1', 'browser-supplied forwarding header replaced');
  assert.equal(h['accept-language'], 'en-US');
  // The module's own check accepts it
  assert.ok(verifyTdcRequest(ctx.helloSecret, { method: 'GET', url: got.url, headers: h }));
});

test('/m/<id> without a slash redirects to /m/<id>/', async (t) => {
  const ctx = await startAll();
  t.after(() => ctx.close());
  const cookie = await setupOwner(ctx);
  const r = await ctx.req('GET', '/m/hello?x=1', { cookie });
  assert.equal(r.status, 302);
  assert.equal(r.headers.location, '/m/hello/?x=1');
});

test('module pages come back with the Dashboard security headers; module cookies and off-site redirects are dropped', async (t) => {
  const ctx = await startAll();
  t.after(() => ctx.close());
  const cookie = await setupOwner(ctx);
  const page = await ctx.req('GET', '/m/hello/', { cookie });
  assert.equal(page.status, 200);
  assert.match(page.text, /Hello, Olive Owner/);
  assert.match(page.text, /\/m\/hello\/echo/);
  assert.match(page.headers['content-security-policy'], /script-src 'self'/);
  assert.equal(page.headers['x-frame-options'], 'DENY');
  assert.equal(page.headers['x-content-type-options'], 'nosniff');

  const red = await ctx.req('GET', '/m/hello/redirect-me', { cookie });
  assert.equal(red.status, 302);
  assert.equal(red.headers.location, '/m/hello/echo', 'module-relative redirect gets the /m/<id> prefix');
  assert.equal(red.headers['set-cookie'], undefined);
});

test('POST form goes through (with Origin) and is refused without it', async (t) => {
  const ctx = await startAll();
  t.after(() => ctx.close());
  const cookie = await setupOwner(ctx);
  const ok = await ctx.post('/m/hello/echo', { text: 'hello from the test' }, { cookie });
  assert.equal(ok.status, 200);
  assert.match(ok.text, /You said: hello from the test/);

  const noOrigin = await ctx.req('POST', '/m/hello/echo', { cookie, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'text=x' });
  assert.equal(noOrigin.status, 403);
  const evil = await ctx.req('POST', '/m/hello/echo', { cookie, headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' }, body: 'text=x' });
  assert.equal(evil.status, 403);
  const refererOk = await ctx.req('POST', '/m/hello/echo', { cookie, headers: { 'content-type': 'application/x-www-form-urlencoded', referer: `${ctx.origin}/m/hello/echo` }, body: 'text=ref' });
  assert.equal(refererOk.status, 200, 'Referer from this site is accepted when Origin is missing');
});

test('large audio uploads (20 MB) pass through unchanged; over 25 MB is refused', async (t) => {
  const ctx = await startAll();
  t.after(() => ctx.close());
  const cookie = await setupOwner(ctx);
  const audio = crypto.randomBytes(20 * 1024 * 1024);
  const r = await ctx.req('POST', '/m/hello/api/upload', { cookie, headers: { origin: ctx.origin, 'content-type': 'audio/webm' }, body: audio });
  assert.equal(r.status, 200);
  assert.equal(r.json.bytes, audio.length);
  assert.equal(r.json.sha256, crypto.createHash('sha256').update(audio).digest('hex'));
  assert.equal(r.json.type, 'audio/webm');

  const big = Buffer.alloc(26 * 1024 * 1024);
  const r2 = await ctx.req('POST', '/m/hello/api/upload', { cookie, headers: { origin: ctx.origin, 'content-type': 'audio/webm' }, body: big });
  assert.equal(r2.status, 413);
});

test('over-25 MB upload without Content-Length (chunked) is cut off', async (t) => {
  const ctx = await startAll();
  t.after(() => ctx.close());
  const cookie = await setupOwner(ctx);
  const status = await new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: ctx.port, method: 'POST', path: '/m/hello/api/upload', headers: { cookie, origin: ctx.origin, 'content-type': 'audio/webm', 'transfer-encoding': 'chunked' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve('closed'));
    const chunk = Buffer.alloc(1024 * 1024);
    let sent = 0;
    (function write() {
      while (sent < 27) { sent++; if (!req.write(chunk)) { req.once('drain', write); return; } }
      req.end();
    })();
  });
  assert.ok(status === 413 || status === 'closed', `got ${status}`);
});

test('not logged in: pages redirect to login, API calls get 401, nothing reaches the module', async (t) => {
  const ctx = await startAll();
  t.after(() => ctx.close());
  await setupOwner(ctx);
  const before = ctx.helloLogs.length;
  const nav = await ctx.req('GET', '/m/hello/echo', { headers: { 'sec-fetch-mode': 'navigate' } });
  assert.equal(nav.status, 302);
  assert.equal(nav.headers.location, '/login?next=%2Fm%2Fhello%2Fecho');
  const api = await ctx.req('GET', '/m/hello/api/time');
  assert.equal(api.status, 401);
  assert.equal(ctx.helloLogs.length, before);
});

test('module down: page shows "not responding", tile says Not responding, rest still works', async (t) => {
  const ctx = await startAll();
  t.after(() => ctx.close());
  const cookie = await setupOwner(ctx);
  // Learn the manifest first, then stop the module
  assert.equal((await ctx.req('GET', '/api/tiles', { cookie })).json.tiles.length, 2);
  ctx.helloServer.closeAllConnections();
  await new Promise((r) => ctx.helloServer.close(r));

  const page = await ctx.req('GET', '/m/hello/', { cookie, headers: { 'sec-fetch-mode': 'navigate' } });
  assert.equal(page.status, 502);
  assert.match(page.text, /not responding/i);
  const one = await ctx.req('GET', '/api/tiles/hello/greeting', { cookie });
  assert.deepEqual(one.json, { ok: false, error: 'Not responding' });
  assert.equal((await ctx.req('GET', '/', { cookie })).status, 200);
  assert.equal((await ctx.req('GET', '/api/nav', { cookie })).status, 200);

  // A module that has never answered still gets a "Not responding" card
  ctx.app.config.saveModule({ id: 'ghost', name: 'Ghost module', baseUrl: 'http://127.0.0.1:9', secret: 'b'.repeat(64) }, { isNew: true });
  const tiles = await ctx.req('GET', '/api/tiles', { cookie });
  const ghost = tiles.json.tiles.find((x) => x.module === 'ghost');
  assert.equal(ghost.down, true);
  assert.equal(ghost.title, 'Ghost module');
});

test('tiles: rendered from module JSON, hrefs prefixed, filtered by role and by Settings', async (t) => {
  const ctx = await startAll();
  t.after(() => ctx.close());
  const owner = await setupOwner(ctx);
  const tile = await ctx.req('GET', '/api/tiles/hello/greeting', { cookie: owner });
  assert.equal(tile.json.ok, true);
  assert.equal(tile.json.tile.link, '/m/hello/');
  assert.deepEqual(tile.json.tile.items.map((i) => i.href), ['/m/hello/', '/m/hello/', '/m/hello/echo']);
  assert.equal(tile.json.tile.items[0].text, 'Personal: you are Olive Owner', 'tiles are requested as the logged-in user');
  const tileLog = JSON.parse(ctx.helloLogs.filter((l) => l.includes('/tiles/greeting')).pop());
  assert.equal(tileLog.user, 'owner1');

  await addUser(ctx, owner, { username: 'hy', roles: ['hygienist'] });
  const { cookie: hy } = await login(ctx, 'hy', 'staff-password-1');
  const list = await ctx.req('GET', '/api/tiles', { cookie: hy });
  assert.deepEqual(list.json.tiles.map((x) => x.id), ['greeting'], 'owner-only tile hidden from hygienist');
  assert.equal((await ctx.req('GET', '/api/tiles/hello/owners', { cookie: hy })).status, 404);

  await ctx.post('/settings/tiles', { all: 'hello/greeting', show: '' }, { cookie: owner });
  const form = new URLSearchParams([['all', 'hello/greeting'], ['all', 'hello/owners'], ['show', 'hello/owners']]);
  await ctx.req('POST', '/settings/tiles', { cookie: owner, headers: { origin: ctx.origin, 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  assert.deepEqual(ctx.app.config.data.hiddenTiles, ['hello/greeting']);
  assert.deepEqual((await ctx.req('GET', '/api/tiles', { cookie: owner })).json.tiles.map((x) => x.id), ['owners']);
});

test('/api/nav lists modules and links for the user; settings only for owner/admin', async (t) => {
  const ctx = await startAll();
  t.after(() => ctx.close());
  const owner = await setupOwner(ctx);
  await ctx.post('/settings/links', { lab: 'https://lab.example.com', supply: '', maintenance: 'https://maint.example.com' }, { cookie: owner });
  const nav = (await ctx.req('GET', '/api/nav', { cookie: owner })).json;
  assert.equal(nav.settings, true);
  assert.equal(nav.canLock, true);
  assert.equal(nav.modules[0].id, 'hello');
  assert.deepEqual(nav.modules[0].nav.map((n) => n.href), ['/m/hello/', '/m/hello/echo', '/m/hello/owners']);
  assert.deepEqual(nav.links.map((l) => l.name), ['Lab Tracker', 'Maintenance Tracker']);

  await addUser(ctx, owner, { username: 'fd', roles: ['front'] });
  const { cookie } = await login(ctx, 'fd', 'staff-password-1');
  assert.equal((await ctx.req('GET', '/api/nav', { cookie })).json.settings, false);
});

test('the module checks roles itself (front desk gets 403 on the owners page)', async (t) => {
  const ctx = await startAll();
  t.after(() => ctx.close());
  const owner = await setupOwner(ctx);
  await addUser(ctx, owner, { username: 'fd', roles: ['front'] });
  const { cookie } = await login(ctx, 'fd', 'staff-password-1');
  assert.equal((await ctx.req('GET', '/m/hello/owners', { cookie })).status, 403);
  assert.equal((await ctx.req('GET', '/m/hello/owners', { cookie: owner })).status, 200);
});

test('unknown or hidden modules are 404; modules without a secret are not called', async (t) => {
  const ctx = await startAll();
  t.after(() => ctx.close());
  const owner = await setupOwner(ctx);
  assert.equal((await ctx.req('GET', '/m/nope/', { cookie: owner })).status, 404);
  ctx.app.config.saveModule({ id: 'hello', name: 'Hello', baseUrl: `http://127.0.0.1:${ctx.helloPort}`, enabled: false }, { isNew: false });
  assert.equal((await ctx.req('GET', '/m/hello/', { cookie: owner })).status, 404);
});

test('request logs have no query strings or bodies', async (t) => {
  const ctx = await startAll();
  t.after(() => ctx.close());
  const cookie = await setupOwner(ctx);
  await ctx.req('GET', '/m/hello/api/time?patient=Smith', { cookie });
  await ctx.post('/m/hello/echo', { text: 'Patient Smith note' }, { cookie });
  const all = ctx.logs.join('\n');
  assert.ok(!all.includes('Smith'));
  const line = JSON.parse(ctx.logs.find((l) => l.includes('/m/hello/api/time')));
  assert.deepEqual(Object.keys(line).sort(), ['method', 'ms', 'path', 'status', 'time', 'user']);
  assert.equal(line.user, 'owner1');
});
