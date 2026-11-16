'use strict';
// The "Design kit" page of the sample module: every shared class from
// DESIGN.md §8 in use, with made-up names and numbers. Module agents: copy the
// markup you need. Icons: <span data-icon="bell"></span> (shell.js fills them in).
// Statuses: data-status="accent|alert|911|warn|low|ok|new|info".

module.exports = `
<!-- Status tiles: one per status. aria-selected="true" = the tile being shown.
     On phones they become the bottom tab bar (data-short = short label). -->
<nav class="tdc-stats" aria-label="Show">
  <button class="tdc-stat" data-status="accent" aria-selected="true"><span class="tdc-stat-count">12</span><span data-icon="bell"></span><span class="tdc-stat-label">Today</span></button>
  <button class="tdc-stat" data-status="alert" aria-selected="false"><span class="tdc-stat-count">3</span><span data-icon="alert"></span><span class="tdc-stat-label">Overdue</span><span class="tdc-stat-badge">1 911</span></button>
  <button class="tdc-stat" data-status="warn" aria-selected="false"><span class="tdc-stat-count">5</span><span data-icon="clock"></span><span class="tdc-stat-label" data-short="Soon">Due soon</span></button>
  <button class="tdc-stat" data-status="new" aria-selected="false"><span class="tdc-stat-count">4</span><span data-icon="pending"></span><span class="tdc-stat-label" data-short="New">Not started</span></button>
  <button class="tdc-stat" data-status="ok" aria-selected="false"><span class="tdc-stat-count">27</span><span data-icon="check"></span><span class="tdc-stat-label" data-short="Done">Completed</span></button>
</nav>

<!-- Page banner: icon + title, mono count, and a one-line help text.
     shell.js hides .tdc-help behind an (i) button after the title. -->
<header class="tdc-pagehead">
  <h2><span data-icon="bell"></span>Today</h2>
  <span class="tdc-count">24 need attention</span>
  <p class="tdc-help">Everything due today or late. Tap a tile above to switch.</p>
</header>

<!-- Search + filters. On phones the dropdowns hide behind a "Filters" button. -->
<div class="tdc-find">
  <input type="search" placeholder="Search tasks and subtasks…" aria-label="Search">
  <select aria-label="Frequency"><option>All frequencies</option><option>Daily</option><option>Weekly</option><option>Monthly</option></select>
  <select aria-label="Lab"><option>All labs</option><option>In-house</option><option>Smile Lab</option></select>
</div>

<!-- Group by: remembered on this device by hello.js -->
<div class="tdc-groupby">
  <span class="tdc-seg-label">Group by</span>
  <div class="tdc-seg" role="group" aria-label="Group by" data-remember="hello-groupby">
    <button type="button" aria-pressed="true">Due date</button>
    <button type="button" aria-pressed="false">Case type</button>
    <button type="button" aria-pressed="false">Lab</button>
  </div>
</div>

<!-- A list: groups and rows with a 6px status stripe -->
<section class="tdc-list" aria-label="Cases">
  <h3 class="tdc-group" data-status="911">911 · Not finished, patient in within 2 days <span class="tdc-count">2</span></h3>
  <div class="tdc-row" data-status="alert">
    <div class="tdc-row-main">
      <p class="tdc-row-title">L. Bianchi <span class="tdc-id">#10424</span></p>
      <div class="tdc-row-chips"><span class="tdc-chip">Bridge</span><span class="tdc-chip">#3–5</span><span class="tdc-chip">In-house</span><span class="tdc-chip tdc-chip-911">911</span></div>
      <div class="tdc-row-sub">Next: <strong>Mill</strong></div>
    </div>
    <div class="tdc-row-side">
      <div class="tdc-urgent">Late · Fri, Nov 13</div>
      <div class="tdc-urgent">Delivery Mon, Nov 16</div>
      <span class="tdc-meter" data-status="alert" style="--value: 35%"></span>
    </div>
  </div>
  <div class="tdc-row" data-status="alert">
    <div class="tdc-row-main">
      <p class="tdc-row-title">S. Whitaker <span class="tdc-id">#10426</span></p>
      <div class="tdc-row-chips"><span class="tdc-chip">Implant crown</span><span class="tdc-chip">#19</span><span class="tdc-chip tdc-chip-911">911</span></div>
    </div>
    <div class="tdc-row-side"><div class="tdc-urgent">Delivery Tue, Nov 17</div><span class="tdc-meter" data-status="alert" style="--value: 40%"></span></div>
  </div>
  <h3 class="tdc-group" data-status="warn">Due soon <span class="tdc-count">2</span></h3>
  <div class="tdc-row" data-status="warn">
    <div class="tdc-row-main">
      <p class="tdc-row-title">Shock treat dental unit waterlines</p>
      <div class="tdc-row-chips"><span class="tdc-chip" data-status="warn">Due tomorrow</span><span class="tdc-chip" data-status="info">Monthly</span></div>
    </div>
    <div class="tdc-row-act"><button class="tdc-btn" type="button">Done</button></div>
  </div>
  <div class="tdc-row" data-status="new">
    <div class="tdc-row-main">
      <p class="tdc-row-title">Flush dental unit waterlines before first patient</p>
      <div class="tdc-row-chips"><span class="tdc-chip" data-status="new">Not started</span><span class="tdc-chip">Daily</span></div>
      <div><span class="tdc-meter" data-status="new" style="--value: 50%"></span><span class="tdc-meter-label">2/4 done</span></div>
    </div>
    <div class="tdc-row-act"><button class="tdc-btn" type="button">Done</button></div>
  </div>
  <h3 class="tdc-group" data-status="ok">Ready to deliver <span class="tdc-count">1</span></h3>
  <div class="tdc-row" data-status="ok">
    <div class="tdc-row-main">
      <p class="tdc-row-title">T. Nguyen <span class="tdc-id">#10423</span></p>
      <div class="tdc-row-chips"><span class="tdc-chip">Crown (CEREC)</span><span class="tdc-chip">#19</span><span class="tdc-chip" data-status="ok">Ready to deliver</span></div>
    </div>
    <div class="tdc-row-side"><div>Ready · Sun, Nov 15</div><span class="tdc-meter" data-status="ok" style="--value: 100%"></span></div>
  </div>
</section>

<!-- Stock rows: meter with a threshold tick (--mark) -->
<section class="tdc-list" aria-label="Order list">
  <h3 class="tdc-group">Henry Schein <span class="tdc-count">2 products · $293.10</span></h3>
  <div class="tdc-row" data-status="alert">
    <div class="tdc-row-main">
      <p class="tdc-row-title"><span class="tdc-chip tdc-chip-911">911</span> Universal composite, A1</p>
      <div class="tdc-row-sub">Restorative › Composite · Package of 2</div>
      <div><span class="tdc-meter" data-status="alert" style="--value: 33%; --mark: 33%"></span><span class="tdc-meter-label">1 of 3 · 911 at 1</span></div>
    </div>
    <div class="tdc-row-side" style="font-size:16px;color:var(--tdc-ink);font-weight:700">$213.90</div>
  </div>
  <div class="tdc-row" data-status="low">
    <div class="tdc-row-main">
      <p class="tdc-row-title">Zirconia milling blocks, A3</p>
      <div class="tdc-row-sub">CAD/CAM › Blocks · Box of 4</div>
      <div><span class="tdc-meter" data-status="low" style="--value: 50%; --mark: 50%"></span><span class="tdc-meter-label">1 of 2 · 911 at 1</span></div>
    </div>
    <div class="tdc-row-side" style="font-size:16px;color:var(--tdc-ink);font-weight:700">$79.20</div>
  </div>
</section>

<h2 class="tdc-section-title">Callout and empty state</h2>
<div class="tdc-callout" data-status="alert" role="status"><span data-icon="alert"></span><div><strong>Needs you today</strong>2 lab cases are late · 1 spore test is 2 days late</div></div>
<div class="tdc-empty"><p>All caught up</p>No tasks match “waterline”. <a href="#">Clear search</a></div>

<h2 class="tdc-section-title">Chips and badges</h2>
<div class="tdc-card">
  <div class="tdc-row-chips">
    <span class="tdc-chip">Plain</span><span class="tdc-chip tdc-chip-911">911</span>
    <span class="tdc-chip" data-status="alert">Overdue</span><span class="tdc-chip" data-status="warn">On hold</span>
    <span class="tdc-chip" data-status="ok">Ready</span><span class="tdc-chip" data-status="new">Not started</span><span class="tdc-chip" data-status="info">Sent out</span>
  </div>
  <p style="margin-top:12px"><span class="tdc-badge">Badge</span> <span class="tdc-badge-ok">OK</span> <span class="tdc-badge-warn">Check</span> <span class="tdc-badge-alert">Needs attention</span></p>
</div>

<h2 class="tdc-section-title">Accent per app (data-module)</h2>
<div class="tdc-grid">
  <header class="tdc-pagehead" data-module="dashboard"><h2>Dashboard</h2><span class="tdc-count">navy</span></header>
  <header class="tdc-pagehead" data-module="daysheet"><h2>Daysheet</h2><span class="tdc-count">blue</span></header>
  <header class="tdc-pagehead" data-module="finder"><h2>Treatment Finder</h2><span class="tdc-count">violet</span></header>
  <header class="tdc-pagehead" data-module="voice"><h2>Voice Charting</h2><span class="tdc-count">magenta</span></header>
  <header class="tdc-pagehead" data-module="numbers"><h2>Practice Numbers</h2><span class="tdc-count">bronze</span></header>
  <header class="tdc-pagehead" data-module="lab"><h2>Lab Tracker</h2><span class="tdc-count">olive</span></header>
  <header class="tdc-pagehead" data-module="supply"><h2>Supply Room</h2><span class="tdc-count">navy</span></header>
  <header class="tdc-pagehead" data-module="maintenance"><h2>Maintenance</h2><span class="tdc-count">teal</span></header>
</div>

<h2 class="tdc-section-title">Cards, buttons, form, table</h2>
<div class="tdc-grid">
  <div class="tdc-card">
    <h3>Buttons</h3>
    <div class="tdc-btn-row"><button class="tdc-btn tdc-btn-primary" type="button">Save</button><button class="tdc-btn" type="button">Cancel</button><button class="tdc-btn tdc-btn-danger" type="button">Delete</button></div>
  </div>
  <form class="tdc-card tdc-form" action="#" method="get">
    <h3>Form</h3>
    <label>Task name<input name="name" value="Check oxygen levels"></label>
    <label>Frequency<select name="f"><option>Weekly</option></select></label>
  </form>
  <div class="tdc-card tdc-table-wrap">
    <table class="tdc-table"><thead><tr><th>Item</th><th>Due</th></tr></thead>
    <tbody><tr><td>Spore test</td><td class="tdc-mono">Mon, Nov 16</td></tr><tr><td>Eyewash check</td><td class="tdc-mono">Fri, Nov 20</td></tr></tbody></table>
  </div>
</div>
`;
