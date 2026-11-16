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
