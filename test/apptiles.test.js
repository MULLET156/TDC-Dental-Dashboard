'use strict';
// CONTRACT §5b: tiles from the standalone apps, fetched server to server with a
// Bearer token. A pretend Supply Room plays the app. Fake data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const { startAll, setupOwner, login, addUser } = require('./helpers');
const { cleanAppTile } = require('../lib/apptiles');

function fakeApp(token) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, auth: req.headers.authorization || '' });
    const m = req.url.match(/^\/tdc\/tiles\/([a-z-]+)$/);
    const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (!m) return send(404, {});
    if (!token) return send(404, { error: 'off' });
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'nope' });
    const origin = `http://127.0.0.1:${server.address().port}`;
    return send(200, {
      title: m[1] === 'to-order' ? 'To order' : 'Waiting to arrive',
      value: m[1] === 'to-order' ? '10' : '3',
      status: m[1] === 'to-order' ? 'alert' : 'ok',
      items: [{ text: '7 at 911', href: `${origin}/order` }, { text: 'Elsewhere', href: 'https://evil.example/x' }],
      link: `${origin}/order`,
      updated: '2026-11-16T08:00:00-08:00',
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, seen, url: `http://127.0.0.1:${server.address().port}` })));
}

async function withApp(t, { token = crypto.randomBytes(32).toString('hex'), appToken } = {}) {
  const ctx = await startAll({ hello: false });
  const app = await fakeApp(appToken === undefined ? token : appToken);
  t.after(async () => { app.server.close(); await ctx.close(); });
  const owner = await setupOwner(ctx);
  // Address set directly: the Settings form only accepts https://, and the pretend app is local.
  const l = ctx.app.config.link('supply');
  l.url = app.url;
  ctx.app.config.setLinkToken('supply', token);
  ctx.app.config.setLinkRoles('supply', ['owner', 'front']);
  return { ctx, app, owner, token };
}

test('app tiles: shown to the chosen roles, fetched with the Bearer token, links kept inside the app', async (t) => {
  const { ctx, app, owner, token } = await withApp(t);
  const list = await ctx.req('GET', '/api/tiles', { cookie: owner });
  const appTiles = list.json.tiles.filter((x) => x.app);
  assert.deepEqual(appTiles.map((x) => [x.module, x.id, x.url]), [['supply', 'to-order', '/api/apptiles/supply/to-order'], ['supply', 'waiting', '/api/apptiles/supply/waiting']]);

  const r = await ctx.req('GET', '/api/apptiles/supply/to-order', { cookie: owner });
  assert.equal(r.json.ok, true);
  assert.equal(r.json.tile.value, '10');
  assert.equal(r.json.tile.status, 'alert');
  assert.equal(r.json.tile.link, `${app.url}/order`);
  assert.deepEqual(r.json.tile.items.map((i) => i.href), [`${app.url}/order`, null], 'off-site link dropped');
  assert.equal(app.seen[0].url, '/tdc/tiles/to-order');
  assert.equal(app.seen[0].auth, `Bearer ${token}`);

  // The token never reaches a browser or the log.
  for (const p of ['/api/tiles', '/api/nav', '/api/apptiles/supply/to-order', '/settings/links']) {
    assert.ok(!(await ctx.req('GET', p, { cookie: owner })).text.includes(token), p);
  }
  assert.ok(!ctx.logs.join('\n').includes(token));
});

test('app tiles: cached for 30 seconds, so many screens don\'t flood the app', async (t) => {
  const { ctx, app, owner } = await withApp(t);
  for (let i = 0; i < 5; i++) await ctx.req('GET', '/api/apptiles/supply/waiting', { cookie: owner });
  assert.equal(app.seen.filter((s) => s.url === '/tdc/tiles/waiting').length, 1);
});

