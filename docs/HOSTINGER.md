# Putting the Dashboard on Hostinger (design stage)

In the design stage the Dashboard runs on your Hostinger account with **fake data only**. It never talks to Open Dental, real or fake. Every time a change is merged into `main` on GitHub, Hostinger rebuilds and restarts it.

## One-time setup

1. Log in to **hPanel** → **Websites** → **Add Website** → **Node.js web app** → **Import Git repository**.
2. Click **Connect with GitHub** (if it isn't already) and choose **MULLET156/TDC-Dental-Dashboard**, branch **main**.
3. Check the build settings Hostinger suggests:
   - **Framework:** Other
   - **Node version:** 22 (20 or newer works)
   - **Build command:** leave empty (or `npm install`; there's nothing to install)
   - **Entry file:** `server.js`
4. **Environment variables.** Add these (they're kept across deploys):

   | Name | Value | Why |
   |---|---|---|
   | `TDC_STAGE` | `design` | Fake-data stage |
   | `TLS` | `off` | Hostinger already provides HTTPS in front of the app |
   | `TRUST_PROXY` | `1` | So the Dashboard knows the visitor's address and that the page is HTTPS |
   | `HOST` | `0.0.0.0` | Lets Hostinger's front end reach the app |
   | `DATA_DIR` | `~/tdc-dashboard-data` | **Important.** Hostinger replaces the app folder on every deploy. Keeping data outside it means staff accounts and settings survive updates. |
   | `SETUP_CODE` | something only you know, e.g. 3 random words | Needed once, to create the owner account. Without it, anyone who found the site first could become the owner. |
   | `PUBLIC_URL` | the site's address, e.g. `https://office-dev.toledodentalcare.com` | Used to check that form posts come from this site |
   | `DEMO_HELLO` | `1` | Shows the sample module so there's something to click on |

   Don't set `PORT`; Hostinger sets it.
5. Click **Deploy**.
6. When it's running, open the site's address. You'll see **Create the owner account**. Enter your `SETUP_CODE`, your name, a login name and a password.

## Address

Hostinger first gives the site a temporary name ending in `.hostingersite.com`, like your other demo apps. That's fine for trying things out. If you'd like a nicer name (for example `office-dev.toledodentalcare.com`), connect it in hPanel; since the domain's DNS is at GoDaddy, hPanel will tell you which record to add there. Update `PUBLIC_URL` to match.

## Adding modules (design stage)

Each module (Daysheet, Treatment Finder, …) is its **own** Hostinger Node.js app with its own `https://` address. In the Dashboard, go to **Settings → Modules → Add a module**, enter the id (e.g. `daysheet`) and the module's `https://` address, leave **Secret** empty and click **Add module**. The Dashboard shows a new secret **once**; paste it into that module's Hostinger environment variables as `MODULE_SECRET`, then redeploy that module.

## Updates

Merging a pull request into `main` redeploys automatically. Logins are kept in memory, so everyone is logged out after each deploy; accounts and settings stay (they're in `DATA_DIR`).
