# TDC Dental Dashboard — notes for agents

Read the shared plan first: **MULLET156/TDC-Office-Plan** (README, PLAN, CONTRACT, SITE-OUTLINE, STATUS). Follow CONTRACT.md exactly; propose changes as an issue there titled `Contract change: ...`.

This repo is the **front door**: login, staff and roles, sessions, Settings, the home tiles, the shared look (`/shared/tdc.css`, `/shared/shell.js`), and the signed pass-through `/m/<id>/...`. **It never calls Open Dental**, not even the fake gateway.

## Rules
- Node.js 20+ built-ins only. No npm dependencies.
- Work on a branch, open a PR, never push to `main`. Pull `main` and check open PRs first.
- No real patient data anywhere (code, tests, logs, screenshots). Tests use fake staff only.
- Never print or commit secrets. `.env`, `data/` and `certs/` are git-ignored.
- README and PR descriptions in plain language, Windows first, with "How to test".
- Update only the Dental Dashboard row in TDC-Office-Plan/STATUS.md, by PR there.

## Map
- `server.js` — reads `.env`, starts HTTPS (or HTTP behind Hostinger), optional built-in Hello demo, certificate reload/renewal.
- `lib/app.js` — all routes. `lib/modules.js` — pass-through, manifests, tiles. `lib/sign.js` — CONTRACT §3 signature.
- `lib/users.js` (scrypt), `lib/sessions.js` (12 h / idle / PIN lock), `lib/limiter.js` (lockout), `lib/config.js` (data/config.json).
- `lib/x509.js` + `lib/acme.js` + `lib/renew.js` — dev certificate and Let's Encrypt DNS-01, no dependencies.
- `public/shared/` — the shared look every module uses. `public/js/home.js` — home tiles.
- `examples/hello-module/` — the sample module other agents copy. `scripts/check-module.js` — contract checker.
- `npm test` — `node --test`, runs on Windows and Linux in CI.

## Security choices to keep
- Browser `X-TDC-*`, `Cookie`, `Authorization` and other headers are not forwarded (allow-list in `lib/modules.js`).
- `Set-Cookie` and security headers from modules are dropped; the Dashboard's own security headers (CSP `script-src 'self'`) apply to every page.
- Non-GET/HEAD requests must carry this site's `Origin` (or `Referer`).
- Logs: one JSON line per request, path only (no query strings, no bodies).
