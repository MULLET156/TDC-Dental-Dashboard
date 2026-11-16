'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const { selfSigned, csr, newKey } = require('../lib/x509');
const acme = require('../lib/acme');

test('self-signed test certificate parses and works for an HTTPS server', async () => {
  const k = newKey();
  const certPem = selfSigned({ names: ['localhost', '127.0.0.1', '::1'], ...k });
  const c = new crypto.X509Certificate(certPem);
  assert.equal(c.subjectAltName, 'DNS:localhost, IP Address:127.0.0.1, IP Address:0:0:0:0:0:0:0:1');
  assert.ok(c.verify(c.publicKey));
  assert.ok(c.checkHost('localhost'));
  assert.ok(c.checkIP('127.0.0.1'));
  const server = https.createServer({ cert: certPem, key: k.privateKey.export({ type: 'pkcs8', format: 'pem' }) }, (q, s) => s.end('ok'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const body = await new Promise((resolve, reject) => {
    https.get({ host: '127.0.0.1', port: server.address().port, path: '/', ca: certPem }, (res) => {
      let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => resolve(t));
    }).on('error', reject);
  });
  server.close();
  assert.equal(body, 'ok');
});

test('certificate request (CSR) is a valid PKCS#10 DER structure', () => {
  const k = newKey();
  const der = csr({ names: ['office.toledodentalcare.com'], ...k });
  assert.equal(der[0], 0x30);
  assert.ok(der.includes(Buffer.from('office.toledodentalcare.com')));
});

test('DNS-01 TXT value follows RFC 8555 (sha256 of token.thumbprint)', () => {
  const jwk = { crv: 'P-256', kty: 'EC', x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU', y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0' };
  const tp = acme.thumbprint(jwk);
  assert.equal(tp, crypto.createHash('sha256').update('{"crv":"P-256","kty":"EC","x":"f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU","y":"x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0"}').digest('base64url'));
  assert.equal(acme.dnsTxtValue('tok', jwk), crypto.createHash('sha256').update(`tok.${tp}`).digest('base64url'));
});

// A pretend Let's Encrypt that checks every signature and nonce, so the
// whole order → DNS challenge → finalize → download flow is exercised.
function fakeAcmeServer() {
  const nonces = new Set();
  const accounts = new Map();
  const state = { txt: null, expectTxt: null, badNonceOnce: true, csrSeen: false, domain: null };
  let base;
  const newNonce = () => { const n = crypto.randomBytes(12).toString('base64url'); nonces.add(n); return n; };

  const server = http.createServer((req, res) => {
    const send = (status, obj, headers = {}) => {
      res.writeHead(status, { 'Replay-Nonce': newNonce(), 'Content-Type': typeof obj === 'string' ? 'application/pem-certificate-chain' : 'application/json', ...headers });
      res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
    };
    if (req.url === '/dir') { send(200, { newNonce: `${base}/nonce`, newAccount: `${base}/acct`, newOrder: `${base}/order` }); return; }
    if (req.url === '/nonce') { res.writeHead(200, { 'Replay-Nonce': newNonce() }); res.end(); return; }
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const jws = JSON.parse(raw);
      const prot = JSON.parse(Buffer.from(jws.protected, 'base64url'));
      assert.equal(prot.alg, 'ES256');
      assert.equal(prot.url, base + req.url);
      if (state.badNonceOnce && req.url === '/order') {
        state.badNonceOnce = false; nonces.delete(prot.nonce);
        send(400, { type: 'urn:ietf:params:acme:error:badNonce', detail: 'try again' }); return;
      }
      assert.ok(nonces.delete(prot.nonce), 'nonce used once');
      const key = prot.jwk ? crypto.createPublicKey({ key: prot.jwk, format: 'jwk' }) : accounts.get(prot.kid);
      assert.ok(key, 'known account');
      const ok = crypto.verify('sha256', Buffer.from(`${jws.protected}.${jws.payload}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(jws.signature, 'base64url'));
      assert.ok(ok, 'JWS signature valid');
      const payload = jws.payload ? JSON.parse(Buffer.from(jws.payload, 'base64url')) : '';

      if (req.url === '/acct') {
        assert.equal(payload.termsOfServiceAgreed, true);
        const kid = `${base}/acct/1`; accounts.set(kid, key);
        state.jwk = prot.jwk;
        send(201, { status: 'valid' }, { Location: kid }); return;
      }
      if (req.url === '/order') {
        state.domain = payload.identifiers[0].value;
        send(201, { status: 'pending', authorizations: [`${base}/authz/1`], finalize: `${base}/finalize/1` }, { Location: `${base}/order/1` }); return;
      }
      if (req.url === '/authz/1') {
        const status = state.challenged && state.txt === acme.dnsTxtValue('token-123', state.jwk) ? 'valid' : 'pending';
        send(200, { status, identifier: { type: 'dns', value: state.domain }, challenges: [{ type: 'http-01', url: `${base}/chall/0`, token: 'x' }, { type: 'dns-01', url: `${base}/chall/1`, token: 'token-123' }] }); return;
      }
      if (req.url === '/chall/1') { state.challenged = true; send(200, { status: 'processing' }); return; }
      if (req.url === '/finalize/1') {
        const der = Buffer.from(payload.csr, 'base64url');
        assert.equal(der[0], 0x30); state.csrSeen = true;
        send(200, { status: 'processing' }); return;
      }
      if (req.url === '/order/1') { send(200, { status: state.csrSeen ? 'valid' : 'processing', certificate: `${base}/cert/1` }); return; }
      if (req.url === '/cert/1') {
        const k = newKey();
        send(200, selfSigned({ names: [state.domain], ...k })); return;
      }
      send(404, { detail: 'no' });
    });
  });
  return {
    state,
    start: () => new Promise((r) => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(`${base}/dir`); })),
    stop: () => server.close(),
  };
}

test('ACME client: full DNS-01 flow against a pretend Let\'s Encrypt', async (t) => {
  const fake = fakeAcmeServer();
  const dir = await fake.start();
  t.after(() => fake.stop());
  const { privateKey } = newKey();
  const client = new acme.AcmeClient({ directoryUrl: dir, accountKey: privateKey });
  const published = [];
  const { certPem, keyPem } = await client.issue({
    domain: 'office.toledodentalcare.com', email: 'test@example.com',
    dnsProvider: { set: async (name, value) => { published.push(name); fake.state.txt = value; } },
    waitForDns: async () => {},
    pollWaitMs: 10,
  });
  assert.deepEqual(published, ['_acme-challenge.office.toledodentalcare.com']);
  const c = new crypto.X509Certificate(certPem);
  assert.ok(c.checkHost('office.toledodentalcare.com'));
  assert.match(keyPem, /BEGIN PRIVATE KEY/);
});

test('ACME client: a wrong DNS value is refused', async (t) => {
  const fake = fakeAcmeServer();
  const dir = await fake.start();
  t.after(() => fake.stop());
  const { privateKey } = newKey();
  const client = new acme.AcmeClient({ directoryUrl: dir, accountKey: privateKey });
  await assert.rejects(client.issue({
    domain: 'office.toledodentalcare.com',
    dnsProvider: { set: async () => { fake.state.txt = 'wrong'; } },
    waitForDns: async () => {}, pollWaitMs: 1,
  }), /too long/);
});
