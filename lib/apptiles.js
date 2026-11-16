'use strict';
// CONTRACT §5b: tiles from the standalone apps (Lab Tracker, Supply Room,
// Maintenance Tracker). Fetched by the Dashboard's server only, with the app's
// TILE_TOKEN as a Bearer token. The token never reaches a browser or a log.
const http = require('node:http');
const https = require('node:https');
const { APP_TILES } = require('./config');

const TIMEOUT_MS = 3000;
const CACHE_MS = 30 * 1000; // same tile for everyone; keeps us far under the apps' 60/min limit
const STATUSES = ['ok', 'warn', 'alert'];
const agents = { 'http:': new http.Agent({ keepAlive: true, maxSockets: 4 }), 'https:': new https.Agent({ keepAlive: true, maxSockets: 4 }) };
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

// Links must point into the same app (full https URLs, §5b). Anything else is dropped.
function appHref(origin, href) {
  if (typeof href !== 'string') return null;
  let u;
  try { u = new URL(href); } catch { return null; }
  return u.origin === origin && (u.protocol === 'https:' || LOOPBACK.has(u.hostname)) ? u.toString() : null;
}

function cleanAppTile(origin, t, fallbackTitle) {
  if (!t || typeof t !== 'object') return null;
  return {
    title: str(t.title, 60) || fallbackTitle,
    value: str(t.value, 60),
    status: STATUSES.includes(t.status) ? t.status : 'ok',
    items: (Array.isArray(t.items) ? t.items : []).slice(0, 8)
      .map((i) => ({ text: str(i?.text, 120), href: appHref(origin, i?.href) }))
      .filter((i) => i.text),
    link: appHref(origin, t.link),
    updated: str(t.updated, 40),
  };
}

const ERRORS = { 401: 'Wrong token', 404: 'Tiles are turned off in the app (no TILE_TOKEN there)', 429: 'Too many requests' };

class AppTiles {
  constructor(config, { now = () => Date.now() } = {}) {
    this.config = config;
    this.now = now;
    this.cache = new Map(); // key → { at, result }
    this.inflight = new Map();
  }

  defs(appId) { return APP_TILES[appId] || []; }

  forget(appId) { for (const k of this.cache.keys()) if (k.startsWith(`${appId}/`)) this.cache.delete(k); }

  async tile(appId, tileId) {
    const link = this.config.link(appId);
    const def = this.defs(appId).find((d) => d.id === tileId);
    if (!link || !def || !link.url || !link.token) return { ok: false, error: 'Not set up' };
    const key = `${appId}/${tileId}`;
    const hit = this.cache.get(key);
    if (hit && hit.url === link.url && this.now() - hit.at < CACHE_MS) return hit.result;
    if (this.inflight.has(key)) return this.inflight.get(key);
    const p = this.fetchTile(link, def).then((result) => {
      this.cache.set(key, { at: this.now(), url: link.url, result });
      this.inflight.delete(key);
      return result;
    });
    this.inflight.set(key, p);
    return p;
  }

  fetchTile(link, def) {
    return new Promise((resolve) => {
      let url;
      try { url = new URL(`${link.url.replace(/\/+$/, '')}/tdc/tiles/${def.id}`); } catch { resolve({ ok: false, error: 'Bad address' }); return; }
      if (url.protocol !== 'https:' && !LOOPBACK.has(url.hostname)) { resolve({ ok: false, error: 'The app address must use https://' }); return; }
      const lib = url.protocol === 'https:' ? https : http;
      let done = false;
      const finish = (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
      const req = lib.request(url, {
        method: 'GET', agent: agents[url.protocol],
        headers: { accept: 'application/json', authorization: `Bearer ${link.token}` },
      }, (res) => {
        const chunks = []; let size = 0;
        res.on('data', (c) => { size += c.length; if (size > 64 * 1024) req.destroy(); else chunks.push(c); });
        res.on('end', () => {
          if (res.statusCode !== 200) { finish({ ok: false, error: ERRORS[res.statusCode] || 'Not responding', code: res.statusCode }); return; }
          let json;
          try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { finish({ ok: false, error: 'Not responding' }); return; }
          const tile = cleanAppTile(url.origin, json, def.title);
          finish(tile ? { ok: true, tile } : { ok: false, error: 'Not responding' });
        });
        res.on('error', () => finish({ ok: false, error: 'Not responding' }));
      });
      const timer = setTimeout(() => { req.destroy(); finish({ ok: false, error: 'Not responding' }); }, TIMEOUT_MS);
      req.on('error', () => finish({ ok: false, error: 'Not responding' }));
      req.end();
    });
  }
}

module.exports = { AppTiles, cleanAppTile, appHref };
