/* B3 / P0-8: launch-to-orbit end to end, from the real launch pad.
 *
 * For every Earth-orbit preset: Game.loadPresetRocket + Game.launch (real pad,
 * never seeded), G engages the autopilot, SPACE ignites, then the real flight
 * path updateOrbits -> controlRocket -> stepRocket runs at 1/60 s until
 * isOrbitVerified() — required within 1 hour of simulated time. The orbit must
 * then stay verified for one full period after cutoff. Orbital elements are
 * cross-checked with an independent vis-viva computation.
 *
 * Reports liftoff mass, propellant used, Δv expended (∫T/m dt), gravity loss
 * (∫g·sinγ dt while thrusting), drag loss (∫D/m dt while thrusting), max-q,
 * max-g, time to orbit, final apoapsis/periapsis/eccentricity and fuel left. */
import assert from 'node:assert/strict';
import {makeGame} from './_gameHarness.js';
import {updateOrbits} from '../js/celestial/solarSystem.js';
import {stepRocket} from '../js/physics/physics.js';
import {gravityAt} from '../js/physics/gravity.js';
import {controlRocket} from '../js/flight/flightController.js';
import {orbitElements, isOrbitVerified} from '../js/physics/orbitalMechanics.js';
import {MISSION_PROFILES} from '../js/construction/missionSystems.js';
import {MISSION_PRESET_CONFIGS} from '../js/construction/missionPresets.js';

const DT = 1 / 60;
const LIMIT = 3600;                                   // seconds of simulated time
const idle = {pressed: () => false};
const failures = [];
let checks = 0;
const check = (cond, msg) => { if (cond) checks++; else failures.push(msg); };

/** Independent apsides (km) from relative state via vis-viva. */
function apsides(r, body) {
  const x = r.position.x - body.position.x, y = r.position.y - body.position.y;
  const vx = r.velocity.x - body.velocity.x, vy = r.velocity.y - body.velocity.y;
  const rad = Math.hypot(x, y), a = 1 / (2 / rad - (vx * vx + vy * vy) / body.mu);
  const h = x * vy - y * vx, e = Math.sqrt(Math.max(0, 1 - h * h / (body.mu * a)));
  return {ap: (a * (1 + e) - body.radius) / 1e3, pe: (a * (1 - e) - body.radius) / 1e3, e, period: 2 * Math.PI * Math.sqrt(a ** 3 / body.mu)};
}

