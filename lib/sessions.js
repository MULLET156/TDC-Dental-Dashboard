'use strict';
// Login sessions, kept in memory (restarting the server logs everyone out).
//
// CONTRACT §3: a session ends 12 hours after login, or after the user's
// idle time (set per role in Settings, default 30 minutes).
// Quick lock: a user who has a PIN is locked after a shorter idle time
// (default 5 minutes) or by tapping "Lock". They unlock with the PIN.
// Five wrong PINs end the session.
const crypto = require('node:crypto');

const ABSOLUTE_MS = 12 * 60 * 60 * 1000;
const MAX_PIN_FAILS = 5;

class Sessions {
  constructor({ now = () => Date.now() } = {}) {
    this.map = new Map();
    this.now = now;
  }

  create(username) {
    const id = crypto.randomBytes(32).toString('base64url');
    const t = this.now();
    const s = { id, username, created: t, lastActive: t, locked: false, pinFails: 0 };
    this.map.set(id, s);
    return s;
  }

  get(id) {
    if (typeof id !== 'string' || id.length > 100) return null;
    return this.map.get(id) || null;
  }

  // Returns 'ok', 'locked' or 'expired'. Expired sessions are deleted.
  // policy = { idleMs, lockMs } for this user (lockMs 0 = no auto-lock).
  check(s, policy) {
    const t = this.now();
    if (t - s.created > ABSOLUTE_MS || t - s.lastActive > policy.idleMs) {
      this.map.delete(s.id);
      return 'expired';
    }
    if (!s.locked && policy.lockMs > 0 && t - s.lastActive > policy.lockMs) s.locked = true;
    return s.locked ? 'locked' : 'ok';
  }

  touch(s) { s.lastActive = this.now(); }
  lock(s) { s.locked = true; }
  unlock(s) { s.locked = false; s.pinFails = 0; s.lastActive = this.now(); }

  // Records a wrong PIN. Returns true if the session has now been ended.
  pinFailed(s) {
    s.pinFails += 1;
    if (s.pinFails >= MAX_PIN_FAILS) { this.map.delete(s.id); return true; }
    return false;
  }

  destroy(id) { this.map.delete(id); }
  destroyUser(username) {
    for (const [id, s] of this.map) if (s.username === username) this.map.delete(id);
  }

  sweep(policyFor) {
    for (const s of this.map.values()) this.check(s, policyFor(s.username));
  }
}

module.exports = { Sessions, ABSOLUTE_MS, MAX_PIN_FAILS };
