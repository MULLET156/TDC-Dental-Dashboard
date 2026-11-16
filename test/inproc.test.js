'use strict';
// The built-in sample module runs inside the Dashboard with no port of its own
// (Hostinger allows one listening server per app).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startAll, setupOwner } = require('./helpers');
const { createHelloServer } = require('../examples/hello-module/server');

async function withInProcessHello(t) {
  const ctx = await startAll({ hello: false });
  t.after(() => ctx.close());
  const secret = crypto.randomBytes(32).toString('hex');
  const hello = createHelloServer({ secret, stage: 'design', log: () => {} });
  ctx.app.config.extraModules.push({ id: 'hello', name: 'Hello (sample)', baseUrl: 'http://in-process', secret, enabled: true, builtIn: true, inProcess: hello });
  assert.equal(hello.listening, false, 'never listens on a port');
  return { ctx, owner: await setupOwner(ctx) };
}

test('in-process sample module: pages, tiles and the manifest work without a port', async (t) => {
  const { ctx, owner } = await withInProcessHello(t);
  const page = await ctx.req('GET', '/m/hello/kit', { cookie: owner });
  assert.equal(page.status, 200);
  assert.match(page.text, /tdc-stats/);
  const nav = (await ctx.req('GET', '/api/nav', { cookie: owner })).json;
  assert.equal(nav.modules[0].id, 'hello');
  const tile = await ctx.req('GET', '/api/tiles/hello/greeting', { cookie: owner });
  assert.equal(tile.json.ok, true);
  const form = await ctx.post('/m/hello/echo', { text: 'in memory' }, { cookie: owner });
  assert.match(form.text, /You said: in memory/);
});

test('in-process sample module: a 20 MB upload passes through unchanged', async (t) => {
  const { ctx, owner } = await withInProcessHello(t);
  const audio = crypto.randomBytes(20 * 1024 * 1024);
  const r = await ctx.req('POST', '/m/hello/api/upload', { cookie: owner, headers: { origin: ctx.origin, 'content-type': 'audio/webm' }, body: audio });
  assert.equal(r.json.bytes, audio.length);
  assert.equal(r.json.sha256, crypto.createHash('sha256').update(audio).digest('hex'));
});
