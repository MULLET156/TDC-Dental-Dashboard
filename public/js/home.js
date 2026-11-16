/* Dashboard home (brand/reference/7-desktop-dashboard.png):
 * "Needs you today" callout, module tiles (5px accent strip), links to the
 * standalone apps, and the modules still to come. */
(function () {
  'use strict';

  // Suite modules (DESIGN.md §2 accents). Shown under "Coming next" until set up.
  var PLANNED = [
    { id: 'daysheet', name: 'Dental Daysheet', icon: 'calendar' },
    { id: 'finder', name: 'Treatment Finder', icon: 'search' },
    { id: 'numbers', name: 'Practice Numbers', icon: 'chart' },
    { id: 'voice', name: 'Voice Charting', icon: 'mic' }
  ];

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function iconBox(name) {
    var s = el('span', { 'class': 'tdc-tile-icon' });
    s.innerHTML = window.TDC.icon(name);
    return s;
  }
  function openLink(href, external) {
    var a = el('a', { 'class': 'tdc-tile-open', href: href }, 'Open');
    a.insertAdjacentHTML('beforeend', ' ' + window.TDC.icon(external ? 'link' : 'arrow'));
    a.querySelector('svg').style.width = '16px';
    if (external) { a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('aria-label', 'Open (new tab)'); }
    return a;
  }
  function head(iconName, name, href, external) {
    var h = el('div', { 'class': 'tdc-tile-head' });
    h.appendChild(iconBox(iconName));
    var n = el(href ? 'a' : 'span', href ? { 'class': 'tdc-tile-name', href: href } : { 'class': 'tdc-tile-name' }, name);
    if (href && external) { n.target = '_blank'; n.rel = 'noopener'; }
    h.appendChild(n);
    if (href) h.appendChild(openLink(href, external));
    return h;
  }

  var alerts = {};
  function drawCallout() {
    var box = document.getElementById('callout');
    var list = Object.keys(alerts).map(function (k) { return alerts[k]; }).filter(Boolean);
    box.textContent = '';
    if (!list.length) return;
    var c = el('div', { 'class': 'tdc-callout', 'data-status': 'alert', role: 'status' });
    c.innerHTML = window.TDC.icon('alert');
    var t = el('div');
    t.appendChild(el('strong', {}, 'Needs you today'));
    t.appendChild(document.createTextNode(list.join(' · ')));
    c.appendChild(t);
    box.appendChild(c);
  }

  function renderDown(card, t) {
    card.className = 'tdc-card tdc-tile tdc-tile-down';
    card.textContent = '';
    card.appendChild(head(t.icon, t.moduleName));
    card.appendChild(el('div', { 'class': 'tdc-tile-value tdc-muted' }, 'Not responding'));
    card.appendChild(el('div', { 'class': 'tdc-muted' }, 'This module is not answering right now. The rest of the page still works.'));
    alerts[t.url] = null; drawCallout();
  }

  function renderTile(card, t, data) {
    card.className = 'tdc-card tdc-tile';
    card.textContent = '';
    card.appendChild(head(t.icon, data.title || t.title, data.link, false));
    var sub = el('div', { 'class': 'tdc-muted' }, t.moduleName);
    sub.style.fontSize = '13px';
    card.appendChild(sub);
    if (data.value) {
      var v = el('div', { 'class': 'tdc-tile-value' }, data.value);
      if (data.status !== 'ok') v.setAttribute('data-status', data.status);
      card.appendChild(v);
    }
    if (data.items && data.items.length) {
      var ul = el('ul');
      data.items.forEach(function (i) {
        var li = el('li');
        li.appendChild(i.href ? el('a', { href: i.href }, i.text) : el('span', {}, i.text));
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }
    if (data.updated) {
      var d = new Date(data.updated);
      if (!isNaN(d)) card.appendChild(el('div', { 'class': 'tdc-tile-foot' }, 'Updated ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })));
    }
    alerts[t.url] = data.status === 'alert' ? (data.title || t.title) + (data.value ? ': ' + data.value : '') : null;
    drawCallout();
  }

  function loadTile(card, t) {
    window.TDC.getJson(t.url).then(function (r) {
      if (r.ok && r.tile) renderTile(card, t, r.tile); else renderDown(card, t);
    }).catch(function () { renderDown(card, t); });
  }

  var nav;
  window.TDC.ready.then(function (ctx) {
    nav = ctx.nav;
    // Office apps: Lab Tracker, Supply Room, Maintenance Tracker (open in a new tab).
    var links = document.getElementById('links');
    nav.links.forEach(function (l) {
      var card = el('section', { 'class': 'tdc-card tdc-tile tdc-link-card', 'data-module': l.id || '', 'aria-label': l.name });
      card.appendChild(head(l.icon, l.name, l.url, true));
      card.appendChild(el('div', { 'class': 'tdc-muted' }, 'Opens in a new tab'));
      links.appendChild(card);
    });
    document.getElementById('links-section').hidden = !nav.links.length;

    // Coming next: suite modules not set up yet.
    var have = {};
    nav.modules.forEach(function (m) { have[m.id] = true; });
    var planned = document.getElementById('planned');
    PLANNED.filter(function (p) { return !have[p.id]; }).forEach(function (p) {
      var d = el('div', { 'data-module': p.id });
      d.appendChild(iconBox(p.icon));
      var t = el('div');
      t.appendChild(el('strong', {}, p.name));
      t.appendChild(el('span', {}, 'Planned'));
      d.appendChild(t);
      planned.appendChild(d);
    });
    document.getElementById('planned-section').hidden = !planned.children.length;
    return window.TDC.getJson('/api/tiles');
  }).then(function (r) {
    var grid = document.getElementById('tiles');
    document.getElementById('tiles-section').hidden = !r.tiles.length;
    document.getElementById('no-tiles').hidden = !!(r.tiles.length || nav.links.length);
    r.tiles.forEach(function (t) {
      var card = el('section', { 'class': 'tdc-card tdc-tile', 'data-module': t.module, 'aria-label': t.title });
      card.appendChild(head(t.icon, t.title));
      card.appendChild(el('div', { 'class': 'tdc-muted' }, 'Loading…'));
      grid.appendChild(card);
      if (t.down && !t.url) { renderDown(card, t); return; }
      loadTile(card, t);
      setInterval(function () { if (!document.hidden) loadTile(card, t); }, (t.refreshSeconds || 300) * 1000);
    });
  }).catch(function () { /* shell.js handles login/lock redirects */ });
})();
