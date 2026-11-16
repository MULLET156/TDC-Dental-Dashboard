'use strict';
// Failed-login lockout. After `max` failures within `windowMs`, the key
// (a login name or an IP address) is blocked for `blockMs`.
class Limiter {
  constructor({ max, windowMs, blockMs, now = () => Date.now() }) {
    Object.assign(this, { max, windowMs, blockMs, now });
    this.map = new Map();
  }

  // Milliseconds left on a block, or 0 if not blocked.
  blockedFor(key) {
    const e = this.map.get(key);
    if (!e || !e.until) return 0;
    const left = e.until - this.now();
    if (left <= 0) { this.map.delete(key); return 0; }
    return left;
  }

  fail(key) {
    const t = this.now();
    let e = this.map.get(key);
    if (!e || t - e.first > this.windowMs) { e = { first: t, count: 0, until: 0 }; this.map.set(key, e); }
    e.count += 1;
    if (e.count >= this.max) e.until = t + this.blockMs;
  }

  reset(key) { this.map.delete(key); }

  list() {
    const out = [];
    for (const [key] of this.map) {
      const left = this.blockedFor(key);
      if (left) out.push({ key, minutesLeft: Math.ceil(left / 60000) });
    }
    return out;
  }

  sweep() {
    const t = this.now();
    for (const [k, e] of this.map) if (t - e.first > this.windowMs && (!e.until || e.until < t)) this.map.delete(k);
  }
}

module.exports = { Limiter };
