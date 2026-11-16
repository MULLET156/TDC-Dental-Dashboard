'use strict';
const COOKIE = '__Host-tdc_sid';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// Set on every response, including pass-through responses (CONTRACT §2).
function securityHeaders(res, { https }) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(self), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (https) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k && !(k in out)) out[k] = part.slice(i + 1).trim();
  }
  return out;
}

function sessionCookie(id, { clear = false } = {}) {
  const base = `${COOKIE}=${clear ? '' : id}; Path=/; HttpOnly; Secure; SameSite=Strict`;
  return clear ? `${base}; Max-Age=0` : base; // no Max-Age: ends when the browser closes, too
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readForm(req) {
  const ct = String(req.headers['content-type'] || '');
  const buf = await readBody(req);
  if (ct.startsWith('application/json')) {
    try { return JSON.parse(buf.toString('utf8') || '{}'); } catch { return {}; }
  }
  const out = {};
  for (const [k, v] of new URLSearchParams(buf.toString('utf8'))) {
    if (k in out) out[k] = [].concat(out[k], v); else out[k] = v;
  }
  return out;
}

function send(res, status, body, type = 'text/html; charset=utf-8') {
  if (res.headersSent) { res.end(); return; }
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function json(res, status, obj) { send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8'); }

function redirect(res, location, status = 303) {
  res.statusCode = status;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Only accept "next" targets on this site, like /m/daysheet/?x=1.
function safeNext(next) {
  next = String(next || '');
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || /[\r\n]/.test(next)) return '/';
  return next;
}

function isNavigation(req) {
  const mode = req.headers['sec-fetch-mode'];
  if (mode) return mode === 'navigate';
  return req.method === 'GET' && String(req.headers.accept || '').includes('text/html');
}

module.exports = { COOKIE, CSP, securityHeaders, parseCookies, sessionCookie, readBody, readForm, send, json, redirect, esc, safeNext, isNavigation };
