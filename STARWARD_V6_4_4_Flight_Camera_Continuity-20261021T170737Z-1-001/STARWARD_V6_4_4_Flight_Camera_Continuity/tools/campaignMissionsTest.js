/* A5 / P0-7: every campaign mission, with crafted states, plus maxAltitude
 * tracking through the real stepRocket and flightState(). */
import assert from 'node:assert/strict';
import {MISSIONS, flightState, LUNAR_CROSSING_DISTANCE, HOMEWARD_MIN_PEAK} from '../js/missions/missionManager.js';
import {Editor} from '../js/construction/editor.js';
import {Rocket} from '../js/rocket/rocket.js';
import {createSolarSystem, updateOrbits} from '../js/celestial/solarSystem.js';
import {stepRocket} from '../js/physics/physics.js';
import {terrainHeight} from '../js/physics/collision.js';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, m); checks++; };
const near = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m}: got ${a}, expected ${b}`); checks++; };
const M = id => MISSIONS.find(m => m.id === id);
const R_EARTH = 6371e3;

/** A neutral state: on the pad at Earth, never flown. */
const base = (over = {}) => ({altitude: 0, speed: 0, primaryRadius: R_EARTH, periapsis: 0,
  earthDistance: R_EARTH, moonDistance: 384400e3, maxAltitude: 0, hasFlown: false,
  onMoon: false, onEarth: true, landed: true, crashed: false, ...over});

/* ---- Altitude Trial ---------------------------------------------------- */
{
  const m = M('altitude');
  eq(m.done(base()), false, 'altitude: not done on the pad');
  near(m.progress(base({altitude: 5000})), 0.5, 1e-9, 'altitude: half way at 5 km');
  eq(m.done(base({altitude: 10000})), true, 'altitude: done at 10 km');
}

/* ---- First Orbit -------------------------------------------------------- */
{
  const m = M('orbit');
  eq(m.done(base({periapsis: 0})), false, 'orbit: unbound/zero periapsis is not done');
  eq(m.done(base({periapsis: R_EARTH + 99e3})), false, 'orbit: 99 km periapsis not done');
  eq(m.done(base({periapsis: R_EARTH + 100e3})), true, 'orbit: 100 km periapsis done');
  near(m.progress(base({periapsis: R_EARTH + 50e3})), 0.5, 1e-9, 'orbit: half way at 50 km');
}

/* ---- Lunar Crossing (was: 40 km of Earth's centre — impossible) --------- */
{
  const m = M('moon');
  eq(LUNAR_CROSSING_DISTANCE, 40000e3, 'lunar crossing threshold is 40 000 km');
  eq(m.done(base()), false, 'moon: not done at Earth');
  near(m.progress(base()), 0, 1e-9, 'moon: 0% at the Earth-Moon distance');
  eq(m.done(base({moonDistance: 40001e3})), false, 'moon: 40 001 km not done');
  eq(m.done(base({moonDistance: 40000e3})), true, 'moon: 40 000 km done');
  eq(m.done(base({moonDistance: 5000e3, earthDistance: 389400e3})), true, 'moon: 5 000 km from the Moon done');
  near(m.progress(base({moonDistance: 212200e3})), 0.5, 1e-9, 'moon: half way between 384 400 and 40 000 km');
  near(m.progress(base({moonDistance: 40000e3})), 1, 1e-9, 'moon: 100% at the threshold');
  // The old predicate would have needed earthDistance <= 40 000 m.
  eq(m.done(base({earthDistance: 30000, moonDistance: 384400e3})), false, 'moon: Earth-centre distance alone never completes it');
  ok(/Moon/.test(m.hint(base({moonDistance: 100000e3}))), 'moon: hint is distance to the Moon');
}

/* ---- Moon Landing (stays impossible until SOI switching, P1-2) --------- */
{
  const m = M('landing');
  eq(m.done(base()), false, 'landing: Earth pad is not the Moon');
  eq(m.done(base({onMoon: true, onEarth: false, landed: true, speed: 3})), true, 'landing: soft Moon landing done');
  eq(m.done(base({onMoon: true, onEarth: false, landed: true, speed: 20})), false, 'landing: too fast is not done');
}

/* ---- Homeward (was: done on the launch pad) ---------------------------- */
{
  const m = M('return');
  eq(m.done(base()), false, 'homeward: NOT done on the pad (old bug)');
  near(m.progress(base()), 0, 1e-9, 'homeward: 0% on the pad');
  eq(m.done(base({hasFlown: true, maxAltitude: 60e3})), false, 'homeward: landing after a 60 km hop is not done');
  near(m.progress(base({hasFlown: true, maxAltitude: 50e3})), 0.25, 1e-9, 'homeward: 50 km peak = 25%');
  const coming = base({hasFlown: true, maxAltitude: 200e3, altitude: 100e3, landed: false});
  eq(m.done(coming), false, 'homeward: in flight after reaching space is not done');
  near(m.progress(coming), 0.75, 1e-9, 'homeward: half way down from a 200 km peak = 75%');
  eq(m.done(base({hasFlown: true, maxAltitude: HOMEWARD_MIN_PEAK})), true, 'homeward: landed after reaching 100 km is done');
  eq(m.done(base({hasFlown: true, maxAltitude: 200e3, crashed: true})), false, 'homeward: a crash is not a landing');
  eq(m.done(base({hasFlown: true, maxAltitude: 200e3, onEarth: false})), false, 'homeward: landing elsewhere is not Earth');
  near(m.progress(base({hasFlown: true, maxAltitude: 200e3})), 1, 1e-9, 'homeward: 100% after landing');
}

/* ---- maxAltitude is tracked by the real integrator ----------------------- */
{
  const bodies = createSolarSystem(); const earth = bodies.find(b => b.id === 'earth');
  const editor = new Editor(); editor.loadPreset('starter');
  const r = new Rocket(editor.parts);
  eq(r.maxAltitude, 0, 'new rocket starts with maxAltitude 0');
  r.position = {x: earth.position.x, y: earth.position.y + earth.radius + terrainHeight(Math.PI / 2, earth) + r.supportExtent(0, 1)};
  r.velocity = {...earth.velocity}; r.angle = 0; r.landed = true; r.primaryBody = earth; r.body = earth;
  r.nextStage(); r.throttle = 1;
  let peak = 0;
  for (let i = 0; i < 60 * 300; i++) {
    updateOrbits(bodies, 1 / 60); stepRocket(r, bodies, 1 / 60);
    peak = Math.max(peak, earth.altitude(r.position));
  }
  near(r.maxAltitude, peak, 1e-6, 'stepRocket records the peak altitude');
  ok(r.maxAltitude > HOMEWARD_MIN_PEAK, 'starter ascent goes above 100 km');
  ok(earth.altitude(r.position) <= r.maxAltitude, 'maxAltitude never below the current altitude');
  const st = flightState({rocket: r, bodies, orbit: null});
  eq(st.maxAltitude, r.maxAltitude, 'flightState exposes maxAltitude');
  eq(st.hasFlown, true, 'flightState exposes hasFlown');
  const moon = bodies.find(b => b.id === 'moon');
  near(st.moonDistance, Math.hypot(r.position.x - moon.position.x, r.position.y - moon.position.y), 1e-6, 'flightState exposes moonDistance');
}

console.log(`${checks} checks passed: Altitude, First Orbit, Lunar Crossing (40 000 km of the Moon), Moon Landing, ` +
  'Homeward (needs 100 km peak then an Earth landing), maxAltitude tracked by stepRocket');
