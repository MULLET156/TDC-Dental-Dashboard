/* TDC Office shared shell (CONTRACT §6, DESIGN.md §5). Include on every page:
 *   <link rel="stylesheet" href="/shared/tdc.css">
 *   <script src="/shared/shell.js" defer></script>
 *   <body data-module="daysheet"> ... <main class="tdc-main"> ... </main>
 *
 * What it does:
 * - Draws the header: logo | app name + date | Apps, user, theme, Lock, Log out,
 *   and on row 2 the page's own buttons (<nav class="tdc-actions">).
 * - Phones (640px and narrower): mark + app name + initials; the page banner
 *   (.tdc-pagehead) and search row (.tdc-find) move into the header; status tiles
 *   (.tdc-stats) become the bottom tab bar with a "More" tab holding everything else.
 * - Light/dark theme (follows the device; the theme button overrides it).
 * - Fills in icons: <span data-icon="bell"></span> becomes the shared icon.
 * - Keeps the login alive while someone is using the page, and sends them to
 *   the lock or login screen when needed.
 * Modules can use window.TDC.icon(name) and window.TDC.ready (resolves to { me, nav }).
 */
(function () {
  'use strict';

  var ICONS = {
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    flask: '<path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 15h9"/>',
    tooth: '<path d="M7 3.5c-2.4 0-4 2-4 4.6 0 2.3 1 3.6 1.6 5.5.7 2.4.8 7.4 2.6 7.4 1.6 0 1.5-4.6 2.2-6 .4-.8 1-1.1 1.6-1.1s1.2.3 1.6 1.1c.7 1.4.6 6 2.2 6 1.8 0 1.9-5 2.6-7.4.6-1.9 1.6-3.2 1.6-5.5 0-2.6-1.6-4.6-4-4.6-1.8 0-2.6 1-4 1s-2.2-1-4-1z"/>',
    box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
    wrench: '<path d="M15 4.2a5 5 0 0 0-6 6.3L3.5 16a2.1 2.1 0 0 0 3 3L12 13.5a5 5 0 0 0 6.3-6l-3 3-2.6-.7-.7-2.6z"/>',
    home: '<path d="M3 11 12 4l9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 16l-4-4 4-4M5 12h11"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
    link: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    pending: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/>',
    check: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.8-5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5"/><path d="M3.5 4v4.5H8M12 8v4l3 2"/>',
    dollar: '<path d="M12 3v18M16.5 7.5c-.8-1.3-2.4-2-4.5-2-2.6 0-4.5 1.3-4.5 3.3 0 4.5 9 2.3 9 6.8 0 2-1.9 3.4-4.5 3.4-2.2 0-3.9-.8-4.7-2.2"/>',
    truck: '<path d="M2.5 6h11v10h-11zM13.5 9.5h4l3 3.5v3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
    cart: '<path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H6.3"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    pulse: '<path d="M3 12h4l2.5-6 4.5 12 2.5-6H21"/>',
    pause: '<circle cx="12" cy="12" r="8.5"/><path d="M10 9v6M14 9v6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>'
  };

  function icon(name) {
    return '<svg class="tdc-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[name] || ICONS.home) + '</svg>';
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k]; // only ever our own icon markup
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  function withIcon(node, name) { node.insertAdjacentHTML('afterbegin', icon(name)); return node; }

  function hydrateIcons(root) {
    (root || document).querySelectorAll('[data-icon]:not([data-icon-done])').forEach(function (n) {
      n.setAttribute('data-icon-done', '');
      n.insertAdjacentHTML('afterbegin', icon(n.getAttribute('data-icon')));
    });
  }

  // ---------- Theme (DESIGN.md §6) ----------
  var THEME_KEY = 'tdc-theme';
  var darkMq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function storedTheme() { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } }
  function isDark() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return !!(darkMq && darkMq.matches);
  }
  function applyTheme(t) {
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    swapLogos();
    var b = document.querySelector('[data-tdc-theme-btn]');
    if (b) {
      b.innerHTML = icon(isDark() ? 'sun' : 'moon');
      b.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
      b.setAttribute('title', b.getAttribute('aria-label'));
    }
  }
  function toggleTheme() {
    var next = isDark() ? 'light' : 'dark';
    // Back to "follow the device" when the choice matches the device anyway.
    var device = darkMq && darkMq.matches ? 'dark' : 'light';
    try { if (next === device) localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, next); } catch (e) { /* private mode */ }
    applyTheme(next === device ? null : next);
  }
  // Logos: <img data-src-light="…" data-src-dark="…">
  function swapLogos() {
    var dark = isDark();
    document.querySelectorAll('img[data-src-dark]').forEach(function (img) {
      var want = dark ? img.getAttribute('data-src-dark') : img.getAttribute('data-src-light');
      if (want && img.getAttribute('src') !== want) img.setAttribute('src', want);
    });
  }
  applyTheme(storedTheme());
  if (darkMq && darkMq.addEventListener) darkMq.addEventListener('change', function () { applyTheme(storedTheme()); });

  // ---------- Talking to the Dashboard ----------
  function bg(url, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    opts.headers = Object.assign({ 'X-TDC-Background': '1', 'Accept': 'application/json' }, opts.headers || {});
    return fetch(url, opts);
  }
  function getJson(url) {
    return bg(url).then(function (r) {
      if (r.status === 401) { goLogin(); throw new Error('Logged out'); }
      if (r.status === 423) { goLock(); throw new Error('Locked'); }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function here() { return location.pathname + location.search; }
  function goLogin() { location.href = '/login?next=' + encodeURIComponent(here()); }
  function goLock() { location.href = '/lock?next=' + encodeURIComponent(here()); }

  // ---------- Header ----------
  var phoneMq = window.matchMedia ? window.matchMedia('(max-width: 640px)') : null;
  var isPhone = function () { return !!(phoneMq && phoneMq.matches); };
  var parts = {};

  function longDate(d) {
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }
  function initials(name) {
    var w = String(name || '').replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, '').replace(/,.*$/, '').split(/\s+/).filter(function (x) { return /^[A-Za-z]/.test(x) && !/^(dds|dmd|rdh|md|phd|jr|sr)\.?$/i.test(x); });
    return ((w[0] || '?').charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : '')).toUpperCase();
  }

  function logoImg(cls, light, dark, alt) {
    var img = el('img', { 'class': cls, src: isDark() ? dark : light, 'data-src-light': light, 'data-src-dark': dark, alt: alt });
    return img;
  }

  function buildHeader() {
    var moduleId = document.body.getAttribute('data-module') || 'dashboard';
    var header = el('header', { 'class': 'tdc-header' });
    var row = el('div', { 'class': 'tdc-header-in' });

    var brand = el('a', { 'class': 'tdc-brand', href: '/', 'aria-label': 'Toledo Dental Care — Home' }, [
      logoImg('tdc-logo-full', '/shared/logo-horizontal.png', '/shared/logo-horizontal-dark.png', 'Toledo Dental Care'),
      logoImg('tdc-logo-mark', '/shared/logo-mark.png', '/shared/logo-mark-dark.png', 'Toledo Dental Care')
    ]);
    var title = el('p', { 'class': 'tdc-appname-title', text: document.body.getAttribute('data-module-name') || (moduleId === 'dashboard' ? 'Dental Dashboard' : '') });
    var date = el('div', { 'class': 'tdc-appname-date' });
    var dateText = longDate(new Date());
    if (moduleId === 'dashboard' && location.pathname === '/') dateText += ' · ' + greeting();
    date.textContent = dateText;
    var appname = el('div', { 'class': 'tdc-appname' }, [title, date]);

    var row1 = el('div', { 'class': 'tdc-hrow1' });
    var row2 = el('div', { 'class': 'tdc-hrow2' });
    var right = el('div', { 'class': 'tdc-hright' }, [row1, row2]);
    var userBtn = el('button', { type: 'button', 'class': 'tdc-hctl tdc-user-btn', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': 'Menu' });

    row.appendChild(brand); row.appendChild(appname); row.appendChild(right); row.appendChild(userBtn);
    header.appendChild(row);
    var phoneBox = el('div', { 'class': 'tdc-header-phone' });
    header.appendChild(phoneBox);
    document.body.insertBefore(header, document.body.firstChild);

    parts = { header: header, title: title, row1: row1, row2: row2, userBtn: userBtn, phoneBox: phoneBox, moduleId: moduleId };
  }

  // Apps list (Home, modules, Settings, other apps), used by the Apps menu and More.
  function appsList(nav, cls) {
    var list = el('div', { 'class': cls });
    var cur = parts.moduleId;
    function item(href, label, iconName, opts) {
      opts = opts || {};
      var a = el('a', { href: href });
      if (opts.module) a.setAttribute('data-module', opts.module);
      if (opts.sub) a.className = 'tdc-sub';
      else a.appendChild(el('span', { 'class': 'tdc-swatch', html: icon(iconName) }));
      a.appendChild(document.createTextNode(label));
      if (opts.current) a.setAttribute('aria-current', 'page');
      if (opts.external) { a.target = '_blank'; a.rel = 'noopener'; a.insertAdjacentHTML('beforeend', '<span class="tdc-ext">' + icon('link') + '</span>'); }
      list.appendChild(a);
    }
    list.appendChild(el('h3', { text: 'Apps' }));
    item('/', 'Home', 'home', { module: 'dashboard', current: location.pathname === '/' });
    (nav.modules || []).forEach(function (m) {
      item(m.href, m.name, m.icon, { module: m.id, current: m.id === cur && (m.nav || []).length < 2 });
      if (m.id === cur) (m.nav || []).forEach(function (n) { item(n.href, n.label, null, { sub: true, current: location.pathname === n.href.replace(/\/$/, '') || location.pathname === n.href }); });
    });
    if (nav.settings) item('/settings', 'Settings', 'settings', { current: location.pathname.indexOf('/settings') === 0 });
    if ((nav.links || []).length) {
      list.appendChild(el('h3', { text: 'Other apps' }));
      nav.links.forEach(function (l) { item(l.url, l.name, l.icon, { external: true, module: l.id }); });
    }
    return list;
  }

  var openMenu = null;
  function closeMenus() {
    if (!openMenu) return;
    openMenu.panel.hidden = true;
    if (openMenu.scrim) openMenu.scrim.hidden = true;
    openMenu.btn.setAttribute('aria-expanded', 'false');
    openMenu = null;
  }
  function toggle(btn, panel, scrim) {
    var wasOpen = openMenu && openMenu.panel === panel;
    closeMenus();
    if (wasOpen) return;
    panel.hidden = false;
    if (scrim) scrim.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    openMenu = { btn: btn, panel: panel, scrim: scrim };
    var first = panel.querySelector('a, button');
    if (first) first.focus();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openMenu) { var b = openMenu.btn; closeMenus(); b.focus(); } });
  document.addEventListener('click', function (e) {
    if (openMenu && !openMenu.panel.contains(e.target) && !openMenu.btn.contains(e.target)) closeMenus();
  });

  function postForm(action, label, iconName, cls, next) {
    var f = el('form', { method: 'post', action: action });
    if (next) f.appendChild(el('input', { type: 'hidden', name: 'next', value: here() }));
    f.appendChild(withIcon(el('button', { type: 'submit', 'class': cls || '' }, [label]), iconName));
    return f;
  }

  function fillHeader(me, nav) {
    var cur = (nav.modules || []).filter(function (m) { return m.id === parts.moduleId; })[0];
    if (cur && !parts.title.textContent) parts.title.textContent = cur.name;
    if (!parts.title.textContent) parts.title.textContent = 'Dental Dashboard';
    document.title = document.title || parts.title.textContent;

    // Row 1: Apps, user, theme, Lock, Log out
    var row1 = parts.row1;
    var appsWrap = el('div', { 'class': 'tdc-pop' });
    var appsBtn = withIcon(el('button', { type: 'button', 'class': 'tdc-hctl', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, ['Apps']), 'grid');
    var appsMenu = appsList(nav, 'tdc-menu');
    appsMenu.hidden = true;
    appsBtn.addEventListener('click', function (e) { e.stopPropagation(); toggle(appsBtn, appsMenu); });
    appsWrap.appendChild(appsBtn); appsWrap.appendChild(appsMenu);
    row1.appendChild(appsWrap);
    var userLink = el('a', { 'class': 'tdc-hctl', href: '/account', title: 'My account' }, [el('span', { 'class': 'tdc-initials', text: initials(me.name) }), me.name]);
    if (location.pathname === '/account') userLink.setAttribute('aria-current', 'page');
    row1.appendChild(userLink);
    var themeBtn = el('button', { type: 'button', 'class': 'tdc-hctl', 'data-tdc-theme-btn': '' });
    themeBtn.addEventListener('click', toggleTheme);
    row1.appendChild(themeBtn);
    if (nav.canLock) row1.appendChild(postForm('/lock', 'Lock', 'lock', 'tdc-hctl', true));
    row1.appendChild(postForm('/logout', 'Log out', 'logout', 'tdc-hctl'));
    applyTheme(storedTheme());

    // Phone: initials ▾ opens the More sheet.
    parts.userBtn.appendChild(el('span', { 'class': 'tdc-initials', text: initials(me.name) }));
    parts.userBtn.insertAdjacentHTML('beforeend', icon('down'));
    buildMore(me, nav);
  }

  // ---------- Phone: bottom tab bar + More sheet ----------
  function buildMore(me, nav) {
    var scrim = el('div', { 'class': 'tdc-sheet-scrim', hidden: '' });
    var sheet = el('div', { 'class': 'tdc-sheet', role: 'dialog', 'aria-label': 'More', hidden: '' });
    var actionsSlot = el('div', { 'class': 'tdc-sheet-actions' });
    sheet.appendChild(actionsSlot);
    sheet.appendChild(appsList(nav, 'tdc-sheet-list'));
    var acct = el('div', { 'class': 'tdc-sheet-list' });
    acct.appendChild(el('h3', { text: me.name }));
    acct.appendChild(withIcon(el('a', { href: '/account' }, ['My account']), 'user'));
    var t = withIcon(el('button', { type: 'button' }, ['Light / dark theme']), 'moon');
    t.addEventListener('click', toggleTheme);
    acct.appendChild(t);
    if (nav.canLock) acct.appendChild(postForm('/lock', 'Lock', 'lock', '', true));
    acct.appendChild(postForm('/logout', 'Log out', 'logout'));
    sheet.appendChild(acct);
    document.body.appendChild(scrim);
    document.body.appendChild(sheet);
    scrim.addEventListener('click', closeMenus);
    parts.sheet = sheet; parts.sheetActions = actionsSlot;

    // The tab bar: the page's status tiles, or Home when there are none.
    var bar = document.querySelector('.tdc-stats');
    if (!bar) {
      bar = el('nav', { 'class': 'tdc-stats tdc-tabbar-only', 'aria-label': 'Tabs' });
      var home = el('a', { 'class': 'tdc-stat', 'data-status': 'accent', href: '/' }, [el('span', { 'class': 'tdc-stat-count' }), el('span', { 'class': 'tdc-stat-label', text: 'Home' })]);
      withIcon(home, 'home');
      if (location.pathname === '/') home.setAttribute('aria-current', 'page');
      bar.appendChild(home);
      document.body.appendChild(bar);
    }
    var more = el('button', { type: 'button', 'class': 'tdc-stat tdc-stat-more', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, [el('span', { 'class': 'tdc-stat-count' }), el('span', { 'class': 'tdc-stat-label', text: 'More' })]);
    withIcon(more, 'menu');
    bar.appendChild(more);
    more.addEventListener('click', function (e) { e.stopPropagation(); toggle(more, sheet, scrim); });
    parts.userBtn.addEventListener('click', function (e) { e.stopPropagation(); toggle(parts.userBtn, sheet, scrim); });
  }

  // Search rows: add a "Filters" button for phones when there are dropdowns.
  function prepareFind() {
    document.querySelectorAll('.tdc-find').forEach(function (f) {
      if (!f.querySelector('select') || f.querySelector('.tdc-filters-btn')) return;
      var b = el('button', { type: 'button', 'class': 'tdc-filters-btn', 'aria-expanded': 'false', text: 'Filters' });
      b.addEventListener('click', function () {
        var open = f.classList.toggle('tdc-open');
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      var search = f.querySelector('input[type="search"], .tdc-search');
      if (search && search.nextSibling) f.insertBefore(b, search.nextSibling); else f.appendChild(b);
    });
  }

  // Move page pieces to where they belong for this screen size.
  var placeholders = [];
  function remember(node) {
    if (!node || node.__tdcHome) return;
    var mark = document.createComment('tdc-place');
    node.parentNode.insertBefore(mark, node);
    node.__tdcHome = mark;
    placeholders.push(node);
  }
  function putBack(node) { if (node && node.__tdcHome && node.__tdcHome.parentNode) node.__tdcHome.parentNode.insertBefore(node, node.__tdcHome.nextSibling); }
  function place() {
    var actions = document.querySelector('main .tdc-actions, .tdc-hrow2 .tdc-actions, .tdc-sheet-actions .tdc-actions');
    var head = document.querySelector('.tdc-pagehead');
    var find = document.querySelector('.tdc-find');
    [actions, head, find].forEach(remember);
    if (actions) (isPhone() ? parts.sheetActions : parts.row2).appendChild(actions);
    if (isPhone()) {
      if (head) parts.phoneBox.appendChild(head);
      if (find) parts.phoneBox.appendChild(find);
    } else {
      putBack(head); putBack(find);
    }
    closeMenus();
  }

  // ---------- Keep the login alive while someone is using the page ----------
  var lastBeat = Date.now();
  function activity() {
    if (Date.now() - lastBeat < 60000) return;
    lastBeat = Date.now();
    fetch('/api/activity', { method: 'POST', credentials: 'same-origin' }).catch(function () {});
  }
  function watchSession() {
    setInterval(function () {
      bg('/api/session').then(function (r) { return r.json(); }).then(function (s) {
        if (s.state === 'locked') goLock();
        else if (s.state !== 'ok') goLogin();
      }).catch(function () {});
    }, 30000);
  }

  var resolveReady, rejectReady;
  window.TDC = {
    icon: icon,
    getJson: getJson,
    hydrateIcons: hydrateIcons,
    ready: new Promise(function (res, rej) { resolveReady = res; rejectReady = rej; })
  };
  window.TDC.ready.catch(function () {});

  function start() {
    hydrateIcons();
    swapLogos();
    if (document.body.getAttribute('data-shell') === 'none') return;
    buildHeader();
    prepareFind();
    Promise.all([getJson('/api/me'), getJson('/api/nav')]).then(function (r) {
      fillHeader(r[0], r[1]);
      place();
      if (phoneMq && phoneMq.addEventListener) phoneMq.addEventListener('change', place);
      ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) {
        window.addEventListener(ev, activity, { passive: true });
      });
      watchSession();
      resolveReady({ me: r[0], nav: r[1] });
    }).catch(rejectReady);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
