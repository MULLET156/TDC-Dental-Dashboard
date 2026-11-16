'use strict';
// A small ACME (RFC 8555) client for Let's Encrypt, using the DNS-01
// challenge, written with Node.js built-ins only. The office server never
// has to be reachable from the internet: Let's Encrypt checks a TXT record
// in DNS instead.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns');
const { csr: makeCsr, newKey, pem } = require('./x509');

const DIRECTORIES = {
  production: 'https://acme-v02.api.letsencrypt.org/directory',
  staging: 'https://acme-staging-v02.api.letsencrypt.org/directory',
};

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function jwkOf(publicKey) {
  const j = publicKey.export({ format: 'jwk' });
  return { crv: j.crv, kty: j.kty, x: j.x, y: j.y }; // members in the order RFC 7638 needs
}
function thumbprint(jwk) {
  return b64u(crypto.createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest());
}
// The TXT record value for a DNS-01 challenge.
function dnsTxtValue(token, jwk) {
  return b64u(crypto.createHash('sha256').update(`${token}.${thumbprint(jwk)}`).digest());
}

class AcmeError extends Error {}

class AcmeClient {
  constructor({ directoryUrl, accountKey, fetchImpl = fetch, log = () => {} }) {
    this.directoryUrl = directoryUrl;
    this.key = accountKey; // KeyObject (private, EC P-256)
    this.jwk = jwkOf(crypto.createPublicKey(accountKey));
    this.fetch = fetchImpl;
    this.log = log;
    this.kid = null;
    this.nonce = null;
  }

  async directory() {
    if (!this.dir) {
      const r = await this.fetch(this.directoryUrl);
      if (!r.ok) throw new AcmeError(`Could not reach Let's Encrypt (${r.status}).`);
      this.dir = await r.json();
    }
    return this.dir;
  }

  async newNonce() {
    const r = await this.fetch((await this.directory()).newNonce, { method: 'HEAD' });
    return r.headers.get('replay-nonce');
  }

  async post(url, payload, { useJwk = false, retry = true } = {}) {
    const nonce = this.nonce || await this.newNonce();
    this.nonce = null;
    const protectedHeader = { alg: 'ES256', nonce, url, ...(useJwk ? { jwk: this.jwk } : { kid: this.kid }) };
    const p = b64u(JSON.stringify(protectedHeader));
    const pl = payload === '' ? '' : b64u(JSON.stringify(payload));
    const sig = crypto.sign('sha256', Buffer.from(`${p}.${pl}`), { key: this.key, dsaEncoding: 'ieee-p1363' });
    const r = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/jose+json' },
      body: JSON.stringify({ protected: p, payload: pl, signature: b64u(sig) }),
    });
    this.nonce = r.headers.get('replay-nonce');
    const type = r.headers.get('content-type') || '';
    const body = type.includes('json') ? await r.json() : await r.text();
    if (!r.ok) {
      if (retry && body && body.type === 'urn:ietf:params:acme:error:badNonce') return this.post(url, payload, { useJwk, retry: false });
      throw new AcmeError(`Let's Encrypt said: ${body && body.detail ? body.detail : r.status}`);
    }
    return { body, location: r.headers.get('location'), headers: r.headers };
  }

  async account(email) {
    const dir = await this.directory();
    const payload = { termsOfServiceAgreed: true, ...(email ? { contact: [`mailto:${email}`] } : {}) };
    const r = await this.post(dir.newAccount, payload, { useJwk: true });
    this.kid = r.location;
    return this.kid;
  }

  async poll(url, done, { tries = 30, waitMs = 3000 } = {}) {
    for (let i = 0; i < tries; i++) {
      const { body } = await this.post(url, '');
      if (done(body)) return body;
      if (body.status === 'invalid') {
        const why = body.error?.detail || body.challenges?.find((c) => c.error)?.error?.detail || 'no reason given';
        throw new AcmeError(`Let's Encrypt refused: ${why}`);
      }
      await sleep(waitMs);
    }
    throw new AcmeError('Let\'s Encrypt took too long to answer.');
  }

  // Gets a certificate for `domain`. `dnsProvider.set(name, value)` must
  // publish the TXT record; `waitForDns` confirms it is visible.
  async issue({ domain, email, dnsProvider, waitForDns = defaultWaitForDns, pollWaitMs = 3000 }) {
    if (!this.kid) await this.account(email);
    const dir = await this.directory();
    this.log(`Asking Let's Encrypt for a certificate for ${domain}…`);
    const order = await this.post(dir.newOrder, { identifiers: [{ type: 'dns', value: domain }] });
    const orderUrl = order.location;

    for (const authUrl of order.body.authorizations) {
      const { body: auth } = await this.post(authUrl, '');
      if (auth.status === 'valid') continue;
      const ch = auth.challenges.find((c) => c.type === 'dns-01');
      if (!ch) throw new AcmeError('Let\'s Encrypt did not offer a DNS challenge.');
      const value = dnsTxtValue(ch.token, this.jwk);
      const recordName = `_acme-challenge.${auth.identifier.value}`;
      this.log(`Publishing the DNS check record (${recordName})…`);
      await dnsProvider.set(recordName, value);
      await waitForDns(recordName, value, this.log);
      await this.post(ch.url, {});
      await this.poll(authUrl, (b) => b.status === 'valid', { waitMs: pollWaitMs });
      this.log('Let\'s Encrypt confirmed the DNS record.');
    }

    const certKey = newKey();
    const der = makeCsr({ names: [domain], ...certKey });
    const fin = await this.post(order.body.finalize, { csr: b64u(der) });
    const done = fin.body.status === 'valid' ? fin.body : await this.poll(orderUrl, (b) => b.status === 'valid', { waitMs: pollWaitMs });
    const certRes = await this.fetch(done.certificate, {
      method: 'POST',
      headers: { 'Content-Type': 'application/jose+json', Accept: 'application/pem-certificate-chain' },
      body: await this.signedBody(done.certificate, ''),
    });
    if (!certRes.ok) throw new AcmeError(`Could not download the certificate (${certRes.status}).`);
    const chain = await certRes.text();
    return { certPem: chain, keyPem: certKey.privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  }

  async signedBody(url, payload) {
    const nonce = this.nonce || await this.newNonce();
    this.nonce = null;
    const p = b64u(JSON.stringify({ alg: 'ES256', nonce, url, kid: this.kid }));
    const pl = payload === '' ? '' : b64u(JSON.stringify(payload));
    const sig = crypto.sign('sha256', Buffer.from(`${p}.${pl}`), { key: this.key, dsaEncoding: 'ieee-p1363' });
    return JSON.stringify({ protected: p, payload: pl, signature: b64u(sig) });
  }
}

