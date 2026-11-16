'use strict';
// Test helpers: a Dashboard (plain HTTP, temp data folder, fake clock) plus
// the sample module. Fake data only.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createApp } = require('../lib/app');
const { createHelloServer } = require('../examples/hello-module/server');

const SETUP_CODE = 'test-setup-code';
const OWNER = { username: 'owner1', name: 'Olive Owner', password: 'owner-password-1', pin: '2468' };

function listen(server) {
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
}

function request(port, method, p, { headers = {}, body = null, cookie = null } = {}) {
  return new Promise((resolve, reject) => {
    const h = { ...headers };
    if (cookie) h.cookie = cookie;
    if (body !== null && !h['content-length'] && !Buffer.isBuffer(body) && typeof body !== 'string') throw new Error('body must be string or buffer');
    // agent: false — no pooled sockets, so a server that stops reading an
    // oversized upload can't leave a stray error behind after the test.
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: h, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    let answered = false;
    req.on('response', () => { answered = true; });
    req.on('error', (err) => { if (!answered) reject(err); });
    if (body !== null) req.end(body); else req.end();
  });
}

async function startAll({ hello = true } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdc-test-'));
  const clock = { t: Date.now() };
  const logs = [];
  const app = createApp({ stage: 'design', dataDir, setupCode: SETUP_CODE, version: '0.1.0-test', now: () => clock.t, log: (l) => logs.push(l) });
  const server = http.createServer(app.handler);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  let helloServer = null; let helloSecret = null; let helloPort = null; const helloLogs = [];
  if (hello) {
    helloSecret = crypto.randomBytes(32).toString('hex');
    helloServer = createHelloServer({ secret: helloSecret, stage: 'design', log: (l) => helloLogs.push(l) });
    helloPort = await listen(helloServer);
    app.config.saveModule({ id: 'hello', name: 'Hello', baseUrl: `http://127.0.0.1:${helloPort}`, secret: helloSecret }, { isNew: true });
  }

  const ctx = {
    app, server, port, origin, clock, dataDir, logs, helloServer, helloSecret, helloPort, helloLogs,
    req: (method, p, opts = {}) => request(port, method, p, opts),
    // A browser-like POST from our own pages (form encoded, with Origin).
    post: (p, form, opts = {}) => request(port, 'POST', p, {
      ...opts,
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin, ...(opts.headers || {}) },
      body: new URLSearchParams(form).toString(),
    }),
    async close() {
      app.close();
      server.closeAllConnections?.(); helloServer?.closeAllConnections?.();
      await new Promise((r) => server.close(r));
      if (helloServer) await new Promise((r) => helloServer.close(r));
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
  return ctx;
}

function cookieFrom(res) {
  const sc = [].concat(res.headers['set-cookie'] || []);
  const c = sc.find((x) => x.startsWith('__Host-tdc_sid='));
  if (!c) return null;
  const v = c.split(';')[0];
  return v.endsWith('=') ? null : v;
}

async function setupOwner(ctx) {
  const res = await ctx.post('/setup', { code: SETUP_CODE, name: OWNER.name, username: OWNER.username, password: OWNER.password, password2: OWNER.password, pin: OWNER.pin });
  return cookieFrom(res);
}

async function login(ctx, username, password) {
  const res = await ctx.post('/login', { username, password, next: '/' });
  return { res, cookie: cookieFrom(res) };
}

async function addUser(ctx, ownerCookie, { username, name = username, roles, password = 'staff-password-1', pin = '' }) {
  const form = new URLSearchParams({ username, name, password, pin });
  for (const r of roles) form.append('roles', r);
  return request(ctx.port, 'POST', '/settings/staff/add', {
    cookie: ownerCookie, headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ctx.origin }, body: form.toString(),
  });
}

module.exports = { startAll, request, cookieFrom, setupOwner, login, addUser, SETUP_CODE, OWNER };
