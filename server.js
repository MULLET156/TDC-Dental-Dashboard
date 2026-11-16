'use strict';
// TDC Office — Dental Dashboard. Start with `npm start` (or start.cmd on Windows).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');

const ROOT = __dirname;
require('./lib/env').loadEnv(path.join(ROOT, '.env'));
const { createApp } = require('./lib/app');
const pkg = require('./package.json');

const env = process.env;
const stage = env.TDC_STAGE || 'design';
if (!['design', 'live'].includes(stage)) fail('TDC_STAGE must be "design" or "live".');

const tls = (env.TLS || 'on').toLowerCase() !== 'off';
const port = Number(env.PORT || (tls ? 8443 : 3000));
const host = env.HOST || (stage === 'live' && port === 443 ? '0.0.0.0' : '127.0.0.1');
// "~/" means the home folder. On Hostinger, DATA_DIR must be outside the app
// folder, because every deploy replaces the app folder (docs/HOSTINGER.md).
const expandHome = (p) => (p && /^~[\\/]/.test(p) ? path.join(require('node:os').homedir(), p.slice(2)) : p);
const dataDir = path.resolve(ROOT, expandHome(env.DATA_DIR) || 'data');
const certFile = path.resolve(ROOT, env.TLS_CERT || 'certs/dev-cert.pem');
const keyFile = path.resolve(ROOT, env.TLS_KEY || 'certs/dev-key.pem');

function fail(text) {
  console.error(`\nCannot start the Dashboard: ${text}\n`);
  process.exit(1);
}

function readTls() {
  try { return { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }; } catch {
    fail(`the HTTPS certificate files were not found:\n  ${certFile}\n  ${keyFile}\n` +
      'For testing on this computer, run:  node scripts/make-dev-cert.js\n' +
      'For the office server, see docs/CERTIFICATE.md. (On Hostinger, set TLS=off; Hostinger provides HTTPS.)');
  }
}

const app = createApp({
  stage, dataDir, tls,
  trustProxy: env.TRUST_PROXY === '1',
  publicUrl: env.PUBLIC_URL || '',
  setupCode: env.SETUP_CODE || '',
  version: pkg.version,
});

let server;
if (tls) {
  server = https.createServer({ ...readTls(), minVersion: 'TLSv1.2' }, app.handler);
  // Pick up a renewed certificate without a restart.
  let stamp = fileStamp(certFile);
  setInterval(() => {
    const s = fileStamp(certFile);
    if (s && s !== stamp) {
      try { server.setSecureContext({ ...readTls(), minVersion: 'TLSv1.2' }); stamp = s; console.log(JSON.stringify({ time: new Date().toISOString(), event: 'certificate-reloaded' })); } catch (e) { console.error('Certificate reload failed:', e.message); }
    }
  }, 60 * 60 * 1000).unref();
  if (env.ACME_DOMAIN) require('./lib/renew').scheduleRenewal({ root: ROOT, env, certFile, keyFile });
} else {
  server = http.createServer(app.handler);
}
server.requestTimeout = 10 * 60 * 1000; // big audio uploads on slow Wi-Fi
server.headersTimeout = 60 * 1000;

function fileStamp(f) { try { return String(fs.statSync(f).mtimeMs); } catch { return null; } }

// Optional built-in sample module (DEMO_HELLO=1), so there's something to
// see on a fresh install. It runs inside this process and never listens on a
// port of its own: Hostinger allows only one listening server per app.
async function startDemo() {
  if (env.DEMO_HELLO !== '1') return;
  const { createHelloServer } = require('./examples/hello-module/server');
  const secret = crypto.randomBytes(32).toString('hex');
  const hello = createHelloServer({ secret, stage, log: () => {} });
  app.config.extraModules.push({
    id: 'hello', name: 'Hello (sample)', baseUrl: 'http://in-process', secret, enabled: true, builtIn: true, inProcess: hello,
  });
}

// The Dashboard is the only server that listens on a port.
server.listen(port, host, () => {
  const shown = host === '0.0.0.0' ? 'this server\'s address' : host;
  console.log(`TDC Dashboard ${pkg.version} (${stage} stage) is running: ${tls ? 'https' : 'http'}://${shown}:${port}/`);
  if (app.users.count() === 0) {
    console.log(env.SETUP_CODE
      ? 'First run: open the address above and create the owner account. You will need the SETUP_CODE from your settings.'
      : `First run: open the address above and create the owner account. The setup code is in ${path.join(dataDir, 'SETUP-CODE.txt')}`);
  }
  startDemo().catch((err) => console.error(`The sample module did not start: ${err.message}`));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') fail(`port ${port} is already in use. Is the Dashboard already running?`);
  if (err.code === 'EACCES') fail(`not allowed to use port ${port}. Port 443 needs the Dashboard to run as a Windows service or as administrator.`);
  fail(err.message);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); app.close(); process.exit(0); });
