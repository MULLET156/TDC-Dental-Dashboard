'use strict';
// Staff accounts. Passwords and PINs are hashed with scrypt; the plain
// values are never stored or logged.
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { JsonFile } = require('./store');

const scrypt = promisify(crypto.scrypt);
const ROLES = ['owner', 'admin', 'doctor', 'hygienist', 'assistant', 'front'];
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
const USERNAME_RE = /^[a-z][a-z0-9._-]{1,31}$/;
const PIN_RE = /^\d{4,6}$/;
const MIN_PASSWORD = 10;

async function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(secret).normalize('NFKC'), salt, SCRYPT.keylen,
    { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifySecret(secret, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(String(secret).normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length,
    { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// Used when a login names an unknown user, so the response takes about as
// long as a real check and doesn't reveal which usernames exist.
let dummyHash = null;
async function burnTime(secret) {
  if (!dummyHash) dummyHash = await hashSecret('not-a-real-password');
  await verifySecret(secret, dummyHash);
}

function cleanRoles(roles) {
  const list = Array.isArray(roles) ? roles : String(roles || '').split(',');
  return ROLES.filter((r) => list.map((x) => String(x).trim()).includes(r));
}

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (pw.length > 200) return 'Password is too long.';
  return null;
}

class Users {
  constructor(file) {
    this.store = new JsonFile(file, { version: 1, users: [] });
  }

  list() { return this.store.load().users; }
  count() { return this.list().length; }
  get(username) {
    const u = String(username || '').trim().toLowerCase();
    return this.list().find((x) => x.username === u) || null;
  }
  activeOwners() { return this.list().filter((u) => !u.disabled && u.roles.includes('owner')); }

  async create({ username, name, roles, password, pin }) {
    username = String(username || '').trim().toLowerCase();
    if (!USERNAME_RE.test(username)) throw new UserError('Login name must be 2–32 characters: lowercase letters, numbers, dot, dash or underscore, starting with a letter.');
    if (this.get(username)) throw new UserError('That login name is already taken.');
    if (username === 'dashboard') throw new UserError('That login name is reserved.');
    const cleanName = String(name || '').trim().slice(0, 80);
    if (!cleanName) throw new UserError('Please enter a display name.');
    const r = cleanRoles(roles);
    if (!r.length) throw new UserError('Pick at least one role.');
    const pwErr = checkPassword(password);
    if (pwErr) throw new UserError(pwErr);
    if (pin && !PIN_RE.test(pin)) throw new UserError('PIN must be 4 to 6 digits.');
    const now = new Date().toISOString();
    const user = {
      username, name: cleanName, roles: r,
      passwordHash: await hashSecret(password),
      pinHash: pin ? await hashSecret(pin) : null,
      disabled: false, createdAt: now, updatedAt: now,
    };
    this.list().push(user);
    this.store.save();
    return user;
  }

  update(username, changes) {
    const user = this.get(username);
    if (!user) throw new UserError('No such user.');
    if ('name' in changes) {
      const n = String(changes.name || '').trim().slice(0, 80);
      if (!n) throw new UserError('Please enter a display name.');
      user.name = n;
    }
    if ('roles' in changes) {
      const r = cleanRoles(changes.roles);
      if (!r.length) throw new UserError('Pick at least one role.');
      user.roles = r;
    }
    if ('disabled' in changes) user.disabled = !!changes.disabled;
    user.updatedAt = new Date().toISOString();
    this.store.save();
    return user;
  }

  async setPassword(username, password) {
    const user = this.get(username);
    if (!user) throw new UserError('No such user.');
    const err = checkPassword(password);
    if (err) throw new UserError(err);
    user.passwordHash = await hashSecret(password);
    user.updatedAt = new Date().toISOString();
    this.store.save();
  }

  async setPin(username, pin) {
    const user = this.get(username);
    if (!user) throw new UserError('No such user.');
    if (pin && !PIN_RE.test(pin)) throw new UserError('PIN must be 4 to 6 digits.');
    user.pinHash = pin ? await hashSecret(pin) : null;
    user.updatedAt = new Date().toISOString();
    this.store.save();
  }

  remove(username) {
    const list = this.list();
    const i = list.findIndex((u) => u.username === username);
    if (i < 0) throw new UserError('No such user.');
    list.splice(i, 1);
    this.store.save();
  }

  async checkPassword(username, password) {
    const user = this.get(username);
    if (!user || user.disabled) { await burnTime(password); return null; }
    return (await verifySecret(password, user.passwordHash)) ? user : null;
  }

  async checkPin(username, pin) {
    const user = this.get(username);
    if (!user || user.disabled || !user.pinHash) return false;
    return verifySecret(pin, user.pinHash);
  }
}

class UserError extends Error {}

module.exports = { Users, UserError, ROLES, hashSecret, verifySecret, cleanRoles, USERNAME_RE, PIN_RE, MIN_PASSWORD };
