'use strict';
// The shared look (DESIGN.md): fonts are local, every class from §8 exists,
// every app accent is set, and dark mode works both ways.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'shared', 'tdc.css'), 'utf8');
const shell = fs.readFileSync(path.join(__dirname, '..', 'public', 'shared', 'shell.js'), 'utf8');

const shared = fs.readFileSync(path.join(__dirname, '..', 'public', 'shared', 'tdc-shared.css'), 'utf8');
const sharedJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'shared', 'tdc-shared.js'), 'utf8');

test('tdc.css imports the suite file tdc-shared.css first (DESIGN.md §9)', () => {
  const firstRule = css.replace(/\/\*[\s\S]*?\*\//g, '').trim().split('\n')[0];
  assert.equal(firstRule, '@import url("tdc-shared.css");');
  assert.match(shared, /^\/\* TDC shared stylesheet — TDC-Office-Plan\/brand\/tdc-shared\.css/);
  assert.match(sharedJs, /^\/\* TDC shared script — TDC-Office-Plan\/brand\/tdc-shared\.js/);
  // The colour names tdc-shared.css uses are mapped to the --tdc-* tokens.
  for (const v of ['--surface', '--line', '--sunk', '--muted', '--ink', '--bg', '--accent', '--accent-soft', '--pg']) assert.ok(css.includes(`${v}: var(--tdc-`), v);
});

test('fonts come from /shared/fonts only, never from outside', () => {
  const strip = (t) => t.replace(/data:image\/svg\+xml[^)]*/g, '').replace(/xmlns='[^']*'/g, '');
  assert.ok(!/https?:\/\//.test(strip(css)), 'no outside URLs in tdc.css');
  assert.ok(!/https?:\/\//.test(strip(shared)), 'no outside URLs in tdc-shared.css');
  for (const f of ['figtree', 'archivo', 'jetbrains-mono']) {
    assert.ok(shared.includes(`url(fonts/${f}.woff2)`), f); // relative to /shared/ → /shared/fonts/
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'shared', 'fonts', `${f}.woff2`)));
  }
  assert.match(css, /font-stretch: 80%/);
});

test('every class from DESIGN.md §8 is styled', () => {
  for (const c of ['.tdc-stats', '.tdc-stat', '.tdc-pagehead', '.tdc-find', '.tdc-seg', '.tdc-list', '.tdc-group', '.tdc-row', '.tdc-chip', '.tdc-chip-911', '.tdc-meter', '.tdc-hbtn']) {
    assert.ok(css.includes(c + ' ') || css.includes(c + '{') || css.includes(c + ','), c);
  }
  for (const k of ['list', 'new', 'log', 'setup', 'money', 'warn', 'tool']) {
    if (k !== 'list') assert.ok(css.includes(`.tdc-hbtn[data-kind="${k}"]`), k);
  }
  // v0.1 names still work
  for (const c of ['.tdc-card', '.tdc-btn-primary', '.tdc-badge-ok', '.tdc-table', '.tdc-form', '--tdc-primary', '--tdc-text', '--tdc-border']) assert.ok(css.includes(c), c);
});

test('every app accent from DESIGN.md is set, light and dark', () => {
  const light = { dashboard: '#23333D', maintenance: '#0E6B73', lab: '#4E5833', supply: '#1C3466', daysheet: '#2B5FAE', finder: '#6A3FC4', voice: '#A02A72', numbers: '#7A4E1C' };
  for (const [id, hex] of Object.entries(light)) {
    assert.ok(css.includes(`[data-module="${id}"] { --tdc-accent: ${hex};`), id);
    assert.ok(css.includes(`:root[data-theme="dark"] [data-module="${id}"]`), `${id} dark`);
  }
  assert.match(css, /--tdc-bg: #F4F4EF;/);
  assert.match(css, /--tdc-ink: #1F2D33;/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /:root:not\(\[data-theme="light"\]\)/);
});

test('content width is 1140px for header and page', () => {
  assert.match(css, /--tdc-width: 1140px/);
  assert.match(css, /\.tdc-main, \.tdc-header-in, \.tdc-header-phone \{ width: 100%; max-width: var\(--tdc-width\)/);
});

test('shell.js uses the brand logos and never inserts scripts', () => {
  for (const f of ['logo-horizontal.png', 'logo-horizontal-dark.png', 'logo-mark.png', 'logo-mark-dark.png']) {
    assert.ok(shell.includes(`/shared/${f}`), f);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'shared', f)), f);
  }
  // The only script the shell adds is the suite's own shared file (DESIGN.md §9).
  const scripts = shell.match(/\.src = '[^']*'/g) || [];
  assert.deepEqual(scripts, [".src = '/shared/tdc-shared.js'"]);
  assert.ok(!/\beval\(|new Function\(|innerHTML\s*=\s*[^'"]*\+/.test(shell));
});

test('tdc.css is up to date with scripts/build-css.js', () => {
  const { execFileSync } = require('node:child_process');
  const lf = (t) => t.replace(/\r\n/g, '\n'); // Windows checkouts may use CRLF
  const before = lf(css);
  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'build-css.js')]);
  const after = lf(fs.readFileSync(path.join(__dirname, '..', 'public', 'shared', 'tdc.css'), 'utf8'));
  assert.equal(after, before, 'run "node scripts/build-css.js" and commit tdc.css');
});

test('header line and page banner follow the page colour (DESIGN.md 2026-11-16)', () => {
  const css2 = fs.readFileSync(path.join(__dirname, '..', 'public', 'shared', 'tdc.css'), 'utf8');
  assert.match(css2, /\.tdc-header \{[^}]*border-bottom: 4px solid var\(--tdc-page\)/);
  assert.match(css2, /\.tdc-pagehead \{[^}]*background: var\(--tdc-page-soft\)[^}]*border-left: 6px solid var\(--tdc-page\)/);
  for (const s of ['alert', 'warn', 'ok', 'new', 'info']) assert.ok(css2.includes(`body[data-page-status="${s}"]`), s);
  for (const k of ['list', 'log', 'setup', 'money', 'warn', 'tool']) assert.ok(css2.includes(`body[data-page-kind="${k}"]`), k);
  assert.match(css2, /\.tdc-find select \{[^}]*background: var\(--tdc-sunk\)/);
  assert.ok(shell.includes('function pageColour()'));
});
