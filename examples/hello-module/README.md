# Hello — sample module (for module agents)

A tiny module that follows [CONTRACT.md](https://github.com/MULLET156/TDC-Office-Plan/blob/main/CONTRACT.md) version 1. Copy its patterns. It uses Node.js built-ins only and never touches Open Dental.

| File | What it shows |
|---|---|
| `tdc-verify.js` | **Copy this into your module.** Verifies the Dashboard's signature (§3) and returns `{ user, name, roles, base }`, or `null` → answer `401`. |
| `server.js` | `/health` without a signature, everything else signed; the manifest (§4); tiles as JSON (§5); pages with the shared look (§6); a role check; a POST form; a 25 MB upload endpoint; JSON request logs without query strings (§8). |
| `kit.js` | The **Design kit** page: every shared class from DESIGN.md §8 (status tiles, page banner, search and filters, Group by, lists with status stripes, chips, meters, header buttons, callout, empty state) with made-up data. **Copy markup from here.** |
| `public/hello.js` | A page script in its own file (see "No inline scripts" below): status tile switching, and "Group by" remembered on the device. |

## Run it on its own (Windows)

1. In the Dashboard: **Settings → Modules → Add a module**: id `hello`, address `http://127.0.0.1:3100`, leave Secret empty, **Add module**. Copy the secret it shows.
2. In this folder, copy `.env.example` to `.env` and paste the secret after `MODULE_SECRET=`.
3. Double-click `start.cmd`.

(Or set `DEMO_HELLO=1` in the Dashboard's `.env`, and the Dashboard runs Hello for you, with no setup.)

## Check your own module

From the Dashboard folder:

```
node scripts\check-module.js http://127.0.0.1:3101 --env C:\path\to\your-module\.env
```

It reads `MODULE_SECRET` from that file (never prints it), then checks `/health`, that unsigned, wrongly signed, old (more than 30 s), future, replayed and tampered requests get `401`, the manifest, every tile (JSON, answers in under 3 s, at most 8 items, module-relative links, no HTML), and that your first page uses the shared look with no inline scripts. Exit code `0` = all required checks passed. Run it before every PR.

## The shared look (DESIGN.md)

- `<body data-module="your-id">` sets your accent colour (`daysheet`, `finder`, `voice`, `numbers`). Ask the Shared Design agent for a new one before adding a module.
- Put the page's buttons in `<nav class="tdc-actions">` as `<a class="tdc-hbtn" data-kind="list|new|log|setup|money|warn|tool">`. Mark the current one with `aria-current="page"`. `shell.js` moves them into the header (and into **More** on phones).
- Icons: `<span data-icon="bell"></span>`. `shell.js` fills in the shared icon. Names: calendar, search, mic, chart, flask, tooth, box, wrench, home, settings, bell, alert, clock, pending, check, list, plus, history, dollar, truck, cart, pulse, pause, edit, filter, arrow, link.
- Status: `data-status="accent|alert|911|warn|low|ok|new|info"` on `.tdc-stat`, `.tdc-row`, `.tdc-group`, `.tdc-chip`, `.tdc-meter` and `.tdc-callout`.
- On phones, `.tdc-stats` becomes the bottom tab bar (give long labels a `data-short="…"`), `.tdc-pagehead` and `.tdc-find` move into the header, and dropdowns hide behind a **Filters** button. You don't write any of that.
- Only `--tdc-*` colours, no fonts of your own, and everything must work in dark mode (it will, if you only use the variables).

## Things the contract implies that are easy to miss

- **The signature key is the `MODULE_SECRET` text itself** (the 64-character hex string, as written in `.env`), not the decoded bytes. `pathAndQuery` is `req.url` exactly as your module receives it (prefix already removed, query string included).
- **Unsigned means 401, everything except `GET /health`.** In the design stage your module is on the internet.
- **No inline scripts or `onclick=`.** The Dashboard sends a Content-Security-Policy with `script-src 'self'` on every page, including yours. Put scripts in `.js` files and load them with `<script src="${base}/static/x.js" defer>`. Inline `style=""` is fine.
- **Links:** build them from the `X-TDC-Base` header (e.g. `/m/daysheet/unscheduled`) or use relative links. Redirects to `/something` are rewritten to `/m/<id>/something` for you.
- **Cookies:** the browser's cookies never reach your module, and `Set-Cookie` from your module is dropped. Keep per-user state on the server, keyed by `X-TDC-User`.
- **POST/PUT/DELETE from your pages just work.** Forms and `fetch` from pages on the same site send the right `Origin`. Use `fetch(url, { credentials: 'same-origin' })`.
- **Polling:** if your page refreshes data on a timer, send the header `X-TDC-Background: 1` so the polling doesn't keep an idle user logged in.
- **Uploads** (audio) go through as the raw request body, up to 25 MB, with `Content-Type` kept. Over 25 MB gets `413`.
- **Who's asking:** `X-TDC-Name` may be percent-encoded if it has accents (`José`); `tdc-verify.js` decodes it. The manifest is requested as user `dashboard`, role `system`. Tiles are requested as the logged-in staff member, so they can be personal (cache per user if needed) and should check roles like a page.
- **Check roles yourself** on every page and action (§3). The Dashboard also hides your module from users whose role isn't in `manifest.roles`.
- **Design stage:** a module that reads Open Dental must check that `GATEWAY_URL/health` reports `"fake": true` at startup and refuse to start otherwise (PLAN.md, "Two stages"). Hello has no gateway, so it skips this.
