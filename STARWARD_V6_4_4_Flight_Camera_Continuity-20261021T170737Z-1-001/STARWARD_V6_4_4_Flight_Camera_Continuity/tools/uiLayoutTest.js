/* =========================================================================
   uiLayoutTest.js — guards the docked-dashboard layout contract.

   Regression this test exists to prevent: <body> once carried [data-mode],
   which the tab-button querySelectorAll('[data-mode]') in game.js also
   matched. <body> then received an onclick that re-ran setMode() with a
   lowercase mode on every click, failing every === 'BUILD' comparison and
   hiding every dashboard panel.

   The test parses index.html, style.css and game.js and asserts:
     1. only the three topbar tab buttons own [data-mode];
     2. <body> publishes the mode as [data-ui-mode] only;
     3. per mode, exactly the intended dashboards are visible after
        combining the JS show()/hidden toggles with the CSS mode gating.
   ========================================================================= */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('../index.html');
const css = read('../style.css');
const game = read('../js/game.js');

/* The live UI is everything before the inert <template> legacy snapshot. */
const liveHtml = html.slice(0, html.indexOf('<template'));

/* 1 — [data-mode] belongs to the tab buttons alone. */
const dataModeAttrs = [...liveHtml.matchAll(/data-mode="([^"]+)"/g)].map(m => m[1]);
assert.deepEqual(dataModeAttrs.sort(), ['BUILD', 'FLIGHT', 'MAP'],
  'only the three topbar tabs may declare data-mode in the live DOM');
const bodyTag = liveHtml.match(/<body[^>]*>/)[0];
assert.ok(!bodyTag.includes('data-mode='),
  '<body> must NOT carry [data-mode] — game.js binds onclick to every [data-mode] node');
assert.ok(bodyTag.includes('data-ui-mode="build"'),
  '<body> should pre-declare data-ui-mode="build" for a clean first paint');

/* 2 — setMode() publishes the mode as data-ui-mode and only reads tabs. */
assert.match(game, /document\.body\.dataset\.uiMode = mode\.toLowerCase\(\)/,
  'setMode() must publish the mode as body[data-ui-mode]');
const bindings = [...game.matchAll(/querySelectorAll\('\[data-mode\]'\)/g)];
assert.ok(bindings.length >= 2, 'tab wiring still queries [data-mode]');
assert.ok(!/body\]\.dataset\.mode\b|body\.dataset\.mode\b/.test(game),
  'no leftover body.dataset.mode write');

/* 3 — Combine the JS toggles with the CSS gating into a visibility table. */
const PANELS = ['partsPanel', 'inspector', 'buildStats', 'missionDesign',
  'missionPanel', 'hud', 'flightTools', 'missionOpsPanel', 'mapInfo'];

// JS show()/hidden rules, mirrored from game.js setMode().
const jsVisible = (id, mode) => {
  if (['partsPanel', 'inspector', 'buildStats', 'missionDesign'].includes(id)) return mode === 'BUILD';
  if (['missionPanel', 'hud', 'flightTools'].includes(id)) return mode === 'FLIGHT';
  if (id === 'mapInfo') return mode === 'MAP';
  return true; // missionOpsPanel is CSS-gated only
};

// CSS gating: parse the body[data-ui-mode="x"] #id list.
const gateBlock = css.match(/body\[data-ui-mode="build"\][\s\S]*?display: none !important/);
assert.ok(gateBlock, 'CSS mode-gating block is missing');
const cssHidden = {build: new Set(), flight: new Set(), map: new Set()};
for (const m of gateBlock[0].matchAll(/body\[data-ui-mode="(\w+)"\] #(\w+)/g)) {
  cssHidden[m[1]].add(m[2]);
}

const expected = {
  build: ['partsPanel', 'inspector', 'buildStats', 'missionDesign'],
  flight: ['missionPanel', 'hud', 'flightTools', 'missionOpsPanel'],
  map: ['mapInfo', 'missionOpsPanel']
};

for (const [key, mode] of [['build', 'BUILD'], ['flight', 'FLIGHT'], ['map', 'MAP']]) {
  const visible = PANELS.filter(id => jsVisible(id, mode) && !cssHidden[key].has(id));
  assert.deepEqual(visible.sort(), expected[key].sort(),
    `mode ${mode} must show exactly its own dashboard`);
  // The JS and CSS must never fight: anything the JS shows, the CSS must not hide.
  for (const id of PANELS) {
    assert.ok(!(jsVisible(id, mode) && cssHidden[key].has(id) && id !== 'missionOpsPanel'),
      `JS/CSS disagree for ${id} in ${mode}`);
  }
}

console.log('uiLayoutTest: data-mode isolated to tabs; BUILD/FLIGHT/MAP dashboards resolve to exactly the intended panels');
