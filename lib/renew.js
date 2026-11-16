'use strict';
// Automatic certificate renewal, run inside the Dashboard (live stage).
// Once a day: if the certificate has fewer than 30 days left, get a new one
// from Let's Encrypt through acme-dns. server.js reloads the new files.
const fs = require('node:fs');
const path = require('node:path');
const acme = require('./acme');

function logLine(obj) { console.log(JSON.stringify({ time: new Date().toISOString(), ...obj })); }

async function renewIfNeeded({ root, env, certFile, keyFile, force = false }) {
  const left = acme.daysLeft(certFile);
  if (!force && left > 30) return { renewed: false, daysLeft: Math.floor(left) };
  const dataDir = path.resolve(root, env.DATA_DIR || 'data');
  const acmeDir = path.join(dataDir, 'acme');
  let creds;
  try { creds = JSON.parse(fs.readFileSync(path.join(acmeDir, 'acme-dns.json'), 'utf8')); } catch {
    throw new Error('Automatic renewal needs the acme-dns setup (run: npm run get-cert -- setup).');
  }
  const client = new acme.AcmeClient({
    directoryUrl: env.ACME_DIRECTORY || acme.DIRECTORIES.production,
    accountKey: acme.loadOrMakeAccountKey(acmeDir),
    log: (m) => logLine({ event: 'certificate', message: m }),
  });
  const { certPem, keyPem } = await client.issue({
    domain: env.ACME_DOMAIN, email: env.ACME_EMAIL,
    dnsProvider: acme.acmeDnsProvider({ api: creds.api, creds }),
  });
  acme.writeCert({ certFile, keyFile, certPem, keyPem });
  return { renewed: true, daysLeft: Math.floor(acme.daysLeft(certFile)) };
}

function scheduleRenewal(opts) {
  const run = () => renewIfNeeded(opts)
    .then((r) => { if (r.renewed) logLine({ event: 'certificate-renewed', daysLeft: r.daysLeft }); })
    .catch((err) => logLine({ event: 'certificate-renewal-failed', message: err.message }));
  setTimeout(run, 60 * 1000).unref(); // shortly after start
  setInterval(run, 24 * 60 * 60 * 1000).unref(); // then daily
}

module.exports = { renewIfNeeded, scheduleRenewal };
