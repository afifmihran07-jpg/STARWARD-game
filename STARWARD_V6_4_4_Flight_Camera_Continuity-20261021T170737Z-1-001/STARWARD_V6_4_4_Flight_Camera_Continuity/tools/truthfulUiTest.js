/* A2 / P0-5: the UI must not show false states or canned telemetry. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeGame, run, element} from './_gameHarness.js';
import {updateBodyInfo} from '../js/ui/mapUI.js';
import {transferDeltaV} from '../js/physics/physics.js';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, m); checks++; };
const status = () => element('flightStatus').textContent;

/* ---- 1. Load toast reports the real readiness score ------------------- */
{
  const g = makeGame();
  g.loadPresetRocket('starter');
  ok(/\(40% readiness\)/.test(g.toasts.at(-1)), 'starter toast reports its real 40% readiness: ' + g.toasts.at(-1));
  g.loadPresetRocket('earthObservation');
  ok(/\(100% readiness\)/.test(g.toasts.at(-1)), 'earthObservation toast reports 100%: ' + g.toasts.at(-1));
}

/* ---- 2. Flight status never claims powered flight without thrust ------- */
function launchPreset(key) {
  const g = makeGame();
  g.loadPresetRocket(key);
  g.launch();
  return g;
}
{
  const g = launchPreset('earthObservation');
  const r = g.rocket;
  // Airborne, ignited, current stage dry.
  r.nextStage(); r.landed = false; r.hasFlown = true;
  r.position.y += 50000; r.stageFuel[r.stageIndex] = 0; r.throttle = 0; r.spool = 0;
  g.update(1 / 60);
  eq(status(), 'ENGINE OUT · NO ACTIVE STAGE', 'dry stage in flight -> ENGINE OUT');
  // No active engine at all (never ignited) but airborne.
  const g2 = launchPreset('earthObservation');
  g2.rocket.landed = false; g2.rocket.hasFlown = true; g2.rocket.position.y += 20000;
  g2.update(1 / 60);
  eq(status(), 'ENGINE OUT · NO ACTIVE STAGE', 'no active stage in flight -> ENGINE OUT');
  // Lit engine with propellant but throttled to zero: coasting, not powered.
  const g3 = launchPreset('earthObservation');
  const r3 = g3.rocket;
  r3.nextStage(); r3.landed = false; r3.hasFlown = true; r3.position.y += 20000;
  r3.velocity.y += 300; r3.throttle = 0; r3.spool = 0;
  g3.update(1 / 60);
  ok(status() !== 'POWERED ASCENT', 'zero thrust is never POWERED ASCENT: ' + status());
}

// Real flights through the real loop: whenever the badge says POWERED
// ASCENT, the engines are producing thrust at that moment.
for (const key of ['earthObservation', 'starter']) {
  const g = launchPreset(key);
  const r = g.rocket;
  g.stage(); r.throttle = 1;
  let poweredFrames = 0, engineOutSeen = false;
  // 900 s covers burnout of the retuned (Phase 3 B4) two-stage presets.
  for (let i = 0; i < 60 * 900; i++) {
    g.update(1 / 60);
    if (status() === 'POWERED ASCENT') {
      poweredFrames++;
      assert.ok(g.rocket.actualThrust > 0, `${key}: POWERED ASCENT shown with zero thrust at t=${(i / 60).toFixed(2)} s`);
    }
    if (status() === 'ENGINE OUT · NO ACTIVE STAGE') engineOutSeen = true;
    if (g.rocket.crashed) break;
  }
  ok(poweredFrames > 0, `${key}: powered ascent observed during the burn`);
  ok(engineOutSeen, `${key}: ENGINE OUT shown after the last stage burns out`);
  checks++; // the per-frame thrust assertion above
}

