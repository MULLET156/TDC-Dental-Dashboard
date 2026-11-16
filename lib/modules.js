'use strict';
// Talking to modules: the signed pass-through (CONTRACT §2–3), manifests
// (§4) and tiles (§5). The Dashboard never calls Open Dental.
const http = require('node:http');
const https = require('node:https');
const { signedHeaders } = require('./sign');

const MAX_BODY = 25 * 1024 * 1024; // CONTRACT §2: up to 25 MB (audio uploads)
const TILE_TIMEOUT_MS = 3000;
const MANIFEST_TIMEOUT_MS = 3000;
const PROXY_TIMEOUT_MS = 120000;
const ICONS = ['calendar', 'search', 'mic', 'chart', 'flask', 'box', 'wrench', 'home', 'settings'];
const STATUSES = ['ok', 'warn', 'alert'];

// Browser headers passed on to modules. Everything else is dropped,
// including Cookie (the Dashboard's login stays with the Dashboard) and any
// X-TDC-* header the browser tries to send.
const FORWARD_REQ = ['accept', 'accept-encoding', 'accept-language', 'content-type', 'content-length',
  'user-agent', 'range', 'if-none-match', 'if-modified-since', 'if-match', 'if-range', 'cache-control', 'origin'];

// Module response headers that are not passed back to the browser.
const DROP_RES = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'te', 'trailer', 'upgrade',
  'set-cookie', 'content-security-policy', 'x-frame-options', 'strict-transport-security', 'x-content-type-options',
  'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy', 'cross-origin-resource-policy',
  'access-control-allow-origin', 'access-control-allow-credentials']);

const agents = {
  'http:': new http.Agent({ keepAlive: true, maxSockets: 50 }),
  'https:': new https.Agent({ keepAlive: true, maxSockets: 50 }),
};

function upstream(mod, { method, pathAndQuery, headers }) {
  const url = new URL(mod.baseUrl + pathAndQuery);
  const lib = url.protocol === 'https:' ? https : http;
  return lib.request(url, { method, headers, agent: agents[url.protocol] });
}

function identity(mod, who, method, pathAndQuery) {
  return signedHeaders(mod.secret, {
    method, pathAndQuery, user: who.username, name: who.name, roles: who.roles, base: `/m/${mod.id}`,
  });
}

const SYSTEM = { username: 'dashboard', name: 'Dashboard', roles: ['system'] };

// GET a JSON document from a module, signed as `who` (default: the system user).
function systemGet(mod, pathAndQuery, timeoutMs, who = SYSTEM) {
  return new Promise((resolve) => {
    if (!mod.secret) { resolve({ error: 'No secret set' }); return; }
    let done = false;
    const finish = (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
    let req;
    try {
      req = upstream(mod, {
        method: 'GET', pathAndQuery,
        headers: { accept: 'application/json', ...identity(mod, who, 'GET', pathAndQuery) },
      });
    } catch (err) { finish({ error: err.message }); return; }
    const timer = setTimeout(() => { req.destroy(); finish({ error: 'Not responding' }); }, timeoutMs);
    req.on('response', (res) => {
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size > 256 * 1024) req.destroy(); else chunks.push(c); });
      res.on('end', () => {
        if (res.statusCode !== 200) { finish({ error: `Answered ${res.statusCode}` }); return; }
        try { finish({ json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); } catch { finish({ error: 'Bad JSON' }); }
      });
      res.on('error', () => finish({ error: 'Not responding' }));
    });
    req.on('error', () => finish({ error: 'Not responding' }));
    req.end();
  });
}

// Plain GET /health (no signature), for the Settings page.
function health(mod, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let req;
    try { req = upstream(mod, { method: 'GET', pathAndQuery: '/health', headers: { accept: 'application/json' } }); } catch { resolve(null); return; }
    const timer = setTimeout(() => { req.destroy(); resolve(null); }, timeoutMs);
    req.on('response', (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        clearTimeout(timer);
        try { resolve(res.statusCode === 200 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null); } catch { resolve(null); }
      });
    });
    req.on('error', () => { clearTimeout(timer); resolve(null); });
    req.end();
  });
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const roleList = (v) => (Array.isArray(v) ? v.filter((r) => typeof r === 'string') : []);
// Module-relative link → site link. Anything that isn't a plain path is dropped.
function modHref(id, href) {
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//') || href.includes('\\')) return null;
  return `/m/${id}${href}`;
}

function cleanManifest(id, m) {
  if (!m || typeof m !== 'object' || m.contract !== 1 || m.id !== id) return null;
  return {
    id,
    name: str(m.name, 60) || id,
    version: str(m.version, 20),
    description: str(m.description, 200),
    icon: ICONS.includes(m.icon) ? m.icon : 'home',
    roles: roleList(m.roles),
    nav: (Array.isArray(m.nav) ? m.nav : []).slice(0, 12)
      .map((n) => ({ label: str(n?.label, 40), href: modHref(id, n?.path) }))
      .filter((n) => n.label && n.href),
    tiles: (Array.isArray(m.tiles) ? m.tiles : []).slice(0, 12)
      .filter((t) => typeof t?.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(t.id) && typeof t.path === 'string' && /^\/tiles\/[A-Za-z0-9_-]+$/.test(t.path))
      .map((t) => ({
        id: t.id, title: str(t.title, 60) || t.id, path: t.path, roles: roleList(t.roles),
        refreshSeconds: Math.max(30, Math.min(3600, Number(t.refreshSeconds) || 300)),
      })),
  };
}

