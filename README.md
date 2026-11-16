# TDC Dental Dashboard

The **front door** of Toledo Dental Care's office website. Staff open one link, log in once, and see one site: a home page with tiles from each module, a shared header, and the modules themselves (Daysheet, Treatment Finder, Voice Charting, Practice Numbers) behind it. It also links to the Lab Tracker, Supply Room and Maintenance Tracker.

The Dashboard **never talks to Open Dental**. It handles logins and passes each staff member's requests to the right module, with a tamper-proof stamp saying who they are (see the shared plan, [TDC-Office-Plan](https://github.com/MULLET156/TDC-Office-Plan)).

**Nothing is installed on staff computers or tablets.** They open the link in Chrome or Edge and log in.

## What's in version 0.1

- **Logins** for each staff member, with roles (owner, admin, doctor, hygienist, assistant, front desk). Passwords are scrambled with `scrypt` before saving; the Dashboard never stores them as typed.
- **First-run screen** to create the owner account (protected by a setup code).
- **Optional PIN** for shared tablets: the screen locks after a few idle minutes (or when you tap **Lock**) and unlocks with the PIN.
- **Automatic log-out** after 30 idle minutes (adjustable per role) and always after 12 hours.
- **Lockout** after 5 wrong passwords for 15 minutes (an owner or admin can clear it), and 20 wrong tries from one device blocks that device for 15 minutes.
- **Settings** (owner and admin only): staff and roles, modules, links to other apps, which tiles show, login times.
- **Home page** with tiles from each module. If a module is down, its tiles say **Not responding** and everything else still works.
- **The shared look** for every module, following [DESIGN.md](https://github.com/MULLET156/TDC-Office-Plan/blob/main/DESIGN.md): `/shared/tdc.css`, `/shared/shell.js`, the fonts (`/shared/fonts/`) and the logos. One accent colour per app, a light and a dark theme, and a phone layout with a bottom tab bar. See "The shared look" below.
- **Sample module** ("Hello") and a **contract checker** for the other module builders.
- **HTTPS:** a test certificate for this computer, and a built-in Let's Encrypt client for the office server that renews by itself ([docs/CERTIFICATE.md](docs/CERTIFICATE.md)).
- **Security:** only this site's own pages can submit forms, security headers on every page, and nothing a browser sends can pretend to be a different staff member.

## How to test (Windows, on your own computer)

This uses made-up staff and the sample module. There is no patient data anywhere in the Dashboard.

### 1. Install Node.js (one time)

Go to <https://nodejs.org>, download the **LTS** version for Windows, and install it with the default options.

### 2. Get the code

- With **GitHub Desktop**: *File → Clone repository → MULLET156/TDC-Dental-Dashboard*, then switch to the branch you're testing (for a pull request, the branch named in the PR).
- Or on GitHub, open the branch, click **Code → Download ZIP**, and unzip it.

### 3. Start it

Open the folder and **double-click `start.cmd`**. The first time, it:
- copies `.env.example` to `.env` (your settings),
- makes a test certificate in `certs\`,
- starts the Dashboard, and shows: `running: https://127.0.0.1:8443/`

Leave that black window open (closing it stops the Dashboard).

### 4. Open it

1. In Chrome or Edge, go to **https://127.0.0.1:8443**
2. You'll see a privacy warning. That's expected **only** for this test certificate: click **Advanced → Continue to 127.0.0.1**. (Staff never see this; the office server uses a real certificate.)

### 5. Create the owner account

1. You'll see **Create the owner account**. It asks for a **setup code**. Open the folder `data` inside the Dashboard folder and open `SETUP-CODE.txt` with Notepad; copy the code from there.
2. Fill in your name, a login name (e.g. `ryan`), a password (10+ characters), and optionally a 4–6 digit PIN.
3. Click **Create owner account**. You land on the home page with the Hello tiles.

### 6. Try these

| Try | You should see |
|---|---|
| Click **Hello (sample)** in the header | A page from the sample module, inside the Dashboard's header, showing your name and roles |
| **Echo form** → type something → **Send** | "You said: …" (a form going through the Dashboard to the module) |
| **Settings → Staff** → add someone with role **Front desk** | They appear in the list |
| Log out, log in as that person | No **Settings** in the header; the "Owner-only tile" isn't on their home page; **Owners only** page says "Not allowed" |
| Type a wrong password 5 times | "Too many wrong tries. Please wait 15 minutes…". Then as owner: **Settings → Staff**, tap the person, **Clear lockout** |
| If you set a PIN: click **Lock** | Lock screen. Enter the PIN to come back |
| **Settings → Other apps**: add the Lab Tracker address | A **Lab Tracker** card under "Other apps" on the home page |
| **Settings → Tiles**: untick "Hello tile", Save | That tile disappears from the home page |
| Close the black window, then reload the page | The page can't load. Start `start.cmd` again: you need to log in again (accounts are kept) |

### 7. Automatic tests (optional)

In the Dashboard folder, click the address bar, type `cmd`, press Enter, then type:

```
npm test
```

It should end with `# fail 0`.

## Running on Hostinger (design stage)

See [docs/HOSTINGER.md](docs/HOSTINGER.md). In short: a Hostinger **Node.js web app** connected to this repo's `main` branch, entry file `server.js`, plus a few environment variables. It redeploys by itself whenever a pull request is merged.

## Running on the office server (live stage, later)

The Installer will set this up as a Windows service. The settings that change are in `.env`: `TDC_STAGE=live`, `HOST=0.0.0.0`, `PORT=443`, and the real certificate ([docs/CERTIFICATE.md](docs/CERTIFICATE.md)). Modules are then added in **Settings → Modules** as `http://127.0.0.1:3101` (Daysheet), `:3102` (Treatment Finder), `:3103` (Voice Charting) and `:3104` (Practice Numbers).

## Settings file (`.env`)

All settings are explained in `.env.example`. The important ones:

| Setting | Meaning |
|---|---|
| `TDC_STAGE` | `design` (Hostinger, fake data) or `live` (office server) |
| `TLS` | `on`: the Dashboard does HTTPS itself. `off`: something in front of it does (Hostinger) |
| `HOST`, `PORT` | Where it listens. This computer: `127.0.0.1` / `8443`. Office server: `0.0.0.0` / `443` |
| `DATA_DIR` | Where accounts and settings are kept (`data` by default; never uploaded to GitHub) |
| `SETUP_CODE` | Needed once to create the owner account. If empty, a code is written to `data\SETUP-CODE.txt` |
| `DEMO_HELLO` | `1` = run the sample module inside the Dashboard |

**Forgot the owner password?** If another owner exists, they can set a new one in **Settings → Staff**. If not, stop the Dashboard, rename `data\users.json` to `users-old.json`, start it again, and create the owner account again (staff accounts would need re-adding; module settings are kept).

## The shared look

Every page in the suite uses one stylesheet and one header script, both served by the Dashboard. They follow [DESIGN.md](https://github.com/MULLET156/TDC-Office-Plan/blob/main/DESIGN.md) and the pictures in `TDC-Office-Plan/brand/reference/`.

- **Header:** logo, the app's name with today's date, and on the right **Apps** (switch between Home, modules, Settings and the Lab Tracker, Supply Room and Maintenance Tracker), your name, the light/dark button, **Lock** and **Log out**. A second row holds the page's own buttons.
- **Phones:** a slim header with the logo mark, and a tab bar at the bottom. Everything else is under **More**.
- **Colours:** each app has its own accent (Dashboard navy, Daysheet blue, Treatment Finder violet, and so on), set by `<body data-module="…">`. Status colours mean the same everywhere (red overdue/911, amber due soon, green done).
- **Dark mode:** follows the device. The sun/moon button switches it, and the choice is remembered on that device.
- **Fonts:** Archivo, Figtree and JetBrains Mono, served from `/shared/fonts/`. Nothing loads from outside sites.
- The sample module's **Design kit** page (`/m/hello/kit` with `DEMO_HELLO=1`) shows every piece with made-up data.

`public/shared/tdc.css` is generated: change `scripts/build-css.js` (colours) or `scripts/tdc-css-components.css` (everything else), then run `node scripts/build-css.js`. A test fails if you forget.

## Counts from the Lab Tracker, Supply Room and Maintenance Tracker

These three apps run on their own sites, but they can show their counts on the Dashboard home page ("Late: 2", "To order: 10", "Overdue: 3"). They show counts only, never patient names. Each app needs a **tile token**: a long secret that only that app and the Dashboard know.

1. In the Dashboard: **Settings → Other apps**. Check each app's address, and tick who should see its counts.
2. Under **Tile tokens**, open the app and click **Make a new token**. Copy the token it shows (it is shown only once).
3. Put it in that app's server settings (its `config.php` on Hostinger) as `TILE_TOKEN`. Don't email or text it; copy and paste it.
4. Back in **Settings → Other apps**, each tile shows a green badge with its number, or the reason it isn't working ("Wrong token", "Tiles are turned off in the app").

If the app already has a token, paste it under **Or paste the token the app already has** instead. **Turn tiles off** removes the token from the Dashboard.

## For module builders

Read [examples/hello-module/README.md](examples/hello-module/README.md). It explains how to check the Dashboard's signature, serve a manifest and tiles, use the shared look, and how to run the contract checker:

```
node scripts\check-module.js http://127.0.0.1:3101 --env C:\path\to\your-module\.env
```

## Files

| Path | What |
|---|---|
| `server.js`, `start.cmd` | Start the Dashboard |
| `lib/` | The Dashboard's code |
| `public/shared/` | Shared look for every module (CSS, header script, logo) |
| `examples/hello-module/` | Sample module |
| `scripts/` | Test certificate, real certificate, contract checker |
| `docs/` | Hostinger and certificate guides |
| `test/` | Automatic tests (fake data only) |
| `data/`, `certs/`, `.env` | Your accounts, certificates and settings. Never uploaded to GitHub |
