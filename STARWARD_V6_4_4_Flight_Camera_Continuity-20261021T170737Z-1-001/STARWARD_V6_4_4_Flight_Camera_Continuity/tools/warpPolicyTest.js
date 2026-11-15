/* A2 / P1-7: altitude-based flight warp limits (flightPolicy.js) are
 * enforced on the applied warp, in FLIGHT and MAP, and shown to the player. */
import assert from 'node:assert/strict';
import {makeGame, element} from './_gameHarness.js';
import {LOW_ALT_WARP_CEILING} from '../js/flight/flightPolicy.js';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, m); checks++; };

function launched() {
  const g = makeGame();
  g.loadPresetRocket('earthObservation');
  g.launch();
  return g;
}
/** Put the vehicle at an altitude above the surface (test fixture, no orbit claim). */
function atAltitude(g, alt) {
  const r = g.rocket, b = r.body;
  const dx = r.position.x - b.position.x, dy = r.position.y - b.position.y, d = Math.hypot(dx, dy);
  const target = d - r.altitudeAboveSurface(b) + alt;
  r.position = {x: b.position.x + dx / d * target, y: b.position.y + dy / d * target};
  r.landed = false; r.hasFlown = true;
}
const stepsPerFrame = g => { const before = g.physicsSteps; g.update(1 / 60); return g.physicsSteps - before; };

/* ---- Request 50x at 30 km -> 2x; at 200 km -> 50x ----------------------- */
{
  const g = launched();
  atAltitude(g, 30e3);
  eq(g.requestWarp(50), 2, 'request 50× at 30 km -> applied 2×');
  eq(g.warp, 50, 'the request itself is kept');
  eq(stepsPerFrame(g), 2, 'physics runs 2 substeps per frame at 30 km');
  eq(element('warpValue').textContent, '2× · LIMIT', 'dock shows the applied warp and the limit');
  ok(/limited to 2× below 120 km \(requested 50×\)/.test(element('warpValue').title), 'tooltip explains the restriction');
  ok(g.toasts.some(t => /Time warp limited to 2× below 120 km — 50× resumes above it/.test(t)), 'the restriction is announced');
  ok(/WARP<\/span><b>2× · LIMITED/.test(element('metricsMore').innerHTML), 'HUD WARP row shows the applied warp, marked limited');

  atAltitude(g, 200e3);
  eq(g.appliedWarp(), 50, 'at 200 km the 50× request is applied');
  eq(stepsPerFrame(g), 50, 'physics runs 50 substeps per frame at 200 km');
  eq(element('warpValue').textContent, '50×', 'no limit marker above 120 km');
}

/* ---- Descending below 120 km clamps automatically; climbing restores ---- */
{
  const g = launched();
  atAltitude(g, 200e3);
  g.requestWarp(50);
  eq(g.appliedWarp(), 50, 'fixture: 50× above the ceiling');
  g.toasts.length = 0;
  atAltitude(g, LOW_ALT_WARP_CEILING - 1000);
  eq(stepsPerFrame(g), 2, 'descending below 120 km: applied warp drops to 2× at once');
  eq(g.appliedWarp(), 2, 'applied 2× below the ceiling');
  ok(g.toasts.some(t => /limited to 2×/.test(t)), 'the automatic clamp is announced');
  const toastsBefore = g.toasts.length;
  g.update(1 / 60); g.update(1 / 60);
  eq(g.toasts.length, toastsBefore, 'announced once, not every frame');
  atAltitude(g, LOW_ALT_WARP_CEILING + 1000);
  eq(g.appliedWarp(), 50, 'back above 120 km the 50× request resumes');
}

/* ---- Clamp both directions -------------------------------------------- */
{
  const g = launched();
  atAltitude(g, 30e3);
  g.stepWarp(1); g.stepWarp(1); g.stepWarp(1);
  eq(g.appliedWarp(), 2, 'stepping up at 30 km never applies more than 2×');
  ok(g.warp > 2, 'the higher request is remembered');
  g.stepWarp(-1);
  eq(g.appliedWarp(), 1, 'stepping down acts on the APPLIED warp immediately (2× -> 1×)');
  eq(g.warp, 1, 'request lowered too');
  g.requestWarp(5);
  eq(g.appliedWarp(), 2, 'buttons are clamped as well (5× -> 2×)');
  // Flight mode never exceeds 50× even above the ceiling.
  atAltitude(g, 300e3);
  g.requestWarp(1000);
  eq(g.appliedWarp(), 50, 'FLIGHT caps at 50× in space');
}

/* ---- MAP: same atmosphere limit while a vehicle is in flight ------------- */
{
  const g = launched();
  atAltitude(g, 30e3);
  g.setMode('MAP');
  g.requestWarp(1000);
  eq(g.appliedWarp(), 2, 'MAP: 2× while the vehicle is below 120 km');
  eq(stepsPerFrame(g), 2, 'MAP: physics substeps follow the applied warp');
  atAltitude(g, 300e3);
  eq(g.appliedWarp(), 1000, 'MAP: full map warp once the vehicle is above 120 km');
  const free = makeGame();
  free.setMode('MAP');
  free.requestWarp(10000);
  eq(free.appliedWarp(), 10000, 'MAP with no vehicle: whole ladder available');
}

/* ---- Real autopilot ascent with 50x requested from the pad --------------- */
{
  const g = launched();
  g.toggleAutopilot(); g.stage();
  g.requestWarp(50);
  const r = g.rocket;
  // ~4,800 frames at 2× to reach 120 km, then 50× to orbit.
  let maxBelow = 0, sawAbove50 = false, frames = 0, mismatches = 0;
  while (frames++ < 30000 && r.guidancePhase !== 'ORBIT' && !r.crashed) {
    const alt = r.altitudeAboveSurface(r.body);
    const applied = g.appliedWarp();
    if (stepsPerFrame(g) !== applied) mismatches++;
    if (alt < LOW_ALT_WARP_CEILING) maxBelow = Math.max(maxBelow, applied);
    else if (applied === 50) sawAbove50 = true;
  }
  eq(mismatches, 0, `every frame integrates exactly the applied warp (${frames} frames)`);
  eq(r.guidancePhase, 'ORBIT', 'the warped ascent still reaches orbit');
  eq(maxBelow, 2, 'never more than 2× below 120 km during the real ascent');
  ok(sawAbove50, '50× applied once above 120 km');
}

console.log(`${checks} checks passed: 2× below 120 km / 50× above in FLIGHT, automatic clamp on descent and restore, ` +
  'both directions clamped, MAP limited while in the atmosphere, applied warp displayed and announced, physics uses the applied warp');