/* ---- 3. Map panel: units, transfer time, live telemetry rack ----------- */
{
  const g = launchPreset('earthObservation');
  const r = g.rocket;
  r.landed = false; r.hasFlown = true; r.position.y += 300000; r.velocity.x -= 7700;
  const earth = g.bodies.find(b => b.id === 'earth'), mars = g.bodies.find(b => b.id === 'mars');
  const sun = g.bodies.find(b => b.id === 'sun'), moon = g.bodies.find(b => b.id === 'moon');
  g.target = mars;
  updateBodyInfo(g);
  const rel = Math.hypot(r.velocity.x - mars.velocity.x, r.velocity.y - mars.velocity.y);
  eq(element('targetRelativeVelocity').textContent, (rel / 1000).toFixed(2) + ' km/s', 'relative velocity converted m/s -> km/s');
  ok(rel / 1000 > 1 && rel / 1000 < 100, 'relative velocity is a plausible km/s figure');
  // Textbook Earth->Mars Hohmann (circular, coplanar): ~2.94 km/s departure,
  // ~2.65 km/s arrival, ~259 days.
  const tr = transferDeltaV(earth.orbit.radius, mars.orbit.radius, sun.mu);
  const hohmann = tr.time;
  ok(hohmann > 255 * 86400 && hohmann < 262 * 86400, 'Earth->Mars Hohmann time ~259 days: ' + (hohmann / 86400).toFixed(1));
  ok(Math.abs(tr.departure - 2945) < 30, 'Earth->Mars departure Δv ~2.94 km/s: ' + tr.departure.toFixed(0));
  ok(Math.abs(tr.arrival - 2649) < 30, 'Earth->Mars arrival Δv ~2.65 km/s: ' + tr.arrival.toFixed(0));
  const eta = element('targetEta').textContent;
  ok(eta !== '—' && !eta.startsWith('T-'), 'transfer time shown as a Hohmann duration: ' + eta);
  eq(element('bridgeEta').textContent, eta, 'bridge ETA matches the Hohmann transfer time');
  eq(element('rackVehicle').textContent, 'IN FLIGHT', 'telemetry rack shows real vehicle state');
  eq(element('rackPrimary').textContent, 'EARTH', 'telemetry rack shows the real primary body');
  eq(element('bridgeEncounter').textContent, 'TARGET · MARS', 'no "INTERCEPT" claim for a mere target');
  g.target = moon;
  updateBodyInfo(g);
  eq(element('targetEta').textContent, '—', 'no transfer time when the target does not share the parent');
}

/* ---- 4. No canned telemetry or duplicate labels in the live page ------- */
{
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const live = html.slice(0, html.indexOf('<template id="legacy-3d-source">'));
  for (const fake of ['99.8%', 'DSN LOCK', 'FINE POINTING', '99.4%', 'SYS NOMINAL', 'INTERCEPT ETA', 'J2000',
    'T-04:22:10', '138.4°', 'TCM-3 MIDCOURSE', '24.8 km/s', 'REMAINING ΔV']) {
    ok(!live.includes(fake), 'live page no longer contains canned value: ' + fake);
  }
  eq((live.match(/Altitude \(ASL\)/gi) || []).length, 1, 'one static "Altitude (ASL)" heading');
  const g = launchPreset('earthObservation');
  g.update(1 / 60);
  ok(!/ALTITUDE/i.test(element('metrics').innerHTML), 'altitude metric does not repeat the heading');
  ok(/VELOCITY/.test(element('metrics').innerHTML), 'velocity metric keeps its label');
}

/* ---- 5. Scene labels sit right of the left panel column at every width -- */
{
  const css = fs.readFileSync(new URL('../css/flight-dashboard.css', import.meta.url), 'utf8');
  // The ops panel's horizontal padding widens its outer box beyond `width`.
  const base = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const pad = /\.mission-ops\s*\{\s*padding:\s*\d+px\s+(\d+)px/.exec(base);
  ok(pad, 'parsed .mission-ops horizontal padding');
  const hpad = 2 * Number(pad[1]);
  const chunks = css.split(/@media \(max-width: (\d+)px\)/);
  // chunks: [base, '1100', block, '900', block, ...]; apply the cascade in order.
  const state = {panelLeft: null, panelWidth: null, labelLeft: null};
  const apply = block => {
    const panel = /#missionOpsPanel\s*\{[^}]*?left:\s*(\d+)px[^}]*?width:\s*(\d+)px/.exec(block) ||
                  /#missionOpsPanel\s*\{[^}]*?width:\s*(\d+)px/.exec(block);
    const left = /#missionPanel,\s*body\[data-ui-mode="flight"\] #missionOpsPanel\s*\{\s*left:\s*(\d+)px;\s*width:\s*(\d+)px/.exec(block);
    const width = /#missionOpsPanel\s*\{[^}]*width:\s*(\d+)px/.exec(block);
    if (left) { state.panelLeft = +left[1]; state.panelWidth = +left[2]; }
    else if (panel && panel.length === 3) { state.panelLeft = +panel[1]; state.panelWidth = +panel[2]; }
    else if (width) state.panelWidth = +width[1];
    const label = /\.flight-scene-label\s*\{[^}]*left:\s*(\d+)px/.exec(block);
    if (label) state.labelLeft = +label[1];
  };
  apply(chunks[0]);
  const report = [['base', {...state}]];
  for (let i = 1; i < chunks.length; i += 2) { apply(chunks[i + 1]); report.push([chunks[i] + 'px', {...state}]); }
  for (const [where, s] of report) {
    ok(s.labelLeft != null && s.panelLeft != null && s.panelWidth != null, `${where}: parsed label/panel geometry`);
    const panelRight = s.panelLeft + s.panelWidth + hpad;
    ok(s.labelLeft >= panelRight + 8,
      `${where}: scene labels start at ${s.labelLeft}px, clear of the panels' outer edge at ${panelRight}px`);
  }
}

console.log(`${checks} checks passed: real readiness in toast, no POWERED ASCENT without thrust, ENGINE OUT state, ` +
  'km/s units and Hohmann transfer time on the map, live telemetry rack, no canned telemetry, no duplicate label, scene labels clear of panels');
