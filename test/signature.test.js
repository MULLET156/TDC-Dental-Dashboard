'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { signature, signedHeaders, verify } = require('../lib/sign');
const { verifyTdcRequest } = require('../examples/hello-module/tdc-verify');

const SECRET = 'a'.repeat(64);

test('signature matches CONTRACT §3 exactly (worked example)', () => {
  const s = signature(SECRET, { time: '1794789000000', method: 'get', pathAndQuery: '/day?date=2026-11-16', user: 'jsmith', roles: 'doctor,owner', base: '/m/daysheet' });
  const msg = '1794789000000\nGET\n/day?date=2026-11-16\njsmith\ndoctor,owner\n/m/daysheet';
  const expected = crypto.createHmac('sha256', SECRET).update(msg).digest('hex');
  assert.equal(s, expected);
  assert.match(s, /^[0-9a-f]{64}$/);
});

function fakeReq(method, url, headers) { return { method, url, headers }; }

test('signed headers verify, in both the Dashboard and the sample module code', () => {
  const now = Date.now();
  const h = signedHeaders(SECRET, { method: 'POST', pathAndQuery: '/draft/7?x=1', user: 'jsmith', name: 'Jane Smith', roles: ['doctor', 'owner'], base: '/m/voice', now });
  assert.equal(h['x-tdc-roles'], 'doctor,owner');
  const req = fakeReq('POST', '/draft/7?x=1', h);
  assert.equal(verify(SECRET, req, now), true);
  assert.deepEqual(verifyTdcRequest(SECRET, req, now), { user: 'jsmith', name: 'Jane Smith', roles: ['doctor', 'owner'], base: '/m/voice' });
});

test('wrong secret, changed fields, and old or future times are rejected', () => {
  const now = Date.now();
  const h = signedHeaders(SECRET, { method: 'GET', pathAndQuery: '/', user: 'u', name: 'U', roles: ['front'], base: '/m/x', now });
  const ok = fakeReq('GET', '/', h);
  assert.ok(verifyTdcRequest(SECRET, ok, now));
  assert.equal(verifyTdcRequest('b'.repeat(64), ok, now), null);
  for (const [k, v] of [['x-tdc-user', 'other'], ['x-tdc-roles', 'owner'], ['x-tdc-base', '/m/y'], ['x-tdc-time', String(now + 1)]]) {
    assert.equal(verifyTdcRequest(SECRET, fakeReq('GET', '/', { ...h, [k]: v }), now), null, k);
  }
  assert.equal(verifyTdcRequest(SECRET, fakeReq('POST', '/', h), now), null, 'method');
  assert.equal(verifyTdcRequest(SECRET, fakeReq('GET', '/?a=1', h), now), null, 'query');
  assert.ok(verifyTdcRequest(SECRET, ok, now + 29000), '29 s is fine');
  assert.equal(verifyTdcRequest(SECRET, ok, now + 31000), null, '31 s too old');
  assert.equal(verifyTdcRequest(SECRET, ok, now - 31000), null, '31 s in the future');
  const { 'x-tdc-sig': _s, ...noSig } = h;
  assert.equal(verifyTdcRequest(SECRET, fakeReq('GET', '/', noSig), now), null);
  assert.equal(verifyTdcRequest(SECRET, fakeReq('GET', '/', { ...h, 'x-tdc-sig': 'zz' }), now), null);
  assert.equal(verifyTdcRequest('', ok, now), null, 'no secret configured = reject');
});

test('names with accents are sent as plain ASCII and decoded by the module', () => {
  const now = Date.now();
  const h = signedHeaders(SECRET, { method: 'GET', pathAndQuery: '/', user: 'jose', name: 'José Núñez', roles: ['front'], base: '/m/x', now });
  assert.match(h['x-tdc-name'], /^[\x20-\x7e]+$/);
  assert.equal(verifyTdcRequest(SECRET, fakeReq('GET', '/', h), now).name, 'José Núñez');
});