function cleanTile(id, t) {
  if (!t || typeof t !== 'object') return null;
  return {
    title: str(t.title, 60),
    value: str(t.value, 60),
    status: STATUSES.includes(t.status) ? t.status : 'ok',
    items: (Array.isArray(t.items) ? t.items : []).slice(0, 8)
      .map((i) => ({ text: str(i?.text, 120), href: modHref(id, i?.href) }))
      .filter((i) => i.text),
    link: modHref(id, t.link),
    updated: str(t.updated, 40),
  };
}

class ModuleDirectory {
  constructor(config, { ttlMs = 60000, errTtlMs = 15000 } = {}) {
    this.config = config;
    this.ttlMs = ttlMs;
    this.errTtlMs = errTtlMs;
    this.cache = new Map(); // id → { at, manifest, error, baseUrl, secret }
  }

  enabled() { return this.config.modules().filter((m) => m.enabled !== false); }

  async manifest(mod) {
    const c = this.cache.get(mod.id);
    const fresh = c && c.baseUrl === mod.baseUrl && c.secret === mod.secret
      && Date.now() - c.at < (c.manifest ? this.ttlMs : this.errTtlMs);
    if (fresh) return c;
    const r = await systemGet(mod, '/manifest.json', MANIFEST_TIMEOUT_MS);
    const manifest = r.json ? cleanManifest(mod.id, r.json) : null;
    // If a module is briefly down, keep showing what we knew about it.
    const entry = {
      at: Date.now(), baseUrl: mod.baseUrl, secret: mod.secret,
      manifest: manifest || (c && c.baseUrl === mod.baseUrl ? c.manifest : null),
      error: manifest ? null : (r.error || 'Manifest does not follow the contract'),
    };
    this.cache.set(mod.id, entry);
    return entry;
  }

  async all() {
    return Promise.all(this.enabled().map(async (mod) => ({ mod, ...(await this.manifest(mod)) })));
  }

  // CONTRACT §3: tiles are requested as the logged-in staff member.
  async tile(mod, tileDef, user) {
    const who = { username: user.username, name: user.name, roles: user.roles };
    const r = await systemGet(mod, tileDef.path, TILE_TIMEOUT_MS, who);
    const t = r.json ? cleanTile(mod.id, r.json) : null;
    return t ? { ok: true, tile: t } : { ok: false, error: 'Not responding' };
  }

  forget(id) { this.cache.delete(id); }
}

const canSee = (userRoles, allowed) => !allowed || allowed.length === 0 || userRoles.some((r) => allowed.includes(r));

// The pass-through: /m/<id>/<rest> → <module base URL>/<rest>, signed.
function passThrough(req, res, { mod, user, pathAndQuery, clientIp, https: isHttps, onError }) {
  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > MAX_BODY) {
    // Read and discard the upload before answering. Answering early and
    // closing makes Windows reset the connection, and the browser then
    // never sees the "too large" message. Very large bodies are just cut.
    const tooLarge = () => onError(413, 'That upload is too large (the limit is 25 MB).');
    if (contentLength > 4 * MAX_BODY) { res.setHeader('Connection', 'close'); tooLarge(); req.destroy(); return; }
    req.on('end', tooLarge);
    req.on('error', () => {});
    req.resume();
    return;
  }

  const headers = {};
  for (const h of FORWARD_REQ) if (req.headers[h] !== undefined) headers[h] = req.headers[h];
  headers['x-forwarded-for'] = clientIp;
  headers['x-forwarded-proto'] = isHttps ? 'https' : 'http';
  Object.assign(headers, identity(mod, { username: user.username, name: user.name, roles: user.roles }, req.method, pathAndQuery));

  let up;
  try { up = upstream(mod, { method: req.method, pathAndQuery, headers }); } catch { onError(502); return; }
  let size = 0;
  let failed = false;
  const fail = (status, msg) => { if (failed) return; failed = true; up.destroy(); onError(status, msg); };

  up.setTimeout(PROXY_TIMEOUT_MS, () => fail(504));
  up.on('error', () => fail(502));
  up.on('response', (ures) => {
    if (failed) { ures.resume(); return; }
    const out = {};
    for (const [k, v] of Object.entries(ures.headers)) if (!DROP_RES.has(k)) out[k] = v;
    // A module redirecting to "/x" means its own /x, so add the /m/<id> prefix.
    if (typeof out.location === 'string') {
      const loc = out.location;
      const prefix = `/m/${mod.id}`;
      if (loc.startsWith(mod.baseUrl + '/')) out.location = prefix + loc.slice(mod.baseUrl.length);
      else if (loc.startsWith('/') && !loc.startsWith('//') && !loc.startsWith(prefix + '/') && loc !== prefix) out.location = prefix + loc;
      else if (/^[a-z][a-z0-9+.-]*:/i.test(loc) || loc.startsWith('//')) delete out.location; // never redirect off-site
    }
    res.writeHead(ures.statusCode, out);
    ures.pipe(res);
    ures.on('error', () => res.destroy());
  });

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) { fail(413, 'That upload is too large (the limit is 25 MB).'); req.destroy(); }
  });
  req.on('aborted', () => up.destroy());
  res.on('close', () => { if (!res.writableFinished) up.destroy(); });
  req.pipe(up);
}

module.exports = { ModuleDirectory, passThrough, systemGet, health, cleanManifest, cleanTile, canSee, MAX_BODY, ICONS, FORWARD_REQ };
