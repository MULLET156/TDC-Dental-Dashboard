'use strict';
// The Dashboard's own pages, rendered on the server. No inline scripts
// (the Content-Security-Policy blocks them); page scripts live in public/js.
const { esc } = require('./http-util');
const { ROLES } = require('./users');

const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', doctor: 'Doctor', hygienist: 'Hygienist', assistant: 'Assistant', front: 'Front desk' };

function layout({ title, body, shell = true, scripts = [], module = 'dashboard' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Toledo Dental Care</title>
<link rel="icon" href="/shared/icon-64.png">
<link rel="stylesheet" href="/shared/tdc.css">
<script src="/shared/shell.js" defer></script>
${scripts.map((s) => `<script src="${esc(s)}" defer></script>`).join('\n')}
</head>
<body data-module="${esc(module)}"${shell ? '' : ' data-shell="none"'}>
${body}
</body>
</html>`;
}

function msg(flash) {
  if (!flash) return '';
  const kind = flash.kind === 'error' ? 'error' : flash.kind === 'info' ? 'info' : 'ok';
  return `<div class="tdc-msg tdc-msg-${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${esc(flash.text)}</div>`;
}

const logoBlock = (sub) => `<div class="tdc-login-logo"><img src="/shared/logo-stacked.png" alt="Toledo Dental Care" width="122" height="108"><div class="tdc-muted">${esc(sub)}</div></div>`;

function narrow(title, inner) {
  return layout({ title, shell: false, body: `<main class="tdc-narrow">${inner}</main>` });
}

function rolesChecks(selected = [], { allowOwner = true, prefix = 'roles' } = {}) {
  return `<fieldset><legend>Roles</legend>${ROLES.map((r) => {
    const dis = !allowOwner && r === 'owner';
    return `<label class="tdc-check"><input type="checkbox" name="${prefix}" value="${r}"${selected.includes(r) ? ' checked' : ''}${dis ? ' disabled' : ''}> ${ROLE_LABELS[r]}</label>`;
  }).join('')}</fieldset>`;
}

// ---------- Login, setup, lock ----------

function setupPage({ flash, values = {}, needsCode, codeWhere }) {
  return narrow('Welcome', `${logoBlock('Office Dashboard — first-time setup')}
<div class="tdc-card">
<h1>Create the owner account</h1>
<p class="tdc-muted">This is the first account. The owner can add other staff later in Settings.</p>
${msg(flash)}
<form class="tdc-form" method="post" action="/setup" autocomplete="off">
${needsCode ? `<label>Setup code <span class="tdc-hint">${esc(codeWhere)}</span><input name="code" required autocomplete="off"></label>` : ''}
<label>Your name <span class="tdc-hint">As staff should see it, for example "Dr. Ryan Millet"</span><input name="name" required maxlength="80" value="${esc(values.name)}"></label>
<label>Login name <span class="tdc-hint">Lowercase, no spaces, for example "ryan"</span><input name="username" required maxlength="32" autocapitalize="none" value="${esc(values.username)}"></label>
<label>Password <span class="tdc-hint">At least 10 characters</span><input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
<label>Password again<input type="password" name="password2" required minlength="10" autocomplete="new-password"></label>
<label>PIN (optional) <span class="tdc-hint">4–6 digits, to quickly unlock a shared tablet</span><input type="password" name="pin" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="off"></label>
<button class="tdc-btn tdc-btn-primary" type="submit">Create owner account</button>
</form>
</div>`);
}

function loginPage({ flash, next, username = '' }) {
  return narrow('Log in', `${logoBlock('Office Dashboard')}
<div class="tdc-card">
<h1>Log in</h1>
${msg(flash)}
<form class="tdc-form" method="post" action="/login">
<input type="hidden" name="next" value="${esc(next)}">
<label>Login name<input name="username" required autocapitalize="none" autocomplete="username" value="${esc(username)}" autofocus></label>
<label>Password<input type="password" name="password" required autocomplete="current-password"></label>
<button class="tdc-btn tdc-btn-primary" type="submit">Log in</button>
</form>
</div>`);
}

function lockPage({ flash, name, next, hasPin }) {
  return narrow('Locked', `${logoBlock('This screen is locked')}
<div class="tdc-card">
<h1>${esc(name)}</h1>
${msg(flash)}
${hasPin ? `<form class="tdc-form" method="post" action="/unlock">
<input type="hidden" name="next" value="${esc(next)}">
<label>Enter your PIN to unlock<input class="tdc-pin" type="password" name="pin" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" required autocomplete="off" autofocus></label>
<button class="tdc-btn tdc-btn-primary" type="submit">Unlock</button>
</form>` : '<p>Please log in again.</p>'}
<form method="post" action="/logout" style="margin-top:14px">
<button class="tdc-btn" type="submit">Not ${esc(name)}? Log out</button>
</form>
</div>`);
}

// ---------- Home ----------

function homePage({ name, flash }) {
  return layout({
    title: 'Home', scripts: ['/js/home.js'],
    body: `<main class="tdc-main">
${msg(flash)}
<div class="tdc-hello"><h1 id="greeting">Hello, ${esc(name)}</h1><div class="tdc-muted" id="today"></div></div>
<div class="tdc-shortcuts" id="shortcuts"></div>
<div class="tdc-grid" id="tiles" aria-live="polite"></div>
<p class="tdc-muted" id="no-tiles" hidden>No modules are set up yet. An owner or admin can add them in Settings → Modules.</p>
<h2 class="tdc-section-title" id="links-title" hidden>Other apps</h2>
<div class="tdc-links" id="links"></div>
</main>`,
  });
}

// ---------- Account ----------

function accountPage({ user, flash }) {
  return layout({
    title: 'My account',
    body: `<main class="tdc-main" style="max-width:640px">
<h1>My account</h1>
${msg(flash)}
<div class="tdc-card">
<p><strong>${esc(user.name)}</strong> · login name <code>${esc(user.username)}</code><br>
<span class="tdc-muted">Roles: ${user.roles.map((r) => ROLE_LABELS[r]).join(', ')}</span></p>
</div>
<div class="tdc-card">
<h2>Change password</h2>
<form class="tdc-form" method="post" action="/account/password">
<label>Current password<input type="password" name="current" required autocomplete="current-password"></label>
<label>New password <span class="tdc-hint">At least 10 characters</span><input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
<label>New password again<input type="password" name="password2" required minlength="10" autocomplete="new-password"></label>
<button class="tdc-btn tdc-btn-primary" type="submit">Change password</button>
</form>
</div>
<div class="tdc-card">
<h2>Quick-unlock PIN</h2>
<p class="tdc-muted">${user.pinHash ? 'You have a PIN. ' : 'You have no PIN. '}With a PIN, a shared tablet locks after a few idle minutes (or when you tap Lock) and you unlock it with your PIN instead of logging in again.</p>
<form class="tdc-form" method="post" action="/account/pin">
<label>Current password<input type="password" name="current" required autocomplete="current-password"></label>
<label>New PIN <span class="tdc-hint">4–6 digits. Leave empty to remove your PIN.</span><input type="password" name="pin" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="off"></label>
<button class="tdc-btn tdc-btn-primary" type="submit">Save PIN</button>
</form>
</div>
</main>`,
  });
}

// ---------- Settings ----------

const TABS = [['staff', 'Staff'], ['modules', 'Modules'], ['links', 'Other apps'], ['tiles', 'Tiles'], ['sessions', 'Login times']];

function settingsLayout(tab, inner, flash) {
  return layout({
    title: 'Settings',
    body: `<main class="tdc-main">
<h1>Settings</h1>
<nav class="tdc-tabs" aria-label="Settings sections">${TABS.map(([id, label]) => `<a href="/settings/${id}"${id === tab ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
${msg(flash)}
${inner}
</main>`,
  });
}

function staffPage({ users, me, lockouts, flash }) {
  const meIsOwner = me.roles.includes('owner');
  const rows = users.map((u) => {
    const editable = meIsOwner || !u.roles.includes('owner');
    const locked = lockouts.find((l) => l.key === `user:${u.username}`);
    return `<details class="tdc-card">
<summary>${esc(u.name)} <span class="tdc-muted">(${esc(u.username)})</span>
${u.roles.map((r) => `<span class="tdc-badge">${ROLE_LABELS[r]}</span>`).join(' ')}
${u.disabled ? '<span class="tdc-badge-alert">Turned off</span>' : ''}
${u.pinHash ? '<span class="tdc-badge-ok">PIN</span>' : ''}
${locked ? `<span class="tdc-badge-warn">Locked out ${locked.minutesLeft} min</span>` : ''}</summary>
${editable ? `
<form class="tdc-form" method="post" action="/settings/staff/${esc(u.username)}">
<label>Display name<input name="name" required maxlength="80" value="${esc(u.name)}"></label>
${rolesChecks(u.roles, { allowOwner: meIsOwner })}
<label class="tdc-check"><input type="checkbox" name="disabled" value="1"${u.disabled ? ' checked' : ''}> Turned off (can't log in)</label>
<div><button class="tdc-btn tdc-btn-primary" type="submit">Save</button></div>
</form>
<hr>
<form class="tdc-form tdc-inline" method="post" action="/settings/staff/${esc(u.username)}/password">
<label>New password <span class="tdc-hint">Give it to them; they can change it under My account</span><input type="password" name="password" minlength="10" required autocomplete="new-password"></label>
<button class="tdc-btn" type="submit">Set password</button>
</form>
<form class="tdc-form tdc-inline" method="post" action="/settings/staff/${esc(u.username)}/pin">
<label>New PIN <span class="tdc-hint">4–6 digits; empty removes it</span><input type="password" name="pin" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="off"></label>
<button class="tdc-btn" type="submit">Set PIN</button>
</form>
<div class="tdc-btn-row" style="margin-top:12px">
${locked ? `<form method="post" action="/settings/staff/${esc(u.username)}/unblock"><button class="tdc-btn" type="submit">Clear lockout</button></form>` : ''}
${u.username !== me.username ? `<form method="post" action="/settings/staff/${esc(u.username)}/delete"><button class="tdc-btn tdc-btn-danger" type="submit">Delete account</button></form>` : ''}
</div>` : '<p class="tdc-muted">Only an owner can change an owner account.</p>'}
</details>`;
  }).join('\n');

  return settingsLayout('staff', `
<div class="tdc-card">
<h2>Add a staff member</h2>
<form class="tdc-form" method="post" action="/settings/staff/add" autocomplete="off">
<div class="tdc-inline">
<label>Display name<input name="name" required maxlength="80"></label>
<label>Login name <span class="tdc-hint">lowercase, no spaces</span><input name="username" required maxlength="32" autocapitalize="none"></label>
</div>
${rolesChecks([], { allowOwner: meIsOwner })}
<div class="tdc-inline">
<label>Starting password <span class="tdc-hint">at least 10 characters</span><input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
<label>PIN (optional)<input type="password" name="pin" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="off"></label>
</div>
<div><button class="tdc-btn tdc-btn-primary" type="submit">Add staff member</button></div>
</form>
</div>
<h2 class="tdc-section-title">Staff (${users.length}) — tap a name to change it</h2>
${rows}`, flash);
}

function modulesPage({ modules, stage, flash, newSecret }) {
  const example = stage === 'design' ? 'https://daysheet-dev.example.com' : 'http://127.0.0.1:3101';
  const secretBox = newSecret ? `<div class="tdc-card" style="border-color:var(--tdc-primary)">
<h2>New secret for “${esc(newSecret.id)}”</h2>
<p>Copy this into that module's <code>.env</code> file as <code>MODULE_SECRET=</code>, then restart the module. <strong>It is shown only this once.</strong></p>
<div class="tdc-secret">${esc(newSecret.secret)}</div>
</div>` : '';
  const rows = modules.map((m) => `<details class="tdc-card">
<summary>${esc(m.name)} <span class="tdc-muted">/m/${esc(m.id)}</span>
${m.health ? `<span class="tdc-badge-ok">Running v${esc(m.health.version || '?')}</span>` : '<span class="tdc-badge-alert">Not responding</span>'}
${m.manifestError && m.health ? `<span class="tdc-badge-warn">${esc(m.manifestError)}</span>` : ''}
${m.enabled === false ? '<span class="tdc-badge-warn">Hidden</span>' : ''}
${m.secret ? '' : '<span class="tdc-badge-warn">No secret</span>'}
${m.builtIn ? '<span class="tdc-badge">Built-in demo</span>' : ''}</summary>
${m.builtIn ? '<p class="tdc-muted">This sample module runs inside the Dashboard because DEMO_HELLO=1 is set. Remove that setting to hide it.</p>' : `
<form class="tdc-form" method="post" action="/settings/modules/${esc(m.id)}">
<label>Name<input name="name" maxlength="60" value="${esc(m.name)}"></label>
<label>Address <span class="tdc-hint">for example ${esc(example)}</span><input type="url" name="baseUrl" required value="${esc(m.baseUrl)}"></label>
<label>Secret <span class="tdc-hint">Leave empty to keep the current one. Must match MODULE_SECRET in the module's .env.</span><input type="password" name="secret" autocomplete="off"></label>
<label class="tdc-check"><input type="checkbox" name="enabled" value="1"${m.enabled !== false ? ' checked' : ''}> Show this module</label>
<div><button class="tdc-btn tdc-btn-primary" type="submit">Save</button></div>
</form>
<div class="tdc-btn-row" style="margin-top:12px">
<form method="post" action="/settings/modules/${esc(m.id)}/secret"><button class="tdc-btn" type="submit">Make a new secret</button></form>
<form method="post" action="/settings/modules/${esc(m.id)}/delete"><button class="tdc-btn tdc-btn-danger" type="submit">Remove module</button></form>
</div>`}
</details>`).join('\n');

  return settingsLayout('modules', `${secretBox}
<div class="tdc-card">
<h2>Add a module</h2>
<p class="tdc-muted">${stage === 'design'
    ? 'Design stage: each module is its own Hostinger app. Use its https:// address.'
    : 'Live stage: modules run on this server. Use http://127.0.0.1 and the module\'s port (Daysheet 3101, Treatment Finder 3102, Voice Charting 3103, Practice Numbers 3104).'}</p>
<form class="tdc-form" method="post" action="/settings/modules/add" autocomplete="off">
<div class="tdc-inline">
<label>Module id <span class="tdc-hint">short, lowercase, e.g. daysheet</span><input name="id" required maxlength="31" autocapitalize="none"></label>
<label>Name<input name="name" maxlength="60" placeholder="Dental Daysheet"></label>
</div>
<label>Address<input type="url" name="baseUrl" required placeholder="${esc(example)}"></label>
<label>Secret <span class="tdc-hint">Leave empty and the Dashboard makes one for you to copy into the module's .env</span><input type="password" name="secret" autocomplete="off"></label>
<div><button class="tdc-btn tdc-btn-primary" type="submit">Add module</button></div>
</form>
</div>
<h2 class="tdc-section-title">Modules (${modules.length})</h2>
${rows || '<p class="tdc-muted">None yet.</p>'}`, flash);
}

function linksPage({ links, flash }) {
  return settingsLayout('links', `<div class="tdc-card">
<h2>Links to other apps</h2>
<p class="tdc-muted">These show as cards on the home page and open in a new tab. Leave an address empty to hide that card.</p>
<form class="tdc-form" method="post" action="/settings/links">
${links.map((l) => `<label>${esc(l.name)}<input type="url" name="${esc(l.id)}" value="${esc(l.url)}" placeholder="https://"></label>`).join('\n')}
<div><button class="tdc-btn tdc-btn-primary" type="submit">Save links</button></div>
</form>
</div>`, flash);
}

function tilesPage({ groups, hidden, flash }) {
  const body = groups.map((g) => `<fieldset><legend>${esc(g.name)}${g.error ? ` <span class="tdc-badge-alert">${esc(g.error)}</span>` : ''}</legend>
${g.tiles.length ? g.tiles.map((t) => {
    const key = `${g.id}/${t.id}`;
    return `<label class="tdc-check"><input type="checkbox" name="show" value="${esc(key)}"${hidden.includes(key) ? '' : ' checked'}> ${esc(t.title)} <span class="tdc-muted">(${esc((t.roles || []).map((r) => ROLE_LABELS[r] || r).join(', ') || 'everyone')})</span></label><input type="hidden" name="all" value="${esc(key)}">`;
  }).join('<br>') : '<span class="tdc-muted">No tiles.</span>'}
</fieldset>`).join('\n');
  return settingsLayout('tiles', `<div class="tdc-card">
<h2>Home page tiles</h2>
<p class="tdc-muted">Untick a tile to hide it for everyone. Each tile also only shows to the roles listed next to it.</p>
<form class="tdc-form" method="post" action="/settings/tiles">
${body || '<p class="tdc-muted">No modules are set up yet.</p>'}
<div><button class="tdc-btn tdc-btn-primary" type="submit">Save tiles</button></div>
</form>
</div>`, flash);
}

function sessionsPage({ sessions, flash }) {
  return settingsLayout('sessions', `<div class="tdc-card">
<h2>Login times</h2>
<p class="tdc-muted">Everyone is logged out 12 hours after logging in. Before that, they are logged out after this many idle minutes. Someone with several roles gets the shortest time.</p>
<form class="tdc-form" method="post" action="/settings/sessions">
<div class="tdc-inline">
${ROLES.map((r) => `<label>${ROLE_LABELS[r]} <span class="tdc-hint">idle minutes</span><input type="number" name="idle_${r}" min="5" max="720" required value="${esc(sessions.idleMinutes[r])}"></label>`).join('\n')}
</div>
<label>Quick lock after <span class="tdc-hint">idle minutes, for people with a PIN (0 = never auto-lock)</span><input type="number" name="lockMinutes" min="0" max="120" required value="${esc(sessions.lockMinutes)}"></label>
<div><button class="tdc-btn tdc-btn-primary" type="submit">Save</button></div>
</form>
</div>`, flash);
}

function errorPage({ status, title, text, loggedIn }) {
  const inner = `<div class="tdc-card"><h1>${esc(title)}</h1><p>${esc(text)}</p><p><a class="tdc-btn" href="/">Go to the home page</a></p></div>`;
  return loggedIn
    ? layout({ title, body: `<main class="tdc-main" style="max-width:640px">${inner}</main>` })
    : narrow(title, `${logoBlock('Office Dashboard')}${inner}`);
}

module.exports = {
  layout, setupPage, loginPage, lockPage, homePage, accountPage,
  staffPage, modulesPage, linksPage, tilesPage, sessionsPage, errorPage, ROLE_LABELS,
};