test('app tiles: roles not chosen in Settings see nothing', async (t) => {
  const { ctx, owner } = await withApp(t);
  await addUser(ctx, owner, { username: 'hy', roles: ['hygienist'] });
  const { cookie } = await login(ctx, 'hy', 'staff-password-1');
  assert.equal((await ctx.req('GET', '/api/tiles', { cookie })).json.tiles.filter((x) => x.app).length, 0);
  assert.equal((await ctx.req('GET', '/api/apptiles/supply/to-order', { cookie })).status, 404);
});

test('app tiles: wrong token or app down shows "Not responding"; Settings shows why', async (t) => {
  const { ctx, owner } = await withApp(t, { appToken: 'a'.repeat(64) });
  const r = await ctx.req('GET', '/api/apptiles/supply/to-order', { cookie: owner });
  assert.deepEqual(r.json, { ok: false, error: 'Not responding' });
  const page = await ctx.req('GET', '/settings/links', { cookie: owner });
  assert.match(page.text, /To order: Wrong token/);
});

test('app tiles: tiles turned off in the app (404) are explained in Settings', async (t) => {
  const { ctx, owner } = await withApp(t, { appToken: '' });
  assert.match((await ctx.req('GET', '/settings/links', { cookie: owner })).text, /Tiles are turned off in the app/);
});

test('Settings: make a token (shown once), paste one, turn tiles off; roles saved', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const owner = await setupOwner(ctx);
  await ctx.post('/settings/links/lab/token-new', {}, { cookie: owner });
  const tok = ctx.app.config.link('lab').token;
  assert.match(tok, /^[0-9a-f]{64}$/);
  assert.ok((await ctx.req('GET', '/settings/links', { cookie: owner })).text.includes(tok), 'shown right after');
  assert.ok(!(await ctx.req('GET', '/settings/links', { cookie: owner })).text.includes(tok), 'not again');

  await ctx.post('/settings/links/lab/token-set', { token: 'too-short' }, { cookie: owner });
  assert.equal(ctx.app.config.link('lab').token, tok, 'bad token refused');
  const pasted = 'b'.repeat(64);
  await ctx.post('/settings/links/lab/token-set', { token: pasted }, { cookie: owner });
  assert.equal(ctx.app.config.link('lab').token, pasted);
  await ctx.post('/settings/links/lab/token-clear', {}, { cookie: owner });
  assert.equal(ctx.app.config.link('lab').token, '');

  const form = new URLSearchParams([['lab', 'https://lab.example.com'], ['supply', ''], ['maintenance', ''], ['apps', 'lab'], ['apps', 'supply'], ['apps', 'maintenance'], ['roles_lab', 'owner'], ['roles_lab', 'doctor']]);
  await ctx.req('POST', '/settings/links', { cookie: owner, headers: { origin: ctx.origin, 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  assert.deepEqual(ctx.app.config.link('lab').roles, ['owner', 'doctor']);
  assert.deepEqual(ctx.app.config.link('supply').roles, []);
  assert.equal(ctx.app.config.link('lab').url, 'https://lab.example.com');

  await addUser(ctx, owner, { username: 'fd', roles: ['front'] });
  const { cookie } = await login(ctx, 'fd', 'staff-password-1');
  assert.equal((await ctx.post('/settings/links/lab/token-new', {}, { cookie })).status, 403, 'front desk cannot');
});

test('module ids cannot take the standalone app names', async (t) => {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const owner = await setupOwner(ctx);
  await ctx.post('/settings/modules/add', { id: 'lab', baseUrl: 'https://x.example.com' }, { cookie: owner });
  assert.equal(ctx.app.config.module('lab'), null);
});

test('cleanAppTile keeps counts and same-app https links only', () => {
  const t = cleanAppTile('https://lab.example.com', { title: 'Late', value: '2', status: 'weird', items: [{ text: 'a', href: 'https://lab.example.com/c/1' }, { text: 'b', href: 'javascript:alert(1)' }, { text: 'c', href: 'http://lab.example.com/x' }], link: '//evil.example' }, 'Late');
  assert.equal(t.status, 'ok');
  assert.deepEqual(t.items.map((i) => i.href), ['https://lab.example.com/c/1', null, null]);
  assert.equal(t.link, null);
});
