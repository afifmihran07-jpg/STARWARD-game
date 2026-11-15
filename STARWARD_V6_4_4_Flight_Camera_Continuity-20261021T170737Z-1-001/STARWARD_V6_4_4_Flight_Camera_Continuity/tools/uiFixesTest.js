/* UI fixes (demo polish): one section per fix. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeGame, element} from './_gameHarness.js';
import {updateFlightUI} from '../js/ui/flightUI.js';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, m); checks++; };
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/** CSS specificity (ids, classes+attributes+pseudo-classes, elements). */
function specificity(sel) {
  const ids = (sel.match(/#[\w-]+/g) || []).length;
  const cls = (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  const el = (sel.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|::?[\w-]+/g, ' ').match(/[a-z][\w-]*/gi) || []).length;
  return ids * 10000 + cls * 100 + el;
}
/** Selectors (outside @media) that set font-size on the pause button. */
function pauseFontRules(css) {
  const base = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...base.matchAll(/([^{}]*#pauseButton[^{}]*)\{([^}]*)\}/g)]
    .filter(m => /font-size/.test(m[2]))
    .map(m => ({sel: m[1].trim(), size: /font-size:\s*([\d.]+)(?:px)?\s*[;}]?/.exec(m[2])?.[1]}));
}

/* ---- Fix 1: PAUSE button paints only its glyph; accessible name ---------- */
{
  const rules = [...pauseFontRules(read('style.css')), ...pauseFontRules(read('css/flight-dashboard.css'))]
    .filter(r => r.sel.includes('flight'));
  const winner = rules.reduce((a, b) => (specificity(b.sel) >= specificity(a.sel) ? b : a));
  eq(winner.size, '0', `most specific flight pause rule hides the text label (${winner.sel})`);
  ok(rules.some(r => r.size === '7' && specificity(r.sel) < specificity(winner.sel)), 'the 7px style.css rule is out-ranked, not deleted');
  const g = makeGame();
  g.paused = false; g.syncFlightTools();
  eq(element('pauseButton').getAttribute('aria-label'), 'Pause (P)', 'aria-label while running');
  g.paused = true; g.syncFlightTools();
  eq(element('pauseButton').getAttribute('aria-label'), 'Resume (P)', 'aria-label while paused');
}

/* ---- Fix 2: stage button says what SPACE will do ------------------------ */
{
  const label = () => (element('stageLine').textContent + ' · ' + element('stageAction').textContent).replace(/ · $/, '');
  // Expected labels at each SPACE press, from the pad (independent of the code).
  const plans = {
    starter: ['IGNITE · STAGE 1', 'FINAL STAGE'],
    earthObservation: ['IGNITE · STAGE 1', 'SEPARATE · STAGE 1', 'FINAL STAGE'],
    lunar: ['IGNITE · STAGE 1', 'SEPARATE · STAGE 1', 'SEPARATE · STAGE 2', 'FINAL STAGE']
  };
  for (const [preset, expected] of Object.entries(plans)) {
    const g = makeGame();
    g.loadPresetRocket(preset); g.launch();
    expected.forEach((want, i) => {
      updateFlightUI(g, g.orbit);
      eq(label(), want, `${preset}: label after ${i} SPACE press(es)`);
      eq(element('stageButton').disabled, want === 'FINAL STAGE', `${preset}: button ${want === 'FINAL STAGE' ? 'disabled' : 'enabled'} at "${want}"`);
      if (want !== 'FINAL STAGE') g.stage();
    });
    if (preset === 'earthObservation') ok(g.rocket.payloadAttached, 'earthObservation: FINAL STAGE while the engineless payload is attached');
  }
}

/* ---- Fix 3: regime label stays above the velocity unit -------------------- */
// Browser-measured (2026-11-15, 5 viewport/DPR configs, "SUPERSONIC" + 11,186 m/s):
// regime text bottom sits 2px above "m/s" at top:69px. At the old 82px it overlapped.
{
  const css = read('css/flight-dashboard.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /body\[data-ui-mode="flight"\] \.fh-velocity-meta \{([^}]*)\}/.exec(css);
  ok(rule, 'velocity meta rule exists');
  const top = Number(/(?:^|;)\s*top:\s*([\d.]+)px/.exec(rule[1])?.[1]);
  ok(top <= 69, `velocity meta top ${top}px <= 69px (regime clear of the unit)`);
  ok(/right:\s*13px/.test(rule[1]) && /align-items:\s*flex-end/.test(rule[1]), 'regime stays right-aligned, away from the velocity number');
}

/* ---- Fix 4: apoapsis shown once on the telemetry card --------------------- */
{
  const html = read('index.html');
  const card = html.slice(html.indexOf('fh-card--telemetry'), html.indexOf('fh-telemetry-foot') + 600);
  ok(!/id="flightTot"/.test(html), 'duplicate "Tot" readout removed from index.html');
  eq((card.match(/id="flightApogee"/g) || []).length, 1, 'telemetry card has exactly one apoapsis readout');
  ok(!/#flightTot/.test(read('js/ui/flightUI.js')), 'flightUI no longer writes #flightTot');
  const g = makeGame();
  g.loadPresetRocket('earthObservation'); g.launch();
  element('flightApogee').textContent = '';
  updateFlightUI(g, g.orbit);
  ok(element('flightApogee').textContent.length > 0, 'remaining apoapsis readout is still updated');
}

console.log(`${checks} checks passed: UI fixes`);
