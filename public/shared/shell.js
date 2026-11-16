/* TDC Office shared shell (CONTRACT §6). Include on every page:
 *   <link rel="stylesheet" href="/shared/tdc.css">
 *   <script src="/shared/shell.js" defer></script>
 *   <body data-module="daysheet"> ... <main class="tdc-main"> ... </main>
 *
 * It draws the header (logo, Home, module links, the current module's own
 * pages, user name, Lock, Log out), keeps the login alive while someone is
 * using the page, and sends them to the lock or login screen when needed.
 * Modules can use window.TDC.icon(name) and window.TDC.ready (a Promise
 * that resolves to { me, nav }).
 */
(function () {
  'use strict';

  var ICONS = {
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    flask: '<path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 15h9"/>',
    box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
    wrench: '<path d="M15 4.2a5 5 0 0 0-6 6.3L3.5 16a2.1 2.1 0 0 0 3 3L12 13.5a5 5 0 0 0 6.3-6l-3 3-2.6-.7-.7-2.6z"/>',
    home: '<path d="M3 11 12 4l9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 16l-4-4 4-4M5 12h11"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    link: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };

  function icon(name) {
    return '<svg class="tdc-icon" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS.home) + '</svg>';
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k]; // only ever used with our own icon markup
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

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

  function isCurrent(href) {
    var p = location.pathname;
    if (href === '/') return p === '/';
    return p === href || p === href.replace(/\/$/, '') || (href.length > 1 && p.indexOf(href.replace(/\/$/, '') + '/') === 0);
  }

  function navLink(href, label, iconName, opts) {
    opts = opts || {};
    var a = el('a', { href: href });
    if (iconName) a.innerHTML = icon(iconName);
    a.appendChild(document.createTextNode(label));
    if (opts.current) a.setAttribute('aria-current', 'page');
    if (opts.external) { a.target = '_blank'; a.rel = 'noopener'; }
    return a;
  }

  function drawHeader(me, nav) {
    var moduleId = document.body.getAttribute('data-module') || '';
    var header = el('header', { 'class': 'tdc-header' });
    var row = el('div', { 'class': 'tdc-header-row' });

    var brand = el('a', { 'class': 'tdc-brand', href: '/', 'aria-label': 'Toledo Dental Care — Home' }, [
      el('img', { src: '/shared/logo-horizontal.png', alt: 'Toledo Dental Care', width: '122', height: '42' })
    ]);
    row.appendChild(brand);

    var collapse = el('div', { 'class': 'tdc-collapse' });
    var links = el('nav', { 'class': 'tdc-nav', 'aria-label': 'Main' });
    links.appendChild(navLink('/', 'Home', 'home', { current: location.pathname === '/' }));
    (nav.modules || []).forEach(function (m) {
      links.appendChild(navLink(m.href, m.name, m.icon, { current: m.id === moduleId }));
    });
    if (nav.settings) links.appendChild(navLink('/settings', 'Settings', 'settings', { current: location.pathname.indexOf('/settings') === 0 }));
    collapse.appendChild(links);

    var user = el('div', { 'class': 'tdc-user' });
    user.appendChild(navLink('/account', me.name, 'user', { current: location.pathname === '/account' }));
    if (nav.canLock) {
      var lockForm = el('form', { method: 'post', action: '/lock' }, [
        el('input', { type: 'hidden', name: 'next', value: here() }),
        el('button', { type: 'submit', title: 'Lock this screen (unlock with your PIN)', html: icon('lock') + 'Lock' })
      ]);
      user.appendChild(lockForm);
    }
    user.appendChild(el('form', { method: 'post', action: '/logout' }, [
      el('button', { type: 'submit', html: icon('logout') + 'Log out' })
    ]));
    collapse.appendChild(user);
    row.appendChild(collapse);

    var menuBtn = el('button', { type: 'button', 'class': 'tdc-btn tdc-menu-btn', 'aria-expanded': 'false', 'aria-label': 'Menu', html: icon('menu') });
    menuBtn.addEventListener('click', function () {
      var open = header.classList.toggle('tdc-open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    row.appendChild(menuBtn);
    header.appendChild(row);

    // The current module's own pages, as a second row.
    var current = (nav.modules || []).filter(function (m) { return m.id === moduleId; })[0];
    var sub = null;
    if (current && current.nav && current.nav.length) {
      sub = el('div', { 'class': 'tdc-subnav' });
      var subRow = el('div', { 'class': 'tdc-header-row' });
      var subNav = el('nav', { 'class': 'tdc-nav', 'aria-label': current.name });
      var best = null;
      current.nav.forEach(function (n) { if (isCurrent(n.href) && (!best || n.href.length > best.length)) best = n.href; });
      current.nav.forEach(function (n) { subNav.appendChild(navLink(n.href, n.label, null, { current: n.href === best })); });
      subRow.appendChild(subNav);
      sub.appendChild(subRow);
    }

    document.body.insertBefore(header, document.body.firstChild);
    if (sub) header.appendChild(sub);
  }

  // Keep the login alive while someone is actually using the page
  // (tapping, typing, scrolling), at most once a minute.
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
    ready: new Promise(function (res, rej) { resolveReady = res; rejectReady = rej; })
  };
  window.TDC.ready.catch(function () {});

  function start() {
    if (document.body.getAttribute('data-shell') === 'none') return;
    Promise.all([getJson('/api/me'), getJson('/api/nav')]).then(function (r) {
      drawHeader(r[0], r[1]);
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
