'use strict';
// Gets the real HTTPS certificate for the office server from Let's Encrypt.
// Step by step guide: docs/CERTIFICATE.md
//
//   node scripts/get-cert.js setup              one time: sign up with acme-dns, shows the DNS record to add
//   node scripts/get-cert.js check              checks that DNS record is in place
//   node scripts/get-cert.js issue --staging    practice run (Let's Encrypt test server, not trusted by browsers)
//   node scripts/get-cert.js issue              the real certificate
//   node scripts/get-cert.js issue --manual     no acme-dns: you add a TXT record by hand (renewal won't be automatic)
//
// Reads ACME_DOMAIN, ACME_EMAIL, ACME_DNS_API, TLS_CERT, TLS_KEY and DATA_DIR from .env.
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns');
const readline = require('node:readline');

const ROOT = path.join(__dirname, '..');
require('../lib/env').loadEnv(path.join(ROOT, '.env'));
const acme = require('../lib/acme');

const env = process.env;
const args = process.argv.slice(2);
const cmd = args[0] || 'help';
const domain = env.ACME_DOMAIN;
const api = (env.ACME_DNS_API || 'https://auth.acme-dns.io').replace(/\/+$/, '');
const dataDir = path.resolve(ROOT, env.DATA_DIR || 'data');
const acmeDir = path.join(dataDir, 'acme');
const credsFile = path.join(acmeDir, 'acme-dns.json');

function stop(text) { console.error(`\n${text}\n`); process.exit(1); }
function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(`${q} `, (a) => { rl.close(); r(a); }));
}
function readCreds() { try { return JSON.parse(fs.readFileSync(credsFile, 'utf8')); } catch { return null; } }

async function main() {
  if (cmd === 'help' || !['setup', 'check', 'issue'].includes(cmd)) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 12).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return;
  }
  if (!domain) stop('Please set ACME_DOMAIN in .env first (for example ACME_DOMAIN=office.toledodentalcare.com).');

  if (cmd === 'setup') {
    let creds = readCreds();
    if (creds) console.log('Already set up with acme-dns. (Delete data/acme/acme-dns.json to start over.)');
    else {
      console.log(`Signing up with the acme-dns service at ${api}…`);
      creds = await acme.acmeDnsRegister(api);
      fs.mkdirSync(acmeDir, { recursive: true });
      fs.writeFileSync(credsFile, JSON.stringify(creds, null, 2), { mode: 0o600 });
      console.log('Done. The login for it is saved in data/acme/acme-dns.json (keep that file private; never share or commit it).');
    }
    console.log(`\nNow add ONE record at GoDaddy (DNS for toledodentalcare.com), one time only:\n
  Type:  CNAME
  Name:  _acme-challenge.${domain.replace(/\.toledodentalcare\.com$/, '')}
  Value: ${creds.fulldomain}
  TTL:   1 hour (or the default)\n
Then run:  node scripts/get-cert.js check`);
    return;
  }

  if (cmd === 'check') {
    const creds = readCreds();
    if (!creds) stop('Run "node scripts/get-cert.js setup" first.');
    const resolver = new dns.promises.Resolver();
    resolver.setServers(['1.1.1.1', '8.8.8.8']);
    try {
      const c = await resolver.resolveCname(`_acme-challenge.${domain}`);
      if (c.map((x) => x.toLowerCase()).includes(creds.fulldomain.toLowerCase())) console.log('The DNS record is in place. Next: node scripts/get-cert.js issue --staging');
      else stop(`The DNS record points to ${c.join(', ')}, but it should point to ${creds.fulldomain}.`);
    } catch {
      stop('The DNS record is not visible yet. If you just added it, wait 10–30 minutes and try again.');
    }
    try {
      const a = await resolver.resolve4(domain);
      console.log(`${domain} points to ${a.join(', ')} (this should be the office server's address on the office network).`);
    } catch { console.log(`Note: ${domain} has no address record yet. Add an "A" record pointing to the office server's office-network IP (see docs/CERTIFICATE.md).`); }
    return;
  }

  // issue
  const staging = args.includes('--staging');
  const manual = args.includes('--manual');
  const certFile = path.resolve(ROOT, staging ? 'certs/staging-cert.pem' : (env.TLS_CERT && !env.TLS_CERT.includes('dev-') ? env.TLS_CERT : 'certs/office-cert.pem'));
  const keyFile = path.resolve(ROOT, staging ? 'certs/staging-key.pem' : (env.TLS_KEY && !env.TLS_KEY.includes('dev-') ? env.TLS_KEY : 'certs/office-key.pem'));
  let dnsProvider;
  if (manual) dnsProvider = acme.manualProvider({ ask });
  else {
    const creds = readCreds();
    if (!creds) stop('Run "node scripts/get-cert.js setup" first (or add --manual).');
    dnsProvider = acme.acmeDnsProvider({ api: creds.api, creds });
  }
  const client = new acme.AcmeClient({
    directoryUrl: staging ? acme.DIRECTORIES.staging : acme.DIRECTORIES.production,
    accountKey: acme.loadOrMakeAccountKey(path.join(acmeDir, staging ? 'staging' : '')),
    log: (m) => console.log(m),
  });
  const { certPem, keyPem } = await client.issue({ domain, email: env.ACME_EMAIL, dnsProvider });
  acme.writeCert({ certFile, keyFile, certPem, keyPem });
  console.log(`\nSaved the ${staging ? 'PRACTICE (not trusted) ' : ''}certificate, good for about 90 days:\n  ${certFile}\n  ${keyFile}`);
  if (!staging) {
    console.log(`\nIn .env, set:\n  TLS_CERT=${path.relative(ROOT, certFile).replace(/\\/g, '/')}\n  TLS_KEY=${path.relative(ROOT, keyFile).replace(/\\/g, '/')}\nThen restart the Dashboard. ${manual ? 'Renewal is NOT automatic with --manual.' : 'It renews itself automatically from now on.'}`);
  } else console.log('\nThe practice run worked. Now run without --staging for the real one.');
}

main().catch((err) => stop(`Could not get the certificate: ${err.message}`));
