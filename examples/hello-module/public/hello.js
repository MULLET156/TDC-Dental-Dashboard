/* Page script for the sample module. Scripts must be files, not inline. */
(function () {
  'use strict';
  var btn = document.getElementById('ping');
  if (!btn) return;
  // Module-relative fetch: build the URL from the page's own base path.
  var base = location.pathname.replace(/\/[^/]*$/, '');
  btn.addEventListener('click', function () {
    fetch(base + '/api/time', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { document.getElementById('ping-out').textContent = 'Module says: ' + new Date(d.time).toLocaleTimeString(); })
      .catch(function () { document.getElementById('ping-out').textContent = 'No answer.'; });
  });
})();

/* Design kit: status tiles and "Group by". A real module would also filter its list. */
(function () {
  'use strict';
  document.querySelectorAll('.tdc-stats .tdc-stat:not(.tdc-stat-more)').forEach(function (tile, _, all) {
    tile.addEventListener('click', function () {
      all.forEach(function (t) { t.setAttribute('aria-selected', t === tile ? 'true' : 'false'); });
    });
  });
  // "Group by" is remembered on this device (DESIGN.md §5).
  document.querySelectorAll('.tdc-seg[data-remember]').forEach(function (seg) {
    var key = seg.getAttribute('data-remember');
    var buttons = Array.prototype.slice.call(seg.querySelectorAll('button'));
    function pick(i) { buttons.forEach(function (b, j) { b.setAttribute('aria-pressed', i === j ? 'true' : 'false'); }); }
    var saved = null;
    try { saved = localStorage.getItem(key); } catch (e) { /* not available */ }
    if (saved !== null && buttons[Number(saved)]) pick(Number(saved));
    buttons.forEach(function (b, i) {
      b.addEventListener('click', function () {
        pick(i);
        try { localStorage.setItem(key, String(i)); } catch (e) { /* not available */ }
      });
    });
  });
})();

/* Design kit: toast and dialog (DESIGN.md §11). */
(function () {
  'use strict';
  var t = document.getElementById('kit-toast');
  if (t) t.addEventListener('click', function () {
    window.TDC.toast('Marked done', { action: 'Undo', onAction: function () { window.TDC.toast('Undone'); } });
  });
  var dlg = document.getElementById('kit-dialog');
  if (!dlg) return;
  var opener = document.getElementById('kit-dialog-open');
  function close() { dlg.hidden = true; opener.focus(); }
  opener.addEventListener('click', function () { dlg.hidden = false; dlg.querySelector('input').focus(); });
  document.getElementById('kit-dialog-close').addEventListener('click', close);
  document.getElementById('kit-dialog-form').addEventListener('submit', function (e) { e.preventDefault(); close(); window.TDC.toast('Task saved'); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dlg.hidden) close(); });
})();
