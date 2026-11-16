'use strict';
// Dashboard settings (data/config.json, never committed): modules, links
// to other apps, hidden tiles, session timing. Module secrets live here.
const { JsonFile } = require('./store');
const { ROLES } = require('./users');
const { SECRET_RE } = require('./sign');

const MODULE_ID_RE = /^[a-z][a-z0-9-]{1,30}$/;
const RESERVED_IDS = new Set(['api', 'shared', 'settings', 'login', 'logout', 'setup', 'lock', 'account']);

function defaults() {
  return {
    version: 1,
    modules: [],
    links: [
      { id: 'lab', name: 'Lab Tracker', url: '', icon: 'tooth' },
      { id: 'supply', name: 'Supply Room', url: '', icon: 'box' },
      { id: 'maintenance', name: 'Maintenance Tracker', url: '', icon: 'wrench' },
    ],
    hiddenTiles: [],
    sessions: {
      idleMinutes: Object.fromEntries(ROLES.map((r) => [r, 30])),
      lockMinutes: 5,
    },
  };
}

class ConfigError extends Error {}

function checkUrl(url, { stage, allowEmpty = false, originOnly = false }) {
  url = String(url || '').trim();
  if (!url && allowEmpty) return '';
  let u;
  try { u = new URL(url); } catch { throw new ConfigError('Please enter a full web address, starting with https:// or http://'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new ConfigError('Address must start with https:// or http://');
  if (u.username || u.password) throw new ConfigError('Address must not contain a user name or password.');
  if (stage === 'design' && u.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) {
    throw new ConfigError('In the design stage, module addresses on the internet must use https://');
  }
  if (originOnly) {
    if (u.pathname !== '/' || u.search || u.hash) throw new ConfigError('Module address must be just the site, with nothing after it (for example https://daysheet-dev.example.com or http://127.0.0.1:3101).');
    return u.origin;
  }
  return u.toString().replace(/\/+$/, '');
}

class Config {
  constructor(file, { stage }) {
    this.store = new JsonFile(file, defaults());
    this.stage = stage;
    this.extraModules = []; // in-memory only (the built-in demo module)
  }

  get data() {
    const d = this.store.load();
    const def = defaults();
    for (const k of Object.keys(def)) if (d[k] === undefined) d[k] = def[k];
    return d;
  }
  save() { this.store.save(); }

  modules() { return [...this.data.modules, ...this.extraModules]; }
  module(id) { return this.modules().find((m) => m.id === id) || null; }

  saveModule({ id, name, baseUrl, secret, enabled }, { isNew }) {
    id = String(id || '').trim().toLowerCase();
    if (!MODULE_ID_RE.test(id) || RESERVED_IDS.has(id)) throw new ConfigError('Module id must be 2–31 lowercase letters, numbers or dashes, starting with a letter (for example "daysheet").');
    const list = this.data.modules;
    let m = list.find((x) => x.id === id);
    if (isNew && (m || this.extraModules.some((x) => x.id === id))) throw new ConfigError('A module with that id already exists.');
    if (!isNew && !m) throw new ConfigError('No such module.');
    const url = checkUrl(baseUrl, { stage: this.stage, originOnly: true });
    const cleanName = String(name || '').trim().slice(0, 60) || id;
    if (secret !== undefined && secret !== '') {
      secret = String(secret).trim().toLowerCase();
      if (!SECRET_RE.test(secret)) throw new ConfigError('The secret must be at least 64 hex characters (0–9, a–f). Use "Make a new secret" if you don\'t have one.');
    }
    if (!m) { m = { id, secret: '' }; list.push(m); }
    m.name = cleanName;
    m.baseUrl = url;
    m.enabled = enabled !== false;
    if (secret) m.secret = secret;
    this.save();
    return m;
  }

  removeModule(id) {
    const list = this.data.modules;
    const i = list.findIndex((m) => m.id === id);
    if (i < 0) throw new ConfigError('No such module.');
    list.splice(i, 1);
    this.save();
  }

  saveLinks(entries) {
    for (const link of this.data.links) {
      if (entries[link.id] !== undefined) {
        link.url = checkUrl(entries[link.id], { stage: 'live', allowEmpty: true });
        if (link.url && !link.url.startsWith('https://')) throw new ConfigError(`${link.name}: please use an https:// address.`);
      }
    }
    this.save();
  }

  setHiddenTiles(keys) {
    this.data.hiddenTiles = [...new Set(keys.filter((k) => /^[a-z0-9-]+\/[A-Za-z0-9_-]+$/.test(k)))];
    this.save();
  }

  setSessionTimes({ idleMinutes, lockMinutes }) {
    const s = this.data.sessions;
    for (const r of ROLES) {
      const v = Number(idleMinutes[r]);
      if (!Number.isInteger(v) || v < 5 || v > 720) throw new ConfigError('Idle times must be whole minutes between 5 and 720.');
      s.idleMinutes[r] = v;
    }
    const l = Number(lockMinutes);
    if (!Number.isInteger(l) || l < 0 || l > 120) throw new ConfigError('Lock time must be whole minutes between 0 and 120.');
    s.lockMinutes = l;
    this.save();
  }

  // The strictest (shortest) idle time among the user's roles.
  policyFor(user) {
    const s = this.data.sessions;
    const mins = (user?.roles || []).map((r) => s.idleMinutes[r] ?? 30);
    const idle = mins.length ? Math.min(...mins) : 30;
    const lock = user?.pinHash ? s.lockMinutes : 0;
    return { idleMs: idle * 60000, lockMs: Math.min(lock, idle) * 60000 };
  }
}

module.exports = { Config, ConfigError, MODULE_ID_RE, checkUrl };