for (const key of ['earthObservation', 'weather', 'communications', 'technology']) {
  const g = makeGame();
  g.loadPresetRocket(key);
  g.launch();
  const r = g.rocket, earth = r.body;
  const tag = `${key}:`;
  // Real pad start: never a seeded or injected orbit.
  check(r && r.landed && !r.hasFlown && r.altitudeAboveSurface(earth) < 1 && !g.seededTestOrbit, `${tag} starts on the launch pad`);
  const target = MISSION_PROFILES[MISSION_PRESET_CONFIGS[key].missionProfile].orbitAlt || 200e3;
  const liftoffMass = r.mass, fuel0 = r.fuel, dvBuilder = r.stats().dv, twr = r.stats().twr;

  // G (autopilot) then SPACE (ignite), as a player would.
  g.toggleAutopilot();
  g.stage();
  check(r.autoGuidance && r.guidanceTargetAltitude === target, `${tag} autopilot on, target ${target / 1e3} km`);

  let t = 0, dvSpent = 0, gravityLoss = 0, dragLoss = 0, maxG = 0, verifiedAt = null, lastPhase = '';
  const phases = [];
  while (t < LIMIT) {
    updateOrbits(g.bodies, DT);
    controlRocket(r, idle, DT);
    const m = r.mass;
    stepRocket(r, g.bodies, DT);
    t += DT;
    if (r.guidancePhase !== lastPhase) { lastPhase = r.guidancePhase; phases.push(`${t.toFixed(0)}s ${lastPhase}`); }
    maxG = Math.max(maxG, r.gForce);
    if (r.actualThrust > 0) {
      const aT = r.actualThrust / Math.max(1, m);
      dvSpent += aT * DT;
      const dx = r.position.x - earth.position.x, dy = r.position.y - earth.position.y, rad = Math.hypot(dx, dy);
      const vx = r.velocity.x - earth.velocity.x, vy = r.velocity.y - earth.velocity.y, sp = Math.hypot(vx, vy) || 1;
      gravityLoss += (earth.mu / (rad * rad)) * ((vx * dx + vy * dy) / (rad * sp)) * DT;
      // Drag = total − gravity − thrust, along the velocity (exact for this step).
      const grav = gravityAt(r.position, g.bodies);
      const tx = Math.sin(r.angle) * aT, ty = Math.cos(r.angle) * aT;
      const along = ((r.acceleration.x - grav.x - tx) * vx + (r.acceleration.y - grav.y - ty) * vy) / sp;
      if (along < 0) dragLoss += -along * DT;
    }
    if (r.crashed) break;
    if (Math.round(t * 60) % 30 === 0) {
      const o = orbitElements(r.position, r.velocity, earth);
      if (isOrbitVerified(o, earth, r)) { verifiedAt = t; break; }
    }
  }

  const o = orbitElements(r.position, r.velocity, earth);
  const ind = apsides(r, earth);
  console.log(`\n## ${key} — target ${target / 1e3} km, liftoff ${(liftoffMass / 1e3).toFixed(1)} t, TWR ${twr.toFixed(2)}, builder Δv ${dvBuilder.toFixed(0)} m/s`);
  console.log(`   phases: ${phases.join(' → ')}`);
  console.log(`   ${verifiedAt != null ? 'ORBIT VERIFIED at T+' + verifiedAt.toFixed(0) + ' s' : 'NO ORBIT' + (r.crashed ? ' (crashed)' : '') + ' within ' + Math.round(t) + ' s'}` +
    ` · Ap ${((o.apoapsis - earth.radius) / 1e3).toFixed(1)} km · Pe ${((o.periapsis - earth.radius) / 1e3).toFixed(1)} km · e ${o.eccentricity.toFixed(4)}`);
  console.log(`   propellant used ${(fuel0 - r.fuel).toFixed(0)} / ${fuel0} kg (left ${r.fuel.toFixed(0)} kg) · Δv expended ${dvSpent.toFixed(0)} m/s` +
    ` · gravity loss ${gravityLoss.toFixed(0)} m/s · drag loss ${dragLoss.toFixed(0)} m/s · max-q ${(r.maxDynPressure / 1e3).toFixed(1)} kPa @ ${((r.maxQAltitude || 0) / 1e3).toFixed(1)} km · max-g ${maxG.toFixed(2)}`);

  check(verifiedAt != null, `${tag} isOrbitVerified within ${LIMIT} s (got: ${verifiedAt != null ? verifiedAt.toFixed(0) + ' s' : 'no'}; phase ${r.guidancePhase})`);
  if (verifiedAt == null) continue;
  check(Math.abs(ind.ap - (o.apoapsis - earth.radius) / 1e3) < 0.01 && Math.abs(ind.pe - (o.periapsis - earth.radius) / 1e3) < 0.01,
    `${tag} orbitElements agrees with the independent vis-viva apsides`);
  check(ind.pe > earth.atmosphere.height / 1e3 + 10, `${tag} periapsis above atmosphere + 10 km`);
  check(r.throttle <= 0.005 && r.spool <= 0.01 && r.guidancePhase === 'ORBIT', `${tag} engines off in ORBIT phase`);
  check(r.maxDynPressure <= 35000 * 1.05, `${tag} max-q within the 35 kPa limit (+5%): ${(r.maxDynPressure / 1e3).toFixed(1)} kPa`);
  check(maxG <= (r.guidanceMaxG || 4) + 0.2, `${tag} max-g within the guidance limit: ${maxG.toFixed(2)}`);

  // The orbit stays valid for one full period after cutoff (no further thrust).
  const pe0 = ind.pe, steps = Math.ceil(ind.period / DT);
  let minPe = Infinity, stillVerified = true;
  for (let i = 0; i < steps; i++) {
    updateOrbits(g.bodies, DT); controlRocket(r, idle, DT); stepRocket(r, g.bodies, DT);
    if (i % 600 === 0) {
      const oo = orbitElements(r.position, r.velocity, earth);
      minPe = Math.min(minPe, (oo.periapsis - earth.radius) / 1e3);
      if (!isOrbitVerified(oo, earth, r)) stillVerified = false;
    }
  }
  const after = apsides(r, earth);
  console.log(`   after one period (${(ind.period / 60).toFixed(1)} min): Ap ${after.ap.toFixed(1)} km · Pe ${after.pe.toFixed(1)} km · still verified ${stillVerified}`);
  check(stillVerified && !r.crashed, `${tag} orbit still verified after one full period`);
  check(Math.abs(after.pe - pe0) < 5, `${tag} periapsis stable over one period (Δ ${(after.pe - pe0).toFixed(2)} km)`);
  check(r.actualThrust === 0, `${tag} no thrust after cutoff`);
}

console.log('');
if (failures.length) {
  console.log(`${checks} checks passed, ${failures.length} FAILED:\n  - ` + failures.join('\n  - '));
  assert.fail(`${failures.length} launch-to-orbit check(s) failed`);
}
console.log(`${checks} checks passed: every Earth-orbit preset reaches a verified orbit from the real pad with the autopilot ` +
  'within 1 hour, elements cross-checked, max-q/max-g within limits, orbit stable for one period after cutoff');
