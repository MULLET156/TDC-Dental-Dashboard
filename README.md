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
- **The shared look** (`/shared/tdc.css`, `/shared/shell.js`) with the Toledo Dental Care logo, used by every module.
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
