'use strict';
// "Hello" — a tiny sample module that follows the TDC Office contract.
// Other module agents: copy the patterns here. Everything a module must do
// is marked with "CONTRACT".
//
// Run on its own:  node examples/hello-module/server.js   (reads examples/hello-module/.env)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { verifyTdcRequest, hasRole } = require('./tdc-verify');

const VERSION = '0.1.0';
const ALL_ROLES = ['owner', 'admin', 'doctor', 'hygienist', 'assistant', 'front'];
const KIT = require('./kit');

// CONTRACT §4: the manifest. Paths are module-relative.
const MANIFEST = {
  contract: 1,
  id: 'hello',
  name: 'Hello (sample)',
  version: VERSION,
  description: 'A sample module that shows how to plug into the Dashboard',
  icon: 'home',
  roles: ALL_ROLES,
  nav: [
    { label: 'Hello', path: '/' },
    { label: 'Design kit', path: '/kit' },
    { label: 'Echo form', path: '/echo' },
    { label: 'Owners only', path: '/owners' },
  ],
  tiles: [
    { id: 'greeting', title: 'Hello tile', path: '/tiles/greeting', roles: ALL_ROLES, refreshSeconds: 60 },
    { id: 'owners', title: 'Owner-only tile', path: '/tiles/owners', roles: ['owner', 'admin'], refreshSeconds: 300 },
  ],
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// CONTRACT §6 + DESIGN.md: every page includes the shared CSS and shell.js from
// the Dashboard (same site, so plain "/shared/..." works), sets data-module (which
// picks the accent colour), and puts content in <main class="tdc-main">.
// The page's own buttons go in <nav class="tdc-actions"> as .tdc-hbtn with a
// data-kind; shell.js moves them into the header (and into More on phones).
// No inline <script>: the Dashboard's security policy blocks them.
function actions(who, current) {
  const b = esc(who.base);
  const btn = (kind, icon, label, href, extra = '') => `<a class="tdc-hbtn" data-kind="${kind}" data-icon="${icon}" href="${b}${href}"${current === href ? ' aria-current="page"' : ''}>${label}${extra}</a>`;
  return `<nav class="tdc-actions" aria-label="Page actions">
${btn('list', 'list', 'All items', '/kit')}
${btn('new', 'plus', 'New item', '/echo')}
${btn('log', 'history', 'Log', '/log')}
${btn('warn', 'clock', 'Expiring', '/kit?expiring', ' <span class="tdc-hbtn-count">4</span>')}
${btn('money', 'dollar', 'Spending', '/kit?spending')}
${btn('tool', 'edit', 'Editor', '/kit?editor')}
${btn('setup', 'settings', 'Setup', '/owners')}
</nav>`;
}

function page(who, title, inner, current = '') {
  const b = esc(who.base);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} · Toledo Dental Care</title>
<link rel="stylesheet" href="/shared/tdc.css">
<script src="/shared/shell.js" defer></script>
<script src="${b}/static/hello.js" defer></script>
</head>
<body data-module="hello">
<main class="tdc-main">
${actions(who, current)}
${inner}
</main>
</body></html>`;
}

function send(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function createHelloServer({ secret, stage = 'design', log = (l) => console.log(l) }) {
  if (!secret || secret.length < 64) throw new Error('MODULE_SECRET must be at least 64 hex characters (32 random bytes).');

  async function handle(req, res, who) {
    const url = new URL(req.url, 'http://module');
    const p = url.pathname;

    // CONTRACT §4: the manifest is requested as user "dashboard", role "system".
    if (p === '/manifest.json' && req.method === 'GET') return json(res, 200, MANIFEST);
    // CONTRACT §3/§5: tiles are requested as the logged-in staff member,
    // so a tile can be personal. Check roles like any page.
    if (p === '/tiles/greeting' && req.method === 'GET') {
      // CONTRACT §5: JSON only, at most 8 items, hrefs are module-relative,
      // answer within 3 seconds. Never phone numbers, birthdates or SSNs.
      const t = new Date();
      return json(res, 200, {
        title: 'Hello tile',
        value: t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }),
        status: 'ok',
        items: [
          { text: `Personal: you are ${who.name}`, href: '/' },
          { text: 'This tile comes from the sample module', href: '/' },
          { text: 'Try the echo form', href: '/echo' },
        ],
        link: '/',
        updated: t.toISOString(),
      });
    }
    if (p === '/tiles/owners' && req.method === 'GET') {
      if (!hasRole(who, ['owner', 'admin'])) return json(res, 403, { error: 'Not allowed' });
      return json(res, 200, { title: 'Owner-only tile', value: '42', status: 'warn', items: [{ text: 'Only owners and admins see this', href: '/owners' }], link: '/owners', updated: new Date().toISOString() });
    }

    // Static files for this module's pages.
    if (p === '/static/hello.js' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
      res.end(fs.readFileSync(path.join(__dirname, 'public', 'hello.js')));
      return undefined;
    }

    // Pages. Links use who.base (from X-TDC-Base), e.g. "/m/hello".
    if (p === '/' && req.method === 'GET') {
      return send(res, 200, page(who, 'Hello', `
<h1>Hello, ${esc(who.name)}</h1>
<div class="tdc-card">
<p>This page is served by the <strong>sample module</strong> and shown through the Dashboard at <code>${esc(who.base)}/</code>.</p>
<table class="tdc-table"><tbody>
<tr><th>Login name</th><td>${esc(who.user)}</td></tr>
<tr><th>Roles</th><td>${who.roles.map((r) => `<span class="tdc-badge">${esc(r)}</span>`).join(' ')}</td></tr>
<tr><th>Base path</th><td><code>${esc(who.base)}</code></td></tr>
<tr><th>Stage</th><td><span class="tdc-badge-${stage === 'live' ? 'alert' : 'ok'}">${esc(stage)}</span></td></tr>
</tbody></table>
</div>
<div class="tdc-btn-row">
<a class="tdc-btn tdc-btn-primary" href="${esc(who.base)}/echo">Try the echo form</a>
<button class="tdc-btn" type="button" id="ping">Ask the module the time (fetch)</button>
<span id="ping-out" class="tdc-muted"></span>
</div>`));
    }

    // Every shared class from DESIGN.md §8, with made-up data. Copy from here.
    if (p === '/kit' && req.method === 'GET') return send(res, 200, page(who, 'Design kit', KIT, '/kit'));
    if (p === '/log' && req.method === 'GET') {
      return send(res, 200, page(who, 'Log', `
<header class="tdc-pagehead"><h2><span data-icon="history"></span>Log</h2><span class="tdc-count">0 entries</span></header>
<div class="tdc-empty"><p>Nothing logged yet</p>Entries show up here once someone marks a task done.</div>`, '/log'));
    }

    if (p === '/echo') {
      let said = '';
      if (req.method === 'POST') {
        const body = new URLSearchParams((await readBody(req, 64 * 1024)).toString('utf8'));
        said = String(body.get('text') || '').slice(0, 500);
      } else if (req.method !== 'GET') return send(res, 405, 'Method not allowed', 'text/plain');
      return send(res, 200, page(who, 'Echo', `
<h1>Echo form</h1>
<div class="tdc-card">
<p class="tdc-muted">Shows that a POST goes through the Dashboard (Origin check) to the module, signed.</p>
${said ? `<div class="tdc-msg tdc-msg-ok">You said: ${esc(said)}</div>` : ''}
<form class="tdc-form" method="post" action="${esc(who.base)}/echo">
<label>Say something<input name="text" maxlength="500" required></label>
<div><button class="tdc-btn tdc-btn-primary" type="submit">Send</button></div>
</form>
</div>`));
    }

    // A role check, done by the module itself (CONTRACT §3).
    if (p === '/owners' && req.method === 'GET') {
      if (!hasRole(who, ['owner', 'admin'])) return send(res, 403, page(who, 'Not allowed', '<div class="tdc-card"><h1>Not allowed</h1><p>Only owners and admins can see this page.</p></div>'));
      return send(res, 200, page(who, 'Owners only', '<div class="tdc-card"><h1>Owners only</h1><p>You can see this because you are an owner or admin.</p></div>'));
    }

    if (p === '/api/time' && req.method === 'GET') return json(res, 200, { time: new Date().toISOString(), user: who.user });

    // Large uploads (audio) arrive as the raw request body, up to 25 MB.
    if (p === '/api/upload' && req.method === 'POST') {
      const body = await readBody(req, 25 * 1024 * 1024);
      const sum = require('node:crypto').createHash('sha256').update(body).digest('hex');
      return json(res, 200, { bytes: body.length, sha256: sum, type: req.headers['content-type'] || '' });
    }
    // Shows exactly what the module received (used by the Dashboard tests).
    if (p === '/api/headers' && req.method === 'GET') {
      return json(res, 200, { url: req.url, headers: req.headers });
    }
    if (p === '/redirect-me' && req.method === 'GET') {
      res.writeHead(302, { Location: '/echo', 'Set-Cookie': 'module=1; Path=/' }); res.end(); return undefined;
    }

    return send(res, 404, page(who, 'Not found', '<div class="tdc-card"><h1>Not found</h1></div>'));
  }

  return http.createServer((req, res) => {
    const start = Date.now();
    let user = '-';
    res.on('finish', () => {
      // CONTRACT §8: one JSON line per request, no query string, no bodies.
      log(JSON.stringify({ time: new Date().toISOString(), user, method: req.method, path: req.url.split('?')[0], status: res.statusCode, ms: Date.now() - start }));
    });

    // CONTRACT §8: /health needs no signature.
    if (req.url === '/health' && req.method === 'GET') return json(res, 200, { ok: true, version: VERSION, contract: 1 });

    // CONTRACT §3: everything else must be signed by the Dashboard.
    const who = verifyTdcRequest(secret, req);
    if (!who) { req.resume(); return send(res, 401, 'Unauthorized', 'text/plain'); }
    user = who.user;

    handle(req, res, who).catch((err) => {
      if (!res.headersSent) send(res, 500, 'Error', 'text/plain'); else res.destroy();
      log(JSON.stringify({ time: new Date().toISOString(), event: 'error', message: err.message }));
    });
    return undefined;
  });
}

module.exports = { createHelloServer, MANIFEST };

if (require.main === module) {
  // Minimal .env reader so this file runs on its own.
  try {
    for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env */ }
  const stage = process.env.TDC_STAGE || 'design';
  const port = Number(process.env.PORT || 3100);
  const host = process.env.HOST || '127.0.0.1'; // CONTRACT §1: live stage listens on 127.0.0.1 only
  let server;
  try { server = createHelloServer({ secret: process.env.MODULE_SECRET, stage }); } catch (err) {
    console.error(`Cannot start: ${err.message}\nCopy .env.example to .env and paste the secret from Dashboard → Settings → Modules.`);
    process.exit(1);
  }
  // A real module that reads Open Dental would check here, in the design
  // stage, that GATEWAY_URL/health says "fake": true, and refuse to start
  // otherwise (PLAN.md "Two stages"). Hello doesn't use the gateway.
  server.listen(port, host, () => console.log(`Hello module ${VERSION} listening on http://${host}:${port}/`));
}
