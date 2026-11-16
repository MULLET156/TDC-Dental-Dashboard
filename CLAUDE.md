# TDC Dental Dashboard — notes for agents

Read the shared plan first: **MULLET156/TDC-Office-Plan** (README, PLAN, CONTRACT, SITE-OUTLINE, STATUS). Follow CONTRACT.md exactly; propose changes as an issue there titled `Contract change: ...`.

This repo is the **front door**: login, staff and roles, sessions, Settings, the home tiles, the shared look (`/shared/tdc.css`, `/shared/shell.js`), and the signed pass-through `/m/<id>/...`. **It never calls Open Dental**, not even the fake gateway.

## Rules
- Node.js 20+ built-ins only. No npm dependencies.
- Pull `main` and check open PRs first. Work on a short branch and open a PR; never push to `main` directly.
- **Merge as you go** (Ryan, 2026-11-16, see TDC-Office-Plan/CLAUDE.md): merge your own PR as soon as CI is green on Windows and Linux and your own checks pass. Don't wait for Ryan. Merging `main` redeploys the design-stage site on Hostinger (https://palevioletred-viper-775768.hostingersite.com), so check it right after merging (`/health`, `/shared/tdc.css`, the login page) and revert the PR at once if something broke. Contract changes still need Ryan's OK first.
- No real patient data anywhere (code, tests, logs, screenshots). Tests use fake staff only.
- Never print or commit secrets. `.env`, `data/` and `certs/` are git-ignored.
- README and PR descriptions in plain language, Windows first, with "How to test".
- Update only the Dental Dashboard row in TDC-Office-Plan/STATUS.md, by PR there.

## Map
- `server.js` — reads `.env`, starts HTTPS (or HTTP behind Hostinger), optional built-in Hello demo, certificate reload/renewal.
- `lib/app.js` — all routes. `lib/modules.js` — pass-through, manifests, tiles. `lib/sign.js` — CONTRACT §3 signature.
- `lib/users.js` (scrypt), `lib/sessions.js` (12 h / idle / PIN lock), `lib/limiter.js` (lockout), `lib/config.js` (data/config.json).
- `lib/apptiles.js` — CONTRACT §5b tiles from the standalone apps (server to server, Bearer TILE_TOKEN, 30 s cache, same-app links only). Tokens live in data/config.json and never reach a browser or log.
- `lib/inproc.js` — runs the built-in sample module inside the process (Hostinger allows only one listening server per app).
- `lib/x509.js` + `lib/acme.js` + `lib/renew.js` — dev certificate and Let's Encrypt DNS-01, no dependencies.
- `public/shared/` — the shared look every module uses (DESIGN.md in TDC-Office-Plan). `tdc.css` is **generated**: edit `scripts/build-css.js` (tokens, accents, dark values) or `scripts/tdc-css-components.css`, then `node scripts/build-css.js`. `public/js/home.js` — home page.
- Follow DESIGN.md exactly; don't restyle on your own. When DESIGN.md is unclear or won't work, open a `Design: ...` issue in TDC-Office-Plan for the Shared Design agent instead of guessing.
- `examples/hello-module/` — the sample module other agents copy. `scripts/check-module.js` — contract checker.
- `npm test` — `node --test`, runs on Windows and Linux in CI.

## Security choices to keep
- Browser `X-TDC-*`, `Cookie`, `Authorization` and other headers are not forwarded (allow-list in `lib/modules.js`).
- `Set-Cookie` and security headers from modules are dropped; the Dashboard's own security headers (CSP `script-src 'self'`) apply to every page.
- Non-GET/HEAD requests must carry this site's `Origin` (or `Referer`).
- Logs: one JSON line per request, path only (no query strings, no bodies).
