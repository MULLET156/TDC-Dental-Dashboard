# The office HTTPS certificate (live stage)

**When:** only when the Dashboard moves to the office server (the live stage). During the design stage, Hostinger provides HTTPS and you can skip this whole page.

**Why:** browsers only allow the microphone (for Voice Charting) on a secure `https://` page with a certificate they trust. We use a free certificate from **Let's Encrypt** for a name like `office.toledodentalcare.com`. Staff devices need nothing installed: they open the link and log in.

**How it works, in one paragraph:** Let's Encrypt has to see proof that you control `toledodentalcare.com`. Instead of opening the office server to the internet, the Dashboard proves it through **DNS** (the "DNS-01 challenge"): it publishes a short-lived secret code in a DNS record, Let's Encrypt checks the record, and issues the certificate. The certificate lasts 90 days, and the Dashboard renews it by itself about 30 days before it runs out.

To make that renewal hands-free, we use a small free service called **acme-dns**. You add **one** DNS record at GoDaddy, one time, that hands over *only* the certificate check for the office name to acme-dns. Nothing else about your domain or website changes.

> **Ryan's choice (2026-11-17): move the domain's DNS to Cloudflare** (free plan, DNS only) **before going live.** The Dashboard will then get and renew its certificate through Cloudflare's DNS API, so we don't rely on the public acme-dns service. Notes:
> - **DNS only.** The website, email and other hosting stay where they are. All existing GoDaddy DNS records get re-created at Cloudflare first; nothing should change for visitors.
> - **No Cloudflare Tunnel or proxy for the Dashboard.** A tunnel would send patient information through Cloudflare, which signs a HIPAA BAA only on its Enterprise plan, and it would put the Dashboard on the internet. The office server stays reachable only from the office network.
> - **To do before the live stage:** add a Cloudflare DNS provider to the Dashboard's certificate helper (`lib/acme.js`, with a Cloudflare API token limited to editing this one zone's DNS, kept in `data/`, never in the repo), then update the steps below. Until then, the acme-dns steps below still work.
---

## What you need

- The office server, with the Dashboard installed and working (the Installer will do this later).
- Access to GoDaddy's DNS settings for `toledodentalcare.com` (where the practice website's domain is managed).
- 20–40 minutes, mostly waiting for DNS.

## Step 1: Give the office server a fixed address on the office network

The name `office.toledodentalcare.com` will point to the server's address *inside* the office (something like `192.168.1.20`). That address must not change.

1. Find the server's current address: on the server, open **Command Prompt** and type `ipconfig`. Look for **IPv4 Address** (for example `192.168.1.20`).
2. In your office router's settings, make a **DHCP reservation** (sometimes called "static lease" or "reserved IP") for the server, using that address. If someone else manages the network, ask them to do this.

## Step 2: Point the name at the server (GoDaddy, one time)

1. Log in to GoDaddy → **My Products** → next to `toledodentalcare.com` choose **DNS**.
2. **Add New Record**:
   - **Type:** `A`
   - **Name:** `office`
   - **Value:** the server's office address from Step 1 (for example `192.168.1.20`)
   - **TTL:** 1 hour (or the default)
3. Save.

This address only works inside the office. From outside, the name leads nowhere useful, which is what we want.

> Some routers block DNS names that point to office-network addresses ("DNS rebinding protection"). If, after Step 6, office PCs say the site "can't be reached" but the server itself works, add `office.toledodentalcare.com` as an exception in the router's DNS settings (or tell me the router model and I'll find the setting).

## Step 3: Fill in the Dashboard's settings

On the server, open the Dashboard folder and edit `.env` (Notepad is fine). Set:

```
TDC_STAGE=live
ACME_DOMAIN=office.toledodentalcare.com
ACME_EMAIL=your email (Let's Encrypt only uses it to warn about problems)
```

## Step 4: Sign up with acme-dns and add the second record (one time)

1. On the server, open **Command Prompt** in the Dashboard folder and run:
   ```
   node scripts\get-cert.js setup
   ```
   It signs up with acme-dns, saves the login in `data\acme\acme-dns.json` (keep that file private), and shows a record like this:
   ```
   Type:  CNAME
   Name:  _acme-challenge.office
   Value: 3f1c9a2e-....auth.acme-dns.io
   ```
2. In GoDaddy DNS, **Add New Record** with exactly that **Type**, **Name** and **Value**. Save.
3. Wait 10–30 minutes, then check it:
   ```
   node scripts\get-cert.js check
   ```
   It should say **"The DNS record is in place."** If not, wait a bit longer and try again.

## Step 5: Practice run, then the real certificate

1. Practice run against Let's Encrypt's test server (doesn't count against any limits):
   ```
   node scripts\get-cert.js issue --staging
   ```
   It should end with **"The practice run worked."**
2. The real one:
   ```
   node scripts\get-cert.js issue
   ```
   It saves `certs\office-cert.pem` and `certs\office-key.pem` and tells you two lines to put in `.env`:
   ```
   TLS_CERT=certs/office-cert.pem
   TLS_KEY=certs/office-key.pem
   ```

## Step 6: Switch the Dashboard to the real certificate

In `.env`, also set:

```
HOST=0.0.0.0
PORT=443
PUBLIC_URL=https://office.toledodentalcare.com
```

Restart the Dashboard. In **Windows Defender Firewall**, allow incoming connections on port **443** for the **Private** network profile only (the Installer will do this later).

From an operatory PC, open `https://office.toledodentalcare.com`. You should see the login page with a normal padlock and no warning.

## Renewal

Nothing to do. While `ACME_DOMAIN` is set, the Dashboard checks once a day. When fewer than 30 days are left, it gets a new certificate through acme-dns and switches to it without a restart. Each attempt is written to its log as `certificate-renewed` or `certificate-renewal-failed`.

## If something goes wrong

| What you see | What to do |
|---|---|
| `The DNS record is not visible yet` | Wait 30 minutes and run `check` again. Make sure the Name is `_acme-challenge.office` (GoDaddy adds `.toledodentalcare.com` itself). |
| `Let's Encrypt refused: ...` | Run `check`. If it passes, try `issue --staging` again; send me the message if it repeats. |
| Browser warning on office PCs | `.env` still points at `certs/dev-cert.pem`. Use the `TLS_CERT`/`TLS_KEY` lines from Step 5 and restart. |
| Office PCs can't reach the site | Check the `A` record (Step 2) and the router note under Step 2. |

**Without acme-dns:** `node scripts\get-cert.js issue --manual` asks you to add a `TXT` record by hand instead. That works, but you would have to repeat it every 60–90 days, so it's only for a first try.
