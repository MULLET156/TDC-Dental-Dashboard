'use strict';
// Makes a self-signed HTTPS certificate for testing the Dashboard on THIS
// computer (https://127.0.0.1:8443). Browsers will show a warning for it;
// that's normal for testing. Staff never use this certificate: the office
// server uses a real Let's Encrypt certificate (see docs/CERTIFICATE.md).
//
//   node scripts/make-dev-cert.js            → certs/dev-cert.pem + certs/dev-key.pem
//   node scripts/make-dev-cert.js --force    → replace existing files
//   node scripts/make-dev-cert.js --name tdc-test.local   → add another name
const fs = require('node:fs');
const path = require('node:path');
const { selfSigned, newKey } = require('../lib/x509');

const args = process.argv.slice(2);
const dir = path.join(__dirname, '..', 'certs');
const certFile = path.join(dir, 'dev-cert.pem');
const keyFile = path.join(dir, 'dev-key.pem');

if (fs.existsSync(certFile) && !args.includes('--force')) {
  console.log('A test certificate already exists in certs\\. Use --force to make a new one.');
  process.exit(0);
}

const names = ['localhost', '127.0.0.1', '::1'];
for (let i = 0; i < args.length; i++) if (args[i] === '--name' && args[i + 1]) names.push(args[++i]);

const { privateKey, publicKey } = newKey();
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(certFile, selfSigned({ names, privateKey, publicKey }));
console.log(`Made a test certificate for ${names.join(', ')} (valid 2 years):\n  ${certFile}\n  ${keyFile}`);
