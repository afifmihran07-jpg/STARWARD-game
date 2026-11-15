/* UI fixes (demo polish): one section per fix. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeGame, element} from './_gameHarness.js';
import {updateFlightUI, formatHudDistance} from '../js/ui/flightUI.js';
import {formatDistance} from '../js/physics/orbitalMechanics.js';

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

/* ---- Fix 5: flight-HUD distance formatting -------------------------------- */
{
  const AU = 149597870700;
  const cases = [
    [0, '0 m'], [850, '850 m'], [185300, '185.3 km'], [999.94e3, '999.9 km'],
    [35786e3, '35,786 km'], [99999e3, '99,999 km'], [100000e3, '100,000 km'],
    [384400e3, '0.38 million km'], [1.5e9, '1.50 million km'], [0.1 * AU, '14.96 million km'],
    [0.2 * AU, '0.200 AU'], [AU, '1.000 AU'], [5.2 * AU, '5.200 AU'], [Infinity, '∞']
  ];
  for (const [m, want] of cases) eq(formatHudDistance(m), want, `formatHudDistance(${m})`);
  // Shared map formatter is untouched.
  eq(formatDistance(384400e3), '384.4 Mm', 'map formatDistance unchanged (Mm)');
  eq(formatDistance(185300), '185.3 km', 'map formatDistance unchanged (km)');
  ok(!/formatDistance\(/.test(read('js/ui/flightUI.js')), 'flight HUD uses only formatHudDistance');
  // Headline altitude keeps a numeric value and a unit after the split.
  const g = makeGame();
  g.loadPresetRocket('earthObservation'); g.launch();
  g.rocket.position.x += 35786e3; // read-only probe of the HUD at GEO distance; not stepped
  updateFlightUI(g, g.orbit);
  ok(/<b>[\d,.]+<\/b><em>km<\/em>/.test(element('metrics').innerHTML), 'headline altitude splits "35,7xx" + "km"');
}

/* ---- Fix 6: suborbital status wording (conditions unchanged) -------------- */
{
  const g = makeGame();
  g.loadPresetRocket('earthObservation'); g.launch();
  g.stage(); // ignite stage 1 so the vehicle has a lit engine with propellant
  const r = g.rocket, body = r.body, atm = body.atmosphere.height;
  // Test-only state: coast above the atmosphere (UI is only read here, never stepped).
  r.position.y += atm + 20000; r.hasFlown = true; r.landed = false; r.throttle = 0; r.spool = 0;
  ok(r.altitudeAboveSurface(body) > atm, 'probe vehicle is above the atmosphere');
  const status = pe => { updateFlightUI(g, {bound: true, periapsis: pe, apoapsis: body.radius + 300e3, eccentricity: 0.1}); return element('flightStatus').textContent; };
  eq(status(body.radius - 50e3), 'SUBORBITAL · PERIAPSIS BELOW SURFACE', 'periapsis below the surface');
  eq(status(body.radius + atm / 2), 'COASTING · PERIAPSIS IN ATMOSPHERE', 'periapsis inside the atmosphere (coasting)');
  eq(status(body.radius + atm + 5000), 'COASTING · PERIAPSIS IN ATMOSPHERE', 'periapsis within atmosphere top + 10 km (unchanged band)');
  ok(!/PERIAPSIS/.test(status(body.radius + atm + 15000)), 'band edge unchanged: atmosphere top + 15 km is outside it');
  // Banner sub-line on atmosphere exit.
  g.atmosphereExitAnnounced = false;
  g.checkAtmosphereExit(body, atm - 100);
  eq(g.flash && g.flash.sub, 'SPACE REACHED · NOT YET IN ORBIT', 'atmosphere-exit banner sub-line');
  ok(!/ACHIEVED/.test(read('js/game.js')), 'old "SPACE ACHIEVED" wording removed');
}

console.log(`${checks} checks passed: UI fixes`);
