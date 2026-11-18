'use strict';
// Builds public/shared/tdc.css from DESIGN.md's tokens (TDC-Office-Plan).
// Dark mode must work two ways: following the device (prefers-color-scheme)
// unless the person picked "light", and when they pick "dark" with the theme
// button. CSS can't share one block between those, so this script writes the
// dark values once and emits them under both selectors.
//
//   node scripts/build-css.js        (then commit public/shared/tdc.css)
const fs = require('node:fs');
const path = require('node:path');

// ---------- DESIGN.md §2 tokens ----------
const LIGHT = {
  ink: '#1F2D33', navy: '#23333D', olive: '#51573D', bg: '#F4F4EF', surface: '#FFFFFF',
  sunk: '#EBECE4', line: '#D7D9CD', muted: '#5C6459',
  alert: '#B3261E', 'alert-soft': '#F9DEDB', 911: '#C62828', warn: '#8A4B00', 'warn-soft': '#FBEAD2', low: '#F2C12E',
  // DESIGN.md says #2D7A3A; on its soft background that is 4.41:1, just under the
  // 4.5:1 rule, so text uses one step darker (Design issue filed).
  ok: '#2C7638', 'ok-soft': '#DCEFDF', new: '#56696E', 'new-soft': '#E9EEEF', info: '#2F557F', 'info-soft': '#E0E8F2',
  'on-solid': '#FFFFFF', // text on a solid status / accent fill
};
// Dark: base from DESIGN.md §2; status colours lightened (same hue) until text is
// at least 4.5:1 on their dark soft background, as DESIGN.md §6 says for accents.
const DARK = {
  ink: '#E5EBE7', navy: '#93B4FF', olive: '#A8B680', bg: '#11191C', surface: '#18242A',
  sunk: '#1F2E34', line: '#2D3E45', muted: '#9AA69F',
  alert: '#E98680', 'alert-soft': '#413336', 911: '#C62828', warn: '#F58500', 'warn-soft': '#403522', low: '#F2C12E',
  ok: '#47BB5B', 'ok-soft': '#204032', new: '#96A9AD', 'new-soft': '#2E3C42', info: '#84AAD1', 'info-soft': '#293C4A',
  'on-solid': '#11191C',
};

// One accent per app (DESIGN.md §2). Dark: lightened only where needed for 4.5:1.
const ACCENTS = {
  //            light accent, soft,     dark accent, dark soft, dark text-on-soft
  dashboard:   ['#23333D', '#E1E6EA', '#93B4FF', '#2E3E50', '#93B4FF'],
  maintenance: ['#0E6B73', '#DCEFEF', '#149AA5', '#173940', '#17AFBC'],
  lab:         ['#4E5833', '#E5E9D8', '#A8B680', '#323E39', '#A8B680'],
  supply:      ['#1C3466', '#DFE6F4', '#698CD6', '#273749', '#85A1DE'],
  daysheet:    ['#2B5FAE', '#E0E9F7', '#5A8BD6', '#243749', '#7BA2DE'],
  finder:      ['#6A3FC4', '#EFE8FC', '#9A7DD7', '#2F3449', '#AC94DE'],
  voice:       ['#A02A72', '#F9E3F0', '#D664AA', '#3A3041', '#DD80B9'],
  numbers:     ['#7A4E1C', '#F5E9DA', '#C17B2C', '#36342A', '#D48F42'],
};

// Header button kinds (DESIGN.md §2): colour, soft, text. "new" uses the accent.
const KINDS_LIGHT = {
  list: ['#1C3466', '#E4E8EF', '#1C3466'],
  log: ['#4E5833', '#E9EBE4', '#4E5833'],
  setup: ['#46575B', '#E8EBEB', '#46575B'],
  money: ['#1E7A3C', '#E4F1E8', '#1E7A3C'],
  warn: ['#8A4B00', '#F3E9E0', '#8A4B00'],
  // DESIGN.md says #0891B2; that is 3.2–3.7:1 for text, under the 4.5:1 rule.
  // Border and soft stay cyan; text and the filled state use a darker cyan (Design issue filed).
  tool: ['#077D9A', '#E1F4F7', '#067590'],
};
const KINDS_DARK = {
  list: ['#85A1DE', '#273749', '#85A1DE'],
  log: ['#99AA6B', '#2D3A33', '#99AA6B'],
  setup: ['#90A5AA', '#2B393F', '#90A5AA'],
  money: ['#2EBB5C', '#1B3D32', '#2EBB5C'],
  warn: ['#F08200', '#3C3322', '#F08200'],
  tool: ['#0AB1D9', '#153D49', '#0AB1D9'],
};

