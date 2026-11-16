'use strict';
// CONTRACT §3 signature:
// HMAC-SHA256(MODULE_SECRET, time \n method \n pathAndQuery \n user \n roles \n base), hex.
const crypto = require('node:crypto');

const MAX_SKEW_MS = 30 * 1000;

function signature(secret, { time, method, pathAndQuery, user, roles, base }) {
  const msg = [String(time), String(method).toUpperCase(), pathAndQuery, user, roles, base].join('\n');
  // The key is the MODULE_SECRET text exactly as written in .env (the hex
  // string itself, not decoded bytes) — the plain reading of CONTRACT §3.
  return crypto.createHmac('sha256', String(secret)).update(msg, 'utf8').digest('hex');
}

// Builds the X-TDC-* headers for one request to a module.
function signedHeaders(secret, { method, pathAndQuery, user, name, roles, base, now = Date.now() }) {
  const rolesStr = Array.isArray(roles) ? roles.join(',') : String(roles);
  const time = String(now);
  return {
    'x-tdc-user': user,
    'x-tdc-name': encodeHeader(name),
    'x-tdc-roles': rolesStr,
    'x-tdc-base': base,
    'x-tdc-time': time,
    'x-tdc-sig': signature(secret, { time, method, pathAndQuery, user, roles: rolesStr, base }),
  };
}

// Header values must be plain ASCII. Display names with accents (José) are
// percent-encoded; modules can show them with decodeURIComponent().
function encodeHeader(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : encodeURIComponent(s);
}

// The check a module runs (the same code is in examples/hello-module).
function verify(secret, req, now = Date.now()) {
  const h = req.headers;
  const time = h['x-tdc-time'];
  const sig = h['x-tdc-sig'];
  if (!time || !sig || !/^\d{1,16}$/.test(time) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  if (Math.abs(now - Number(time)) > MAX_SKEW_MS) return false;
  const expected = signature(secret, {
    time, method: req.method, pathAndQuery: req.url,
    user: h['x-tdc-user'] || '', roles: h['x-tdc-roles'] || '', base: h['x-tdc-base'] || '',
  });
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
}

function newSecret() { return crypto.randomBytes(32).toString('hex'); }
const SECRET_RE = /^[0-9a-f]{64,}$/;

module.exports = { signature, signedHeaders, verify, newSecret, SECRET_RE, MAX_SKEW_MS };