// Wait until public DNS servers show the TXT record (up to ~5 minutes).
async function defaultWaitForDns(name, value, log = () => {}) {
  const resolver = new dns.promises.Resolver();
  resolver.setServers(['1.1.1.1', '8.8.8.8']);
  for (let i = 0; i < 30; i++) {
    try {
      const recs = await resolver.resolveTxt(name);
      if (recs.some((parts) => parts.join('') === value)) { await sleep(10000); return; }
    } catch { /* not there yet */ }
    if (i === 0) log('Waiting for the DNS record to show up (this can take a few minutes)…');
    await sleep(10000);
  }
  throw new AcmeError(`The DNS record ${name} did not show up in time. Check the one-time DNS setup (docs/CERTIFICATE.md).`);
}

// ---------- DNS providers ----------

// acme-dns (https://github.com/joohoi/acme-dns): after a one-time CNAME
// record, the TXT value is updated through a small web API. This is what
// makes renewal fully automatic.
function acmeDnsProvider({ api, creds, fetchImpl = fetch }) {
  return {
    async set(_name, value) {
      const r = await fetchImpl(`${api}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-User': creds.username, 'X-Api-Key': creds.password },
        body: JSON.stringify({ subdomain: creds.subdomain, txt: value }),
      });
      if (!r.ok) throw new AcmeError(`The acme-dns service refused the update (${r.status}).`);
    },
  };
}
async function acmeDnsRegister(api, fetchImpl = fetch) {
  const r = await fetchImpl(`${api}/register`, { method: 'POST' });
  if (!r.ok) throw new AcmeError(`Could not register with ${api} (${r.status}).`);
  const j = await r.json();
  return { username: j.username, password: j.password, subdomain: j.subdomain, fulldomain: j.fulldomain, api };
}

// Manual: you add the TXT record at your DNS provider by hand. Fine for a
// first test; renewal then needs you each time, so use acme-dns for real.
function manualProvider({ ask }) {
  return {
    async set(name, value) {
      await ask(`\nAdd this TXT record at your DNS provider (GoDaddy):\n  Name:  ${name}\n  Value: ${value}\nThen press Enter here.`);
    },
  };
}

// ---------- Files under data/acme ----------

function loadOrMakeAccountKey(dir) {
  const f = path.join(dir, 'account-key.pem');
  try { return crypto.createPrivateKey(fs.readFileSync(f)); } catch { /* make one */ }
  fs.mkdirSync(dir, { recursive: true });
  const { privateKey } = newKey();
  fs.writeFileSync(f, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  return privateKey;
}

function writeCert({ certFile, keyFile, certPem, keyPem }) {
  fs.mkdirSync(path.dirname(certFile), { recursive: true });
  // Key first, then cert, each via temp file + rename.
  for (const [f, data, mode] of [[keyFile, keyPem, 0o600], [certFile, certPem, 0o644]]) {
    const tmp = `${f}.tmp`;
    fs.writeFileSync(tmp, data, { mode });
    fs.renameSync(tmp, f);
  }
}

function daysLeft(certFile) {
  try {
    const c = new crypto.X509Certificate(fs.readFileSync(certFile));
    return (new Date(c.validTo).getTime() - Date.now()) / 86400000;
  } catch { return -1; }
}

module.exports = {
  AcmeClient, AcmeError, DIRECTORIES, dnsTxtValue, thumbprint, jwkOf,
  acmeDnsProvider, acmeDnsRegister, manualProvider, defaultWaitForDns,
  loadOrMakeAccountKey, writeCert, daysLeft, pem,
};