const vars = (o) => Object.entries(o).map(([k, v]) => `  --tdc-${k}: ${v};`).join('\n');
const kindVars = (o) => Object.entries(o).map(([k, [c, s, t]]) => `  --tdc-k-${k}: ${c}; --tdc-k-${k}-soft: ${s}; --tdc-k-${k}-ink: ${t};`).join('\n');

function accentRules(dark, prefix) {
  return Object.entries(ACCENTS).map(([id, a]) => {
    const [acc, soft, ink] = dark ? [a[2], a[3], a[4]] : [a[0], a[1], a[0]];
    return `${prefix}[data-module="${id}"] { --tdc-accent: ${acc}; --tdc-accent-soft: ${soft}; --tdc-accent-ink: ${ink}; }`;
  }).join('\n');
}

function darkBlock(p) {
  const d = ACCENTS.dashboard;
  return `${p} {\n  color-scheme: dark;\n${vars(DARK)}\n${kindVars(KINDS_DARK)}\n  --tdc-accent: ${d[2]}; --tdc-accent-soft: ${d[3]}; --tdc-accent-ink: ${d[4]};\n  --tdc-shadow: 0 1px 2px rgba(0, 0, 0, .35), 0 2px 10px rgba(0, 0, 0, .3);\n}\n${accentRules(true, p + ' ')}`;
}

const head = `/* TDC Office shared look — CONTRACT §6 and DESIGN.md (TDC-Office-Plan).
   Every module page includes this file. Colours, fonts and logos come from
   TDC-Office-Plan/brand/. DO NOT EDIT BY HAND: change scripts/build-css.js and
   run "node scripts/build-css.js".

   Modules: use the --tdc-* variables and .tdc-* classes; set your accent with
   <body data-module="your-id">. Never load outside fonts. */

/* DESIGN.md §9: the suite's shared file, an exact copy of TDC-Office-Plan/brand/tdc-shared.css
   (fonts, group headings, touch sizes, toasts, dialogs, form fields, printing). Never edit the copy. */
@import url("tdc-shared.css");

/* ---------- Tokens (DESIGN.md §2) ---------- */
:root {
  color-scheme: light;
${vars(LIGHT)}
${kindVars(KINDS_LIGHT)}
  /* The app's accent. Default: Dental Dashboard (logo navy). */
  --tdc-accent: ${ACCENTS.dashboard[0]}; --tdc-accent-soft: ${ACCENTS.dashboard[1]}; --tdc-accent-ink: ${ACCENTS.dashboard[0]};
  --tdc-font: "Figtree", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  --tdc-font-head: "Archivo", "Figtree", system-ui, sans-serif;
  --tdc-font-mono: "JetBrains Mono", ui-monospace, Consolas, monospace;
  --tdc-radius: 10px;
  --tdc-touch: 44px;
  --tdc-width: 1140px;
  --tdc-shadow: 0 1px 2px rgba(31, 45, 51, .05), 0 2px 8px rgba(31, 45, 51, .05);

  /* Older names, kept so pages built on v0.1 keep working. */
  --tdc-text: var(--tdc-ink);
  --tdc-border: var(--tdc-line);
  --tdc-primary: var(--tdc-accent);
  --tdc-primary-dark: var(--tdc-accent);
  --tdc-primary-light: var(--tdc-accent-soft);
  --tdc-ok-bg: var(--tdc-ok-soft);
  --tdc-warn-bg: var(--tdc-warn-soft);
  --tdc-alert-bg: var(--tdc-alert-soft);
  --tdc-header-h: 64px;
}
/* Names tdc-shared.css uses for the app's colours (DESIGN.md §9). --pg is the page colour. */
:root, body, [data-module] {
  --surface: var(--tdc-surface); --line: var(--tdc-line); --sunk: var(--tdc-sunk); --muted: var(--tdc-muted);
  --ink: var(--tdc-ink); --bg: var(--tdc-bg); --accent: var(--tdc-accent); --accent-soft: var(--tdc-accent-soft);
}
body, [data-module]:not(body) { --pg: var(--tdc-page); }
${accentRules(false, '')}

/* ---------- Dark mode (DESIGN.md §6): device setting, or the theme button ---------- */
@media (prefers-color-scheme: dark) {
${darkBlock(':root:not([data-theme="light"])').replace(/^/gm, '  ')}
}
${darkBlock(':root[data-theme="dark"]')}
`;

const body = fs.readFileSync(path.join(__dirname, 'tdc-css-components.css'), 'utf8').replace(/\r\n/g, '\n');
const out = path.join(__dirname, '..', 'public', 'shared', 'tdc.css');
fs.writeFileSync(out, head + '\n' + body);
console.log(`Wrote ${out}`);
