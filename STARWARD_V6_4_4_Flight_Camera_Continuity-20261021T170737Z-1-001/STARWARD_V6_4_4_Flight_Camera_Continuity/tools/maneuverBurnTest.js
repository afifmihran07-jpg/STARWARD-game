/* A6 / P0-4: maneuver burns use the primary-body frame and cost propellant.
 * Drives the real Game.executeBurn(). Orbital elements are computed here
 * independently (vis-viva / angular momentum), not with orbitElements(). */
import assert from 'node:assert/strict';
import {makeGame} from './_gameHarness.js';
import {orbitElements} from '../js/physics/orbitalMechanics.js';

const G0 = 9.80665;
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, m); checks++; };
const near = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m}: got ${a}, expected ${b} ±${tol}`); checks++; };

/** Independent apsides from position/velocity relative to the body. */
function apsides(r, body) {
  const x = r.position.x - body.position.x, y = r.position.y - body.position.y;
  const vx = r.velocity.x - body.velocity.x, vy = r.velocity.y - body.velocity.y;
  const rad = Math.hypot(x, y), v2 = vx * vx + vy * vy;
  const a = 1 / (2 / rad - v2 / body.mu);                 // vis-viva
  const h = x * vy - y * vx;
  const e = Math.sqrt(Math.max(0, 1 - h * h / (body.mu * a)));
  return {ap: a * (1 + e) - body.radius, pe: a * (1 - e) - body.radius, a, e};
}

const ALT = 300e3;
/** earthObservation staged to its vacuum upper stage, circular 300 km orbit at phase θ (test fixture). */
function inOrbit(theta) {
  const g = makeGame();
  g.loadPresetRocket('earthObservation');
  g.launch();
  const r = g.rocket;
  r.nextStage(); r.nextStage();                   // ignite, drop the booster -> Vela Vacuum lit
  const earth = r.body, R = earth.radius + ALT, vc = Math.sqrt(earth.mu / R);
  r.position = {x: earth.position.x + R * Math.cos(theta), y: earth.position.y + R * Math.sin(theta)};
  r.velocity = {x: earth.velocity.x - vc * Math.sin(theta), y: earth.velocity.y + vc * Math.cos(theta)};
  r.landed = false; r.hasFlown = true; r.throttle = 0; r.spool = 0;
  return {g, r, earth, R, vc};
}
const arm = (g, dv) => { g.node.deltaV = dv; g.node.active = true; };

for (let k = 0; k < 8; k++) {
  const theta = k * Math.PI / 4;
  const deg = k * 45;

  // +500 m/s prograde.
  {
    const {g, r, earth, R, vc} = inOrbit(theta);
    const before = apsides(r, earth);
    near(before.ap, ALT, 1, `θ=${deg}°: fixture apoapsis 300 km`);
    near(before.pe, ALT, 1, `θ=${deg}°: fixture periapsis 300 km`);
    const isp = r.activeEngine.isp;
    eq(isp, 420, `θ=${deg}°: Vela Vacuum is the lit engine`);
    const m0 = r.mass, fuel0 = r.currentFuel, burned0 = r.propellantBurned;
    arm(g, 500);
    eq(g.executeBurn(), true, `θ=${deg}°: +500 m/s executed`);
    const after = apsides(r, earth);
    // Analytic expectation: tangential +500 m/s at the (circular) burn point.
    const v = vc + 500, aExp = 1 / (2 / R - v * v / earth.mu), apExp = 2 * aExp - R - earth.radius;
    near(after.ap, apExp, 1, `θ=${deg}°: apoapsis raised to the analytic value (${(apExp / 1e3).toFixed(1)} km)`);
    ok(after.pe >= before.pe - 1, `θ=${deg}°: periapsis not lowered (${(after.pe / 1e3).toFixed(3)} km)`);
    const elem = orbitElements(r.position, r.velocity, earth);
    near(elem.apoapsis - earth.radius, after.ap, 1, `θ=${deg}°: orbitElements agrees with the independent apoapsis`);
    const expectedProp = m0 * (1 - Math.exp(-500 / (isp * G0)));
    near(fuel0 - r.currentFuel, expectedProp, 1e-6, `θ=${deg}°: propellant = rocket equation (${expectedProp.toFixed(1)} kg)`);
    near(m0 - r.mass, expectedProp, 1e-6, `θ=${deg}°: vehicle mass drops by the propellant`);
    near(r.propellantBurned - burned0, expectedProp, 1e-6, `θ=${deg}°: counted as burned propellant`);
    eq(g.node.active, false, `θ=${deg}°: node cleared after the burn`);
  }

  // -500 m/s retrograde: lowers periapsis, never raises apoapsis.
  {
    const {g, r, earth} = inOrbit(theta);
    const before = apsides(r, earth);
    arm(g, -500);
    eq(g.executeBurn(), true, `θ=${deg}°: −500 m/s executed`);
    const after = apsides(r, earth);
    ok(after.pe < before.pe - 100e3, `θ=${deg}°: retrograde lowers periapsis`);
    ok(after.ap <= before.ap + 1, `θ=${deg}°: retrograde does not raise apoapsis`);
  }
}

/* ---- Refusals: no free Δv ---------------------------------------------- */
{
  const {g, r} = inOrbit(0);
  r.stageFuel[r.stageIndex] = 50;                // far less than a 500 m/s burn needs
  const v0 = {...r.velocity};
  arm(g, 500);
  eq(g.executeBurn(), false, 'insufficient propellant: burn refused');
  eq(r.currentFuel, 50, 'insufficient propellant: fuel untouched');
  ok(r.velocity.x === v0.x && r.velocity.y === v0.y, 'insufficient propellant: velocity untouched');
  ok(/Not enough propellant/.test(g.toasts.at(-1)), 'insufficient propellant: toast says why');
}
{
  const g = makeGame();
  g.loadPresetRocket('earthObservation'); g.launch();
  const r = g.rocket;                            // on the pad, not ignited
  r.landed = false; r.hasFlown = true; r.position.y += 300e3;
  const v0 = {...r.velocity};
  arm(g, 500);
  eq(g.executeBurn(), false, 'no active engine: burn refused');
  ok(r.velocity.x === v0.x && r.velocity.y === v0.y, 'no active engine: velocity untouched');
  ok(/No active engine/.test(g.toasts.at(-1)), 'no active engine: toast says why');
}
{
  const g = makeGame();
  g.loadPresetRocket('earthObservation'); g.launch();
  g.rocket.nextStage();
  arm(g, 500);
  eq(g.executeBurn(), false, 'landed: burn refused');
}

/* ---- Predictor's planned path uses the same body-relative prograde ------ */
for (const theta of [0, Math.PI / 2, 1.3]) {
  const {g, r, earth} = inOrbit(theta);
  const plain = g.predictor.trace(r, g.bodies, 0);
  const planned = g.predictor.plan(r, g.bodies, 500);
  const dx = planned[1].x - plain[1].x, dy = planned[1].y - plain[1].y;
  const rel = {x: r.velocity.x - earth.velocity.x, y: r.velocity.y - earth.velocity.y};
  const cos = (dx * rel.x + dy * rel.y) / (Math.hypot(dx, dy) * Math.hypot(rel.x, rel.y));
  ok(cos > 0.999, `planned path offset is along body-relative prograde (θ=${theta.toFixed(2)}, cos=${cos.toFixed(5)})`);
}

console.log(`${checks} checks passed: +500 m/s prograde raises apoapsis to the analytic value and never lowers periapsis at 8 phases, ` +
  'retrograde lowers periapsis, propellant = rocket equation, refusals without propellant/engine/in flight, planner frame');
