'use strict';
// Just enough ASN.1/DER to make (1) a self-signed certificate for testing
// on this computer and (2) a certificate request (CSR) for Let's Encrypt,
// using only Node.js built-ins. Keys are ECDSA P-256.
const crypto = require('node:crypto');
const net = require('node:net');

function len(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag, content) => Buffer.concat([Buffer.from([tag]), len(content.length), content]);
const seq = (...items) => tlv(0x30, Buffer.concat(items));
const set = (...items) => tlv(0x31, Buffer.concat(items));
const ctx = (n, content) => tlv(0xa0 + n, content); // [n] constructed (EXPLICIT)

function int(buf) {
  if (typeof buf === 'number') {
    const b = [];
    let n = buf;
    do { b.unshift(n & 0xff); n = Math.floor(n / 256); } while (n > 0);
    buf = Buffer.from(b);
  }
  if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0]), buf]);
  return tlv(0x02, buf);
}
const bitString = (buf) => tlv(0x03, Buffer.concat([Buffer.from([0]), buf]));
const octets = (buf) => tlv(0x04, buf);
const bool = (v) => tlv(0x01, Buffer.from([v ? 0xff : 0]));
const utf8 = (s) => tlv(0x0c, Buffer.from(s, 'utf8'));

function oid(str) {
  const parts = str.split('.').map(Number);
  const out = [40 * parts[0] + parts[1]];
  for (const p of parts.slice(2)) {
    const b = [];
    let n = p;
    do { b.unshift(n & 0x7f); n >>= 7; } while (n > 0);
    for (let i = 0; i < b.length - 1; i++) b[i] |= 0x80;
    out.push(...b);
  }
  return tlv(0x06, Buffer.from(out));
}

function time(d) {
  const iso = d.toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
  return d.getUTCFullYear() < 2050 ? tlv(0x17, Buffer.from(iso.slice(2) + 'Z')) : tlv(0x18, Buffer.from(iso + 'Z'));
}

const OID = {
  ecdsaSha256: '1.2.840.10045.4.3.2',
  cn: '2.5.4.3', o: '2.5.4.10',
  san: '2.5.29.17', basic: '2.5.29.19', keyUsage: '2.5.29.15', extKeyUsage: '2.5.29.37', serverAuth: '1.3.6.1.5.5.7.3.1',
  extensionRequest: '1.2.840.113549.1.9.14',
};
const SIG_ALG = seq(oid(OID.ecdsaSha256));

function name(cn) { return seq(set(seq(oid(OID.cn), utf8(cn)))); }

function sanExt(names) {
  const entries = names.map((n) => {
    if (net.isIPv4(n)) return tlv(0x87, Buffer.from(n.split('.').map(Number)));
    if (net.isIPv6(n)) return tlv(0x87, ipv6Bytes(n));
    return tlv(0x82, Buffer.from(n, 'ascii'));
  });
  return seq(oid(OID.san), octets(seq(...entries)));
}

function ipv6Bytes(ip) {
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
  return Buffer.from(groups.flatMap((g) => { const n = parseInt(g || '0', 16); return [n >> 8, n & 0xff]; }));
}

function newKey() {
  return crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
}

function spki(publicKey) { return publicKey.export({ type: 'spki', format: 'der' }); }
function sign(privateKey, data) { return crypto.sign('sha256', data, privateKey); } // DER ECDSA signature

function pem(label, der) {
  const b64 = der.toString('base64').match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

// Self-signed certificate for testing (browsers will warn; that's expected).
function selfSigned({ names, days = 730, privateKey, publicKey }) {
  const now = new Date();
  const serial = crypto.randomBytes(16); serial[0] &= 0x7f;
  const tbs = seq(
    ctx(0, int(2)), // v3
    int(serial),
    SIG_ALG,
    name(`TDC Office test (${names[0]})`),
    seq(time(new Date(now.getTime() - 60000)), time(new Date(now.getTime() + days * 86400000))),
    name(`TDC Office test (${names[0]})`),
    spki(publicKey),
    ctx(3, seq(
      sanExt(names),
      seq(oid(OID.basic), bool(true), octets(seq())), // CA:FALSE
      seq(oid(OID.keyUsage), bool(true), octets(tlv(0x03, Buffer.from([0x07, 0x80])))), // digitalSignature
      seq(oid(OID.extKeyUsage), octets(seq(oid(OID.serverAuth)))),
    )),
  );
  return pem('CERTIFICATE', seq(tbs, SIG_ALG, bitString(sign(privateKey, tbs))));
}

// Certificate request (PKCS#10) in DER, for ACME finalize.
function csr({ names, privateKey, publicKey }) {
  const info = seq(
    int(0),
    name(names[0]),
    spki(publicKey),
    ctx(0, seq(oid(OID.extensionRequest), set(seq(sanExt(names))))),
  );
  return seq(info, SIG_ALG, bitString(sign(privateKey, info)));
}

module.exports = { selfSigned, csr, newKey, pem };
