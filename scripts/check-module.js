'use strict';
// Module contract checker. Module agents: run this against your module
// before opening a pull request.
//
//   node scripts/check-module.js http://127.0.0.1:3101 --env C:\path\to\your-module\.env
//
// The module's MODULE_SECRET is read from --env <file>, or from the
// MODULE_SECRET environment variable. It is never printed.
// Exit code 0 = all required checks passed.
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const { parseEnv } = require('../lib/env');
const { signedHeaders } = require('../lib/sign');

const ROLES = ['owner', 'admin', 'doctor', 'hygienist', 'assistant', 'front'];
const ICONS = ['calendar', 'search', 'mic', 'chart', 'flask', 'box', 'wrench', 'home', 'settings'];

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) || '').replace(/\/+$/, '');
const envIdx = args.indexOf('--env');
let secret = process.env.MODULE_SECRET || '';
if (envIdx >= 0) {
  try { secret = parseEnv(fs.readFileSync(args[envIdx + 1], 'utf8')).MODULE_SECRET || ''; } catch (e) { console.error(`Could not read ${args[envIdx + 1]}: ${e.message}`); process.exit(2); }
}
if (!base) {
  console.log('Usage: node scripts/check-module.js http://127.0.0.1:3101 --env path\\to\\module\\.env');
  process.exit(2);
}
if (!secret) { console.error('No MODULE_SECRET found. Use --env path\\to\\module\\.env'); process.exit(2); }

let failures = 0; let warnings = 0;
const pass = (t) => console.log(`  PASS  ${t}`);
const fail = (t) => { failures++; console.log(`  FAIL  ${t}`); };
const warn = (t) => { warnings++; console.log(`  WARN  ${t}`); };

function request(method, pathAndQuery, headers = {}, body = null, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const url = new URL(base + pathAndQuery);
    const lib = url.protocol === 'https:' ? https : http;
    const started = Date.now();
    const req = lib.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json, ms: Date.now() - started });
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ status: 0, error: 'timed out', ms: Date.now() - started }); });
    req.on('error', (e) => resolve({ status: 0, error: e.message, ms: Date.now() - started }));
    if (body) req.write(body);
    req.end();
  });
}

const signed = (method, p, who, extra = {}) => signedHeaders(secret, {
  method, pathAndQuery: p, user: who.user, name: who.name, roles: who.roles, base: `/m/${who.id}`, ...extra,
});

