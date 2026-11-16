'use strict';
// The Dashboard: login, staff, settings, home tiles, shared look, and the
// signed pass-through to modules. It never calls Open Dental.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { Users, UserError } = require('./users');
const { Sessions } = require('./sessions');
const { Limiter } = require('./limiter');
const { Config, ConfigError } = require('./config');
const { ModuleDirectory, passThrough, health, canSee } = require('./modules');
const { newSecret } = require('./sign');
const H = require('./http-util');
const P = require('./pages');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const STATIC_TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const BACKGROUND_PATHS = new Set(['/api/session', '/api/nav', '/api/me', '/api/tiles']);
const SETTINGS_ROLES = ['owner', 'admin'];

function createApp(opts) {
  const {
    stage = 'design', dataDir, tls = false, trustProxy = false, publicUrl = '', setupCode = '',
    version = '0.0.0', log = (line) => process.stdout.write(line + '\n'), now,
  } = opts;

  const users = new Users(path.join(dataDir, 'users.json'));
  const config = new Config(path.join(dataDir, 'config.json'), { stage });
  const sessions = new Sessions(now ? { now } : {});
  const limitUser = new Limiter({ max: 5, windowMs: 15 * 60000, blockMs: 15 * 60000, ...(now ? { now } : {}) });
  const limitIp = new Limiter({ max: 20, windowMs: 15 * 60000, blockMs: 15 * 60000, ...(now ? { now } : {}) });
  const directory = new ModuleDirectory(config);

  // First-run setup code: from SETUP_CODE, or made up and saved to a file.
  const setupCodeFile = path.join(dataDir, 'SETUP-CODE.txt');
  function currentSetupCode() {
    if (setupCode) return setupCode;
    try { return fs.readFileSync(setupCodeFile, 'utf8').trim(); } catch { /* make one */ }
    const code = crypto.randomBytes(6).toString('hex');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(setupCodeFile, code + '\n', { mode: 0o600 });
    return code;
  }
  if (users.count() === 0 && !setupCode) currentSetupCode();

  const isHttps = (req) => tls || (trustProxy && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
  const ownOrigin = (req) => (publicUrl ? new URL(publicUrl).origin : `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`);
  const clientIp = (req) => {
    if (trustProxy && req.headers['x-forwarded-for']) {
      const parts = String(req.headers['x-forwarded-for']).split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1];
    }
    return req.socket.remoteAddress || 'unknown';
  };

  // CONTRACT §3: for anything other than GET/HEAD, Origin must be this site.
  function originOk(req) {
    const want = ownOrigin(req);
    const origin = req.headers.origin;
    if (origin) return origin === want;
    const ref = req.headers.referer;
    if (ref) { try { return new URL(ref).origin === want; } catch { return false; } }
    return false;
  }

  function staticFile(res, dir, name) {
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('.')) return false;
    const file = path.join(PUBLIC_DIR, dir, name);
    let buf;
    try { buf = fs.readFileSync(file); } catch { return false; }
    res.statusCode = 200;
    res.setHeader('Content-Type', STATIC_TYPES[path.extname(name)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.end(buf);
    return true;
  }

  // Who is this? → { session, user, state: 'ok' | 'locked' | 'out' }
  function auth(req) {
    const id = H.parseCookies(req.headers.cookie)[H.COOKIE];
    const session = id ? sessions.get(id) : null;
    if (!session) return { state: 'out' };
    const user = users.get(session.username);
    if (!user || user.disabled) { sessions.destroy(session.id); return { state: 'out' }; }
    const state = sessions.check(session, config.policyFor(user));
    if (state === 'expired') return { state: 'out' };
    return { session, user, state };
  }

  const isSettingsUser = (user) => user.roles.some((r) => SETTINGS_ROLES.includes(r));

  function errorOut(req, res, a, status, title, text) {
    if (H.isNavigation(req)) H.send(res, status, P.errorPage({ status, title, text, loggedIn: a && a.state === 'ok' }));
    else H.json(res, status, { error: text });
  }

  function flashOf(session) {
    const f = session && session.flash;
    if (session) session.flash = null;
    return f;
  }
  function flashAndGo(res, session, kind, text, where) {
    session.flash = { kind, text };
    H.redirect(res, where);
  }

  function startSession(res, user, oldId) {
    if (oldId) sessions.destroy(oldId);
    const s = sessions.create(user.username);
    res.setHeader('Set-Cookie', H.sessionCookie(s.id));
    return s;
  }

  // ---------- Module views, filtered by role ----------

  async function visibleModules(user) {
    const all = await directory.all();
    return all.map((e) => ({
      mod: e.mod, manifest: e.manifest, error: e.error,
      visible: e.manifest ? canSee(user.roles, e.manifest.roles) : true,
    })).filter((e) => e.visible);
  }

  async function navFor(user) {
    const mods = await visibleModules(user);
    return {
      modules: mods.filter((e) => e.manifest).map((e) => ({
        id: e.mod.id, name: e.manifest.name, icon: e.manifest.icon,
        href: e.manifest.nav[0]?.href || `/m/${e.mod.id}/`, nav: e.manifest.nav, up: !e.error,
      })),
      links: config.data.links.filter((l) => l.url).map((l) => ({ name: l.name, url: l.url, icon: l.icon })),
      settings: isSettingsUser(user),
      canLock: !!user.pinHash,
    };
  }

  async function tilesFor(user) {
    const hidden = config.data.hiddenTiles;
    const mods = await visibleModules(user);
    const tiles = [];
    for (const e of mods) {
      if (!e.manifest) {
        tiles.push({ module: e.mod.id, moduleName: e.mod.name, icon: 'home', id: null, title: e.mod.name, down: true });
        continue;
      }
      for (const t of e.manifest.tiles) {
        if (hidden.includes(`${e.mod.id}/${t.id}`) || !canSee(user.roles, t.roles)) continue;
        tiles.push({
          module: e.mod.id, moduleName: e.manifest.name, icon: e.manifest.icon, id: t.id, title: t.title,
          refreshSeconds: t.refreshSeconds, url: `/api/tiles/${e.mod.id}/${t.id}`, down: !!e.error,
        });
      }
    }
    return tiles;
  }

  // ---------- Request handler ----------

  async function handle(req, res) {
    H.securityHeaders(res, { https: isHttps(req) });
    let pathname;
    try { pathname = new URL(req.url, 'http://x').pathname; } catch { H.send(res, 400, 'Bad request', 'text/plain'); return; }
    const method = req.method;

    if (pathname === '/health' && (method === 'GET' || method === 'HEAD')) {
      H.json(res, 200, { ok: true, version, contract: 1 }); return;
    }
    if (method === 'GET' || method === 'HEAD') {
      let m;
      if ((m = pathname.match(/^\/shared\/([^/]+)$/)) && staticFile(res, 'shared', m[1])) return;
      if ((m = pathname.match(/^\/js\/([^/]+)$/)) && staticFile(res, 'js', m[1])) return;
      if (pathname === '/favicon.ico' && staticFile(res, 'shared', 'icon-64.png')) return;
      if (pathname === '/robots.txt') { H.send(res, 200, 'User-agent: *\nDisallow: /\n', 'text/plain'); return; }
    }
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      H.send(res, 405, 'Method not allowed', 'text/plain'); return;
    }
    if (method !== 'GET' && method !== 'HEAD' && !originOk(req)) {
      req.resume();
      errorOut(req, res, null, 403, 'Blocked', 'This request did not come from the Office Dashboard page, so it was blocked.');
      return;
    }

    // First run: nothing works until the owner account exists.
    if (users.count() === 0) {
      if (pathname === '/setup') { await setupRoute(req, res); return; }
      if (H.isNavigation(req)) H.redirect(res, '/setup', 302);
      else H.json(res, 503, { error: 'Setup needed' });
      return;
    }
    if (pathname === '/setup') { H.redirect(res, '/login', 302); return; }

    if (pathname === '/login') { await loginRoute(req, res); return; }
    if (pathname === '/logout' && method === 'POST') {
      const a = auth(req);
      if (a.session) sessions.destroy(a.session.id);
      res.setHeader('Set-Cookie', H.sessionCookie('', { clear: true }));
      H.redirect(res, '/login');
      return;
    }

    const a = auth(req);
    req.tdcUser = a.user ? a.user.username : '-';

    if (pathname === '/api/session') { H.json(res, 200, { state: a.state }); return; }
    if (pathname === '/lock' || pathname === '/unlock') { await lockRoute(req, res, a, pathname); return; }

    if (a.state !== 'ok') {
      req.resume();
      if (H.isNavigation(req)) {
        const next = encodeURIComponent(H.safeNext(req.url));
        H.redirect(res, a.state === 'locked' ? `/lock?next=${next}` : `/login?next=${next}`, 302);
      } else {
        H.json(res, a.state === 'locked' ? 423 : 401, { error: a.state === 'locked' ? 'Locked' : 'Not logged in' });
      }
      return;
    }

    const background = req.headers['x-tdc-background'] === '1' || BACKGROUND_PATHS.has(pathname) || pathname.startsWith('/api/tiles/');
    if (!background) sessions.touch(a.session);

    // Pass-through to modules (CONTRACT §2).
    const pm = req.url.match(/^\/m\/([a-z][a-z0-9-]{1,30})(\/[^?#]*)?(\?[^#]*)?$/);
    if (pm) { await moduleRoute(req, res, a, pm); return; }
    if (pathname.startsWith('/m/')) { errorOut(req, res, a, 404, 'Not found', 'There is no such page.'); return; }

    if (pathname === '/api/activity' && method === 'POST') { req.resume(); res.statusCode = 204; res.end(); return; }
    if (pathname === '/api/me') { H.json(res, 200, { user: a.user.username, name: a.user.name, roles: a.user.roles }); return; }
    if (pathname === '/api/nav') { H.json(res, 200, await navFor(a.user)); return; }
    if (pathname === '/api/tiles') { H.json(res, 200, { tiles: await tilesFor(a.user) }); return; }
    const tm = pathname.match(/^\/api\/tiles\/([a-z][a-z0-9-]{1,30})\/([A-Za-z0-9_-]{1,40})$/);
    if (tm) { await tileRoute(res, a.user, tm[1], tm[2]); return; }

    if (pathname === '/' && method === 'GET') { H.send(res, 200, P.homePage({ name: a.user.name, flash: flashOf(a.session) })); return; }
    if (pathname === '/account' || pathname.startsWith('/account/')) { await accountRoute(req, res, a, pathname); return; }
    if (pathname === '/settings' || pathname.startsWith('/settings/')) {
      if (!isSettingsUser(a.user)) { req.resume(); errorOut(req, res, a, 403, 'Not allowed', 'Only an owner or admin can open Settings.'); return; }
      await settingsRoute(req, res, a, pathname);
      return;
    }
    req.resume();
    errorOut(req, res, a, 404, 'Not found', 'There is no such page.');
  }

  // ---------- Setup / login / lock ----------

  async function setupRoute(req, res) {
    const needsCode = true;
    const codeWhere = setupCode ? 'The SETUP_CODE value from the settings (.env, or the Hostinger panel)' : `In the file ${path.join(path.basename(dataDir), 'SETUP-CODE.txt')} on the server`;
    if (req.method === 'GET') { H.send(res, 200, P.setupPage({ needsCode, codeWhere })); return; }
    if (req.method !== 'POST') { H.send(res, 405, 'Method not allowed', 'text/plain'); return; }
    const f = await H.readForm(req);
    const values = { name: f.name, username: f.username };
    const fail = (text) => H.send(res, 400, P.setupPage({ needsCode, codeWhere, values, flash: { kind: 'error', text } }));
    const ip = clientIp(req);
    if (limitIp.blockedFor(ip)) { fail('Too many tries. Please wait 15 minutes.'); return; }
    const want = Buffer.from(currentSetupCode());
    const got = Buffer.from(String(f.code || '').trim());
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) { limitIp.fail(ip); fail('The setup code is not right.'); return; }
    if (f.password !== f.password2) { fail('The two passwords are different.'); return; }
    if (users.count() !== 0) { H.redirect(res, '/login'); return; }
    try {
      const user = await users.create({ username: f.username, name: f.name, roles: ['owner'], password: f.password, pin: f.pin || null });
      try { fs.unlinkSync(setupCodeFile); } catch { /* fine */ }
      const s = startSession(res, user);
      s.flash = { kind: 'ok', text: 'Welcome! Your owner account is ready. Next: add staff and modules in Settings.' };
      H.redirect(res, '/');
    } catch (err) {
      if (err instanceof UserError) fail(err.message); else throw err;
    }
  }

  async function loginRoute(req, res) {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET') {
      const a = auth(req);
      if (a.state === 'ok') { H.redirect(res, H.safeNext(url.searchParams.get('next')), 302); return; }
      H.send(res, 200, P.loginPage({ next: H.safeNext(url.searchParams.get('next')) }));
      return;
    }
    if (req.method !== 'POST') { H.send(res, 405, 'Method not allowed', 'text/plain'); return; }
    const f = await H.readForm(req);
    const username = String(f.username || '').trim().toLowerCase().slice(0, 64);
    const next = H.safeNext(f.next);
    const ip = clientIp(req);
    const fail = (text, status = 401) => H.send(res, status, P.loginPage({ next, username, flash: { kind: 'error', text } }));

    const blocked = Math.max(limitIp.blockedFor(ip), limitUser.blockedFor(`user:${username}`));
    if (blocked) { fail(`Too many wrong tries. Please wait ${Math.ceil(blocked / 60000)} minutes, or ask an owner or admin to clear the lockout.`, 429); return; }

    const user = await users.checkPassword(username, String(f.password || ''));
    if (!user) {
      limitIp.fail(ip);
      limitUser.fail(`user:${username}`);
      log(JSON.stringify({ time: new Date().toISOString(), event: 'login-failed', ip }));
      fail('Login name or password is wrong.');
      return;
    }
    limitUser.reset(`user:${username}`);
    const old = H.parseCookies(req.headers.cookie)[H.COOKIE];
    startSession(res, user, old);
    log(JSON.stringify({ time: new Date().toISOString(), event: 'login', user: user.username, ip }));
    H.redirect(res, next);
  }

  async function lockRoute(req, res, a, pathname) {
    const url = new URL(req.url, 'http://x');
    if (a.state === 'out') {
      req.resume();
      if (H.isNavigation(req) || req.method === 'POST') H.redirect(res, '/login');
      else H.json(res, 401, { error: 'Not logged in' });
      return;
    }
    const { session, user } = a;
    if (pathname === '/lock' && req.method === 'GET') {
      const next = H.safeNext(url.searchParams.get('next'));
      if (a.state === 'ok') { H.redirect(res, next, 302); return; }
      H.send(res, 200, P.lockPage({ name: user.name, next, hasPin: !!user.pinHash, flash: flashOf(session) }));
      return;
    }
    if (req.method !== 'POST') { H.send(res, 405, 'Method not allowed', 'text/plain'); return; }
    const f = await H.readForm(req);
    const next = H.safeNext(f.next);
    if (pathname === '/lock') {
      if (user.pinHash) sessions.lock(session);
      else { sessions.destroy(session.id); res.setHeader('Set-Cookie', H.sessionCookie('', { clear: true })); H.redirect(res, '/login'); return; }
      H.redirect(res, `/lock?next=${encodeURIComponent(next)}`);
      return;
    }
    // /unlock
    if (a.state !== 'locked') { H.redirect(res, next); return; }
    if (await users.checkPin(user.username, String(f.pin || ''))) {
      sessions.unlock(session);
      H.redirect(res, next);
      return;
    }
    if (sessions.pinFailed(session)) {
      res.setHeader('Set-Cookie', H.sessionCookie('', { clear: true }));
      H.send(res, 401, P.loginPage({ next, username: user.username, flash: { kind: 'error', text: 'Too many wrong PINs. Please log in with your password.' } }));
      return;
    }
    session.flash = { kind: 'error', text: 'Wrong PIN. Please try again.' };
    H.redirect(res, `/lock?next=${encodeURIComponent(next)}`);
  }

  // ---------- Modules ----------

  async function moduleRoute(req, res, a, pm) {
    const [, id, rest, query] = pm;
    const mod = config.module(id);
    if (!mod || mod.enabled === false) { req.resume(); errorOut(req, res, a, 404, 'Not found', 'There is no module with that name.'); return; }
    if (rest === undefined) { req.resume(); H.redirect(res, `/m/${id}/${query || ''}`, 302); return; }
    if (!mod.secret) { req.resume(); errorOut(req, res, a, 503, 'Not set up', 'This module has no secret yet. An owner or admin can set one in Settings → Modules.'); return; }
    const entry = await directory.manifest(mod);
    if (entry.manifest && !canSee(a.user.roles, entry.manifest.roles)) {
      req.resume(); errorOut(req, res, a, 403, 'Not allowed', 'Your role does not have access to this module.'); return;
    }
    passThrough(req, res, {
      mod, user: a.user, pathAndQuery: rest + (query || ''), clientIp: clientIp(req), https: isHttps(req),
      onError: (status, text) => {
        const t = status === 413 ? 'Too large' : 'Not responding';
        errorOut(req, res, a, status, t, text || `${mod.name} is not responding right now. Please try again in a minute.`);
      },
    });
  }

  async function tileRoute(res, user, modId, tileId) {
    const mod = config.module(modId);
    if (!mod || mod.enabled === false) { H.json(res, 404, { ok: false, error: 'No such module' }); return; }
    const entry = await directory.manifest(mod);
    const def = entry.manifest && entry.manifest.tiles.find((t) => t.id === tileId);
    if (!def || !canSee(user.roles, entry.manifest.roles) || !canSee(user.roles, def.roles) || config.data.hiddenTiles.includes(`${modId}/${tileId}`)) {
      H.json(res, 404, { ok: false, error: 'No such tile' }); return;
    }
    H.json(res, 200, await directory.tile(mod, def));
  }

  // ---------- My account ----------

  async function accountRoute(req, res, a, pathname) {
    const { session, user } = a;
    if (pathname === '/account' && req.method === 'GET') { H.send(res, 200, P.accountPage({ user, flash: flashOf(session) })); return; }
    if (req.method !== 'POST') { req.resume(); errorOut(req, res, a, 404, 'Not found', 'There is no such page.'); return; }
    const f = await H.readForm(req);
    const back = (kind, text) => flashAndGo(res, session, kind, text, '/account');
    // Checking the current password is rate-limited like a login.
    const key = `user:${user.username}`;
    if (limitUser.blockedFor(key)) { back('error', 'Too many wrong passwords. Please wait 15 minutes.'); return; }
    if (!(await users.checkPassword(user.username, String(f.current || '')))) { limitUser.fail(key); back('error', 'Your current password is not right.'); return; }
    try {
      if (pathname === '/account/password') {
        if (f.password !== f.password2) { back('error', 'The two new passwords are different.'); return; }
        await users.setPassword(user.username, f.password);
        // Log out this user's other sessions, keep this one.
        for (const [id, s] of sessions.map) if (s.username === user.username && id !== session.id) sessions.destroy(id);
        back('ok', 'Password changed.');
      } else if (pathname === '/account/pin') {
        await users.setPin(user.username, String(f.pin || '').trim() || null);
        back('ok', f.pin ? 'PIN saved.' : 'PIN removed.');
      } else back('error', 'Unknown action.');
    } catch (err) {
      if (err instanceof UserError) back('error', err.message); else throw err;
    }
  }

  // ---------- Settings ----------

  async function settingsRoute(req, res, a, pathname) {
    const { session, user: me } = a;
    const meOwner = me.roles.includes('owner');
    const parts = pathname.split('/').filter(Boolean); // ['settings', tab, ...]
    const tab = parts[1] || '';
    const go = (where, kind, text) => (text ? flashAndGo(res, session, kind, text, where) : H.redirect(res, where));

    if (req.method === 'GET') {
      if (!tab) { H.redirect(res, '/settings/staff', 302); return; }
      if (parts.length !== 2) { errorOut(req, res, a, 404, 'Not found', 'There is no such page.'); return; }
      const flash = flashOf(session);
      if (tab === 'staff') {
        H.send(res, 200, P.staffPage({ users: users.list(), me, lockouts: limitUser.list(), flash })); return;
      }
      if (tab === 'modules') {
        const newSecretShown = session.newSecret; session.newSecret = null;
        const mods = await Promise.all(config.modules().map(async (m) => {
          const [h, e] = await Promise.all([health(m), directory.manifest(m)]);
          return { ...m, health: h, manifestError: e.error };
        }));
        H.send(res, 200, P.modulesPage({ modules: mods, stage, flash, newSecret: newSecretShown })); return;
      }
      if (tab === 'links') { H.send(res, 200, P.linksPage({ links: config.data.links, flash })); return; }
      if (tab === 'tiles') {
        const all = await directory.all();
        const groups = all.map((e) => ({ id: e.mod.id, name: e.manifest?.name || e.mod.name, error: e.manifest ? null : e.error, tiles: e.manifest?.tiles || [] }));
        H.send(res, 200, P.tilesPage({ groups, hidden: config.data.hiddenTiles, flash })); return;
      }
      if (tab === 'sessions') { H.send(res, 200, P.sessionsPage({ sessions: config.data.sessions, flash })); return; }
      errorOut(req, res, a, 404, 'Not found', 'There is no such page.');
      return;
    }

    if (req.method !== 'POST') { req.resume(); H.send(res, 405, 'Method not allowed', 'text/plain'); return; }
    const f = await H.readForm(req);
    const list = (v) => (v === undefined ? [] : [].concat(v));

    try {
      if (tab === 'staff') {
        const back = (kind, text) => go('/settings/staff', kind, text);
        if (parts[2] === 'add' && parts.length === 3) {
          let roles = list(f.roles);
          if (!meOwner) roles = roles.filter((r) => r !== 'owner');
          const u = await users.create({ username: f.username, name: f.name, roles, password: f.password, pin: f.pin || null });
          back('ok', `Added ${u.name}.`);
          return;
        }
        const target = users.get(parts[2]);
        if (!target) { back('error', 'No such staff member.'); return; }
        if (target.roles.includes('owner') && !meOwner) { back('error', 'Only an owner can change an owner account.'); return; }
        const action = parts[3] || 'edit';
        const ownersAfter = (roles, disabled) => users.activeOwners().filter((o) => o.username !== target.username).length
          + (roles.includes('owner') && !disabled ? 1 : 0);

        if (action === 'edit' && parts.length === 3) {
          let roles = list(f.roles);
          if (!meOwner) roles = roles.filter((r) => r !== 'owner');
          const disabled = f.disabled === '1';
          if (target.username === me.username && disabled) { back('error', 'You cannot turn off your own account.'); return; }
          if (ownersAfter(roles, disabled) === 0) { back('error', 'There must always be at least one owner who can log in.'); return; }
          users.update(target.username, { name: f.name, roles, disabled });
          if (disabled) sessions.destroyUser(target.username);
          back('ok', `Saved ${target.name}.`);
        } else if (action === 'password') {
          await users.setPassword(target.username, f.password);
          limitUser.reset(`user:${target.username}`);
          if (target.username !== me.username) sessions.destroyUser(target.username);
          back('ok', `New password set for ${target.name}.`);
        } else if (action === 'pin') {
          await users.setPin(target.username, String(f.pin || '').trim() || null);
          back('ok', f.pin ? `PIN set for ${target.name}.` : `PIN removed for ${target.name}.`);
        } else if (action === 'unblock') {
          limitUser.reset(`user:${target.username}`);
          back('ok', `Lockout cleared for ${target.name}.`);
        } else if (action === 'delete') {
          if (target.username === me.username) { back('error', 'You cannot delete your own account.'); return; }
          if (ownersAfter([], true) === 0) { back('error', 'There must always be at least one owner who can log in.'); return; }
          users.remove(target.username);
          sessions.destroyUser(target.username);
          back('ok', `Deleted ${target.name}.`);
        } else back('error', 'Unknown action.');
        return;
      }

      if (tab === 'modules') {
        const back = (kind, text) => go('/settings/modules', kind, text);
        if (parts[2] === 'add' && parts.length === 3) {
          const given = String(f.secret || '').trim();
          const secret = given || newSecret();
          const m = config.saveModule({ id: f.id, name: f.name, baseUrl: f.baseUrl, secret, enabled: true }, { isNew: true });
          if (!given) session.newSecret = { id: m.id, secret };
          back('ok', `Added ${m.name}.`);
          return;
        }
        const id = parts[2];
        const m = config.data.modules.find((x) => x.id === id);
        if (!m) { back('error', 'That module can\'t be changed here.'); return; }
        const action = parts[3] || 'edit';
        if (action === 'edit' && parts.length === 3) {
          config.saveModule({ id, name: f.name, baseUrl: f.baseUrl, secret: f.secret, enabled: f.enabled === '1' }, { isNew: false });
          directory.forget(id);
          back('ok', `Saved ${m.name}.`);
        } else if (action === 'secret') {
          const secret = newSecret();
          config.saveModule({ ...m, secret }, { isNew: false });
          directory.forget(id);
          session.newSecret = { id, secret };
          back('ok', `New secret made for ${m.name}. The module won't work until you put it in its .env and restart it.`);
        } else if (action === 'delete') {
          config.removeModule(id);
          directory.forget(id);
          back('ok', `Removed ${m.name}.`);
        } else back('error', 'Unknown action.');
        return;
      }

      if (tab === 'links' && parts.length === 2) {
        config.saveLinks(f);
        go('/settings/links', 'ok', 'Links saved.');
        return;
      }
      if (tab === 'tiles' && parts.length === 2) {
        const show = new Set(list(f.show));
        config.setHiddenTiles(list(f.all).filter((k) => !show.has(k)));
        go('/settings/tiles', 'ok', 'Tiles saved.');
        return;
      }
      if (tab === 'sessions' && parts.length === 2) {
        const idleMinutes = {};
        for (const k of Object.keys(f)) if (k.startsWith('idle_')) idleMinutes[k.slice(5)] = f[k];
        config.setSessionTimes({ idleMinutes, lockMinutes: f.lockMinutes });
        go('/settings/sessions', 'ok', 'Login times saved.');
        return;
      }
      errorOut(req, res, a, 404, 'Not found', 'There is no such page.');
    } catch (err) {
      if (err instanceof UserError || err instanceof ConfigError) go(`/settings/${tab}`, 'error', err.message);
      else throw err;
    }
  }

  // ---------- Wrapper: logging and crash safety ----------

  function handler(req, res) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      let p = req.url;
      try { p = new URL(req.url, 'http://x').pathname; } catch { /* keep raw */ }
      // CONTRACT §8: no query strings (they can hold patient names), no bodies.
      log(JSON.stringify({
        time: new Date().toISOString(), user: req.tdcUser || '-', method: req.method, path: p.slice(0, 200),
        status: res.statusCode, ms: Number((process.hrtime.bigint() - start) / 1000000n),
      }));
    });
    handle(req, res).catch((err) => {
      log(JSON.stringify({ time: new Date().toISOString(), event: 'error', message: String(err && err.message) }));
      if (err && err.status === 413) { H.send(res, 413, 'Too large', 'text/plain'); return; }
      if (!res.headersSent) H.send(res, 500, P.errorPage({ status: 500, title: 'Something went wrong', text: 'Please try again. If it keeps happening, tell Ryan.', loggedIn: false }));
      else res.destroy();
    });
  }

  const sweeper = setInterval(() => {
    sessions.sweep((u) => config.policyFor(users.get(u)));
    limitUser.sweep(); limitIp.sweep();
  }, 60000);
  sweeper.unref();

  return { handler, users, sessions, config, directory, limitUser, limitIp, close: () => clearInterval(sweeper) };
}

module.exports = { createApp };
