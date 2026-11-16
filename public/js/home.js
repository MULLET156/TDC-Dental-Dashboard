/* Dashboard home: greeting, shortcuts, module tiles, links to other apps. */
(function () {
  'use strict';

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function withIcon(node, name) { node.insertAdjacentHTML('afterbegin', window.TDC.icon(name)); return node; }

  function greet() {
    var h = new Date().getHours();
    var part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    document.getElementById('today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return part;
  }

  function badge(status) {
    var label = { ok: 'OK', warn: 'Check', alert: 'Needs attention' }[status] || 'OK';
    return el('span', { 'class': 'tdc-badge-' + (status || 'ok') }, label);
  }

  function renderDown(card, t) {
    card.className = 'tdc-card tdc-tile tdc-tile-down';
    card.textContent = '';
    var head = withIcon(el('div', { 'class': 'tdc-tile-head' }), t.icon);
    head.appendChild(document.createTextNode(t.moduleName));
    card.appendChild(head);
    card.appendChild(el('div', { 'class': 'tdc-tile-title' }, t.title));
    card.appendChild(el('div', { 'class': 'tdc-tile-value tdc-muted' }, 'Not responding'));
    card.appendChild(el('div', { 'class': 'tdc-tile-foot' }, 'This module is not answering right now. The rest of the page still works.'));
  }

  function renderTile(card, t, data) {
    card.className = 'tdc-card tdc-tile tdc-status-' + data.status;
    card.textContent = '';
    var head = withIcon(el('div', { 'class': 'tdc-tile-head' }), t.icon);
    head.appendChild(document.createTextNode(t.moduleName));
    if (data.status !== 'ok') head.appendChild(badge(data.status));
    card.appendChild(head);
    var title = data.link ? el('a', { 'class': 'tdc-tile-title', href: data.link }, data.title || t.title) : el('div', { 'class': 'tdc-tile-title' }, data.title || t.title);
    card.appendChild(title);
    if (data.value) card.appendChild(el('div', { 'class': 'tdc-tile-value' }, data.value));
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
  }

  function loadTile(card, t) {
    window.TDC.getJson(t.url).then(function (r) {
      if (r.ok && r.tile) renderTile(card, t, r.tile); else renderDown(card, t);
    }).catch(function () { renderDown(card, t); });
  }

  window.TDC.ready.then(function (ctx) {
    document.getElementById('greeting').textContent = greet() + ', ' + ctx.me.name;
    var nav = ctx.nav;

    var sc = document.getElementById('shortcuts');
    nav.modules.forEach(function (m) {
      sc.appendChild(withIcon(el('a', { 'class': 'tdc-btn', href: m.href }, m.name), m.icon));
    });

    var links = document.getElementById('links');
    if (nav.links.length) document.getElementById('links-title').hidden = false;
    nav.links.forEach(function (l) {
      links.appendChild(withIcon(el('a', { 'class': 'tdc-card tdc-link-card', href: l.url, target: '_blank', rel: 'noopener' }, l.name), l.icon));
    });

    return window.TDC.getJson('/api/tiles');
  }).then(function (r) {
    var grid = document.getElementById('tiles');
    if (!r.tiles.length) { document.getElementById('no-tiles').hidden = false; return; }
    r.tiles.forEach(function (t) {
      var card = el('section', { 'class': 'tdc-card tdc-tile', 'aria-label': t.title });
      card.appendChild(el('div', { 'class': 'tdc-tile-title' }, t.title));
      card.appendChild(el('div', { 'class': 'tdc-muted' }, 'Loading…'));
      grid.appendChild(card);
      if (t.down && !t.url) { renderDown(card, t); return; }
      loadTile(card, t);
      setInterval(function () { if (!document.hidden) loadTile(card, t); }, (t.refreshSeconds || 300) * 1000);
    });
  }).catch(function () { /* shell.js handles login/lock redirects */ });
})();