async function main() {
  console.log(`Checking ${base} against the TDC Office module contract (version 1)\n`);

  // §8 health
  const h = await request('GET', '/health');
  if (h.status === 200 && h.json && h.json.ok === true && h.json.contract === 1 && typeof h.json.version === 'string') pass(`GET /health works without a signature (version ${h.json.version})`);
  else { fail(`GET /health should answer 200 {"ok":true,"version":"…","contract":1} without a signature (got ${h.status || h.error})`); if (!h.status) { summary(); return; } }

  // §3 unsigned and badly signed requests are rejected
  const sys = { user: 'dashboard', name: 'Dashboard', roles: ['system'], id: 'x' };
  const r1 = await request('GET', '/manifest.json');
  r1.status === 401 ? pass('Unsigned request is rejected with 401') : fail(`Unsigned GET /manifest.json should be 401 (got ${r1.status})`);
  const r2 = await request('GET', '/', { accept: 'text/html' });
  r2.status === 401 ? pass('Unsigned page request is rejected with 401') : fail(`Unsigned GET / should be 401 (got ${r2.status})`);
  const r3 = await request('POST', '/', { 'content-type': 'application/x-www-form-urlencoded' }, 'a=1');
  r3.status === 401 ? pass('Unsigned POST is rejected with 401') : fail(`Unsigned POST / should be 401 (got ${r3.status})`);

  const bad = { ...signed('GET', '/manifest.json', sys) };
  bad['x-tdc-sig'] = bad['x-tdc-sig'].replace(/^./, (c) => (c === '0' ? '1' : '0'));
  const r4 = await request('GET', '/manifest.json', bad);
  r4.status === 401 ? pass('Wrong signature is rejected') : fail(`Wrong signature should be 401 (got ${r4.status})`);

  const old = signed('GET', '/manifest.json', sys, { now: Date.now() - 40000 });
  const r5 = await request('GET', '/manifest.json', old);
  r5.status === 401 ? pass('Signature older than 30 seconds is rejected') : fail(`A 40-second-old signature should be 401 (got ${r5.status})`);
  const future = signed('GET', '/manifest.json', sys, { now: Date.now() + 40000 });
  const r6 = await request('GET', '/manifest.json', future);
  r6.status === 401 ? pass('Signature from the future is rejected') : fail(`A signature 40 seconds in the future should be 401 (got ${r6.status})`);

  const replay = signed('GET', '/health', sys);
  const r7 = await request('GET', '/manifest.json', replay);
  r7.status === 401 ? pass('Signature made for a different path is rejected') : fail(`A signature for another path should be 401 (got ${r7.status})`);

  const tampered = signed('GET', '/manifest.json', sys);
  tampered['x-tdc-roles'] = 'owner';
  const r8 = await request('GET', '/manifest.json', tampered);
  r8.status === 401 ? pass('Changed roles header is rejected') : fail(`Changing X-TDC-Roles after signing should give 401 (got ${r8.status})`);

  const missing = signed('GET', '/manifest.json', sys); delete missing['x-tdc-time'];
  const r9 = await request('GET', '/manifest.json', missing);
  r9.status === 401 ? pass('Missing X-TDC-Time is rejected') : fail(`Missing X-TDC-Time should be 401 (got ${r9.status})`);

  // §4 manifest
  const m = await request('GET', '/manifest.json', signed('GET', '/manifest.json', sys));
  if (m.status !== 200 || !m.json) { fail(`Signed GET /manifest.json (as user "dashboard", role "system") should return JSON (got ${m.status})`); summary(); return; }
  const man = m.json;
  pass('Signed GET /manifest.json returns JSON');
  man.contract === 1 ? pass('manifest.contract is 1') : fail('manifest.contract must be 1');
  /^[a-z][a-z0-9-]{1,30}$/.test(man.id || '') ? pass(`manifest.id "${man.id}"`) : fail('manifest.id must be lowercase letters, numbers or dashes');
  for (const k of ['name', 'version', 'description']) (typeof man[k] === 'string' && man[k]) ? pass(`manifest.${k} is set`) : fail(`manifest.${k} must be a non-empty string`);
  ICONS.includes(man.icon) ? pass(`manifest.icon "${man.icon}"`) : fail(`manifest.icon must be one of: ${ICONS.join(', ')}`);
  (Array.isArray(man.roles) && man.roles.length && man.roles.every((r) => ROLES.includes(r))) ? pass('manifest.roles are valid') : fail(`manifest.roles must be a list from: ${ROLES.join(', ')}`);
  if (!Array.isArray(man.nav) || !man.nav.every((n) => n && typeof n.label === 'string' && typeof n.path === 'string' && n.path.startsWith('/') && !n.path.startsWith('//'))) fail('manifest.nav must be a list of { label, path } with paths starting with "/"');
  else pass(`manifest.nav has ${man.nav.length} page(s)`);
  if (!Array.isArray(man.tiles)) { fail('manifest.tiles must be a list'); man.tiles = []; }

  const id = man.id;
  const who = (roles) => ({ user: 'checker', name: 'Contract Checker', roles, id });

  // §5 tiles
  for (const t of man.tiles) {
    const label = `tile "${t && t.id}"`;
    if (!t || typeof t.id !== 'string' || typeof t.title !== 'string' || typeof t.path !== 'string' || !/^\/tiles\/[A-Za-z0-9_-]+$/.test(t.path)) { fail(`${label}: needs id, title and a path like /tiles/<id>`); continue; }
    if (!Array.isArray(t.roles) || !t.roles.every((r) => ROLES.includes(r))) fail(`${label}: roles must be a list of valid roles`);
    if (typeof t.refreshSeconds !== 'number') warn(`${label}: refreshSeconds should be a number`);
    const tsys = { ...sys, id };
    const r = await request('GET', t.path, signed('GET', t.path, tsys), null, 6000);
    if (r.status !== 200 || !r.json) { fail(`${label}: GET ${t.path} should return JSON (got ${r.status || r.error})`); continue; }
    r.ms <= 3000 ? pass(`${label}: answered in ${r.ms} ms`) : fail(`${label}: took ${r.ms} ms (must be under 3000 ms; cache it)`);
    const d = r.json;
    if (typeof d.title !== 'string') fail(`${label}: "title" must be a string`);
    ['ok', 'warn', 'alert'].includes(d.status) ? pass(`${label}: status "${d.status}"`) : fail(`${label}: status must be ok, warn or alert`);
    if (d.items !== undefined && (!Array.isArray(d.items) || d.items.length > 8)) fail(`${label}: items must be a list of at most 8`);
    const hrefs = [d.link, ...(Array.isArray(d.items) ? d.items.map((i) => i && i.href) : [])].filter((x) => x !== undefined && x !== null);
    hrefs.every((x) => typeof x === 'string' && x.startsWith('/') && !x.startsWith('//')) ? pass(`${label}: links are module-relative`) : fail(`${label}: href/link values must be module-relative paths starting with "/"`);
    if (d.items && JSON.stringify(d).match(/\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b|\b\d{3}-\d{2}-\d{4}\b|\b(19|20)\d{2}-\d{2}-\d{2}\b(?!T)/)) warn(`${label}: looks like it may contain a phone number, SSN or birthdate. Tiles must never show these.`);
    if (d.html !== undefined || /<[a-z][^>]*>/i.test(JSON.stringify(d))) fail(`${label}: tiles must not contain HTML`);
  }

  // §6 shared look, using the first nav page
  const first = (man.nav[0] && man.nav[0].path) || '/';
  const pg = await request('GET', first, { accept: 'text/html', ...signed('GET', first, who(['owner'])) });
  if (pg.status >= 500 || !pg.status) fail(`GET ${first} as an owner failed (${pg.status || pg.error})`);
  else if (String(pg.headers['content-type'] || '').includes('text/html')) {
    pg.text.includes('/shared/tdc.css') ? pass('Page includes /shared/tdc.css') : fail('Pages must include <link rel="stylesheet" href="/shared/tdc.css">');
    pg.text.includes('/shared/shell.js') ? pass('Page includes /shared/shell.js') : fail('Pages must include <script src="/shared/shell.js" defer></script>');
    pg.text.includes(`data-module="${id}"`) ? pass(`Page has <body data-module="${id}">`) : fail(`Pages must have <body data-module="${id}">`);
    pg.text.includes('tdc-main') ? pass('Page has <main class="tdc-main">') : fail('Pages must put content in <main class="tdc-main">');
    /<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(pg.text) ? fail('Page has an inline <script>. The Dashboard\'s security policy blocks inline scripts; move it to a .js file.') : pass('No inline scripts');
    /\son[a-z]+\s*=\s*["']/i.test(pg.text) ? fail('Page has inline event handlers (onclick=…). These are blocked; use addEventListener in a .js file.') : pass('No inline event handlers');
    /(href|src|action)=["']\/(?!shared\/|m\/)/i.test(pg.text) ? warn('Page has links starting with "/" that don\'t use the X-TDC-Base path. Use the base path (e.g. /m/daysheet/…) or relative links.') : pass('Links use the base path');
  } else pass(`GET ${first} answered ${pg.status} (${pg.headers['content-type']})`);

  // Role check is the module's job: try the first page as each single role
  const allowed = man.roles || [];
  const notAllowed = ROLES.filter((r) => !allowed.includes(r));
  for (const r of notAllowed.slice(0, 2)) {
    const x = await request('GET', first, { accept: 'text/html', ...signed('GET', first, who([r])) });
    x.status === 403 ? pass(`Role "${r}" (not in manifest.roles) gets 403`) : warn(`Role "${r}" is not in manifest.roles but GET ${first} answered ${x.status} (expected 403)`);
  }

  summary();
}

function summary() {
  console.log(`\n${failures ? `${failures} check(s) FAILED` : 'All required checks passed'}${warnings ? `, ${warnings} warning(s)` : ''}.`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
