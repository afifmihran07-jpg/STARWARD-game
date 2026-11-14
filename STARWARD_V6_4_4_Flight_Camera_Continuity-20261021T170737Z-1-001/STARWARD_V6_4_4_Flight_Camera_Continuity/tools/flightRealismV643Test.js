import assert from 'node:assert/strict';
import {Editor} from '../js/construction/editor.js';
import {Rocket} from '../js/rocket/rocket.js';
import {createSolarSystem, updateOrbits} from '../js/celestial/solarSystem.js';
import {stepRocket} from '../js/physics/physics.js';
import {terrainHeight} from '../js/physics/collision.js';
import {controlRocket} from '../js/flight/flightController.js';
import {orbitElements, isOrbitVerified} from '../js/physics/orbitalMechanics.js';

const idle = {pressed: () => false};
function starterFlight(autoGuidance = true) {
  const editor = new Editor(); editor.loadStarter();
  const bodies = createSolarSystem(); const earth = bodies.find(b => b.id === 'earth');
  const rocket = new Rocket(editor.parts);
  rocket.position = {x:earth.position.x, y:earth.position.y + earth.radius + terrainHeight(Math.PI / 2, earth) + rocket.supportExtent(0, 1)};
  rocket.velocity = {x:earth.velocity.x, y:earth.velocity.y};
  rocket.angle = 0; rocket.throttle = 1; rocket.stageIndex = -1; rocket.landed = true;
  rocket.refresh(); rocket.primaryBody = earth; rocket.body = earth;
  rocket.autoGuidance = autoGuidance; rocket.guidanceTargetAltitude = 500000; rocket.guidanceMaxG = 4;
  rocket.flightEvents = [{type:'LAUNCH_PREPARATION', time:0, altitude:0}];
  rocket.nextStage();
  return {bodies, earth, rocket};
}

// Automatic guidance should produce a real tangential velocity component,
// while the same configured starter remains a suborbital vehicle.
const {bodies, earth, rocket} = starterFlight(true);
let maxG = 0; let maxAltitude = 0; let burnoutAt = null; let burnoutPosition = null; let maxSteps = 60 * 190;
for (let i = 0; i < maxSteps; i++) {
  updateOrbits(bodies, 1 / 60);
  controlRocket(rocket, idle, 1 / 60);
  stepRocket(rocket, bodies, 1 / 60);
  maxG = Math.max(maxG, rocket.gForce);
  maxAltitude = Math.max(maxAltitude, rocket.altitudeAboveSurface(earth));
  if (!burnoutAt && rocket.fuel <= 0) { burnoutAt = i; burnoutPosition = {...rocket.position}; }
}
const dx = rocket.position.x - earth.position.x, dy = rocket.position.y - earth.position.y;
const vx = rocket.velocity.x - earth.velocity.x, vy = rocket.velocity.y - earth.velocity.y;
const radius = Math.hypot(dx, dy);
const tangentialSpeed = (vx * dy - vy * dx) / radius;
const orbit = orbitElements(rocket.position, rocket.velocity, earth);
assert.ok(maxAltitude > 150000, `starter should pass the upper atmosphere; got ${Math.round(maxAltitude)} m`);
assert.ok(tangentialSpeed > 2500, `automatic gravity turn must build horizontal speed; got ${Math.round(tangentialSpeed)} m/s`);
assert.ok(maxG <= 4.2, `auto throttle should hold the configured ~4g guidance limit; got ${maxG.toFixed(2)}g`);
assert.ok(rocket.maxDynPressure > 10000, 'actual dynamic-pressure history should record Max-Q');
assert.ok(rocket.maxQAltitude > 1000 && rocket.maxQAltitude < 50000, 'Max-Q should record the peak altitude during atmospheric ascent');
assert.ok(rocket.flightEvents.some(e => e.type === 'MAX_Q'), 'Max-Q event should be recorded from the actual pressure history');
assert.ok(rocket.flightEvents.some(e => e.type === 'ENGINE_CUTOFF'), 'fuel depletion should record engine cutoff');
assert.ok(rocket.fuel === 0 && rocket.actualThrust === 0, 'fuel exhaustion must end thrust');
assert.equal(rocket.mach, 0, 'Mach must be undefined/zero in vacuum rather than inventing a vacuum sound speed');
assert.ok(rocket.position.x !== burnoutPosition.x || rocket.position.y !== burnoutPosition.y,
  'vehicle must continue moving after burnout');
assert.ok(!isOrbitVerified(orbit, earth, rocket), 'starter trajectory must not be declared orbit merely because it reaches high altitude');
assert.ok(orbit.periapsis < earth.radius + earth.atmosphere.height, 'starter trajectory must remain classified as suborbital');

// The final partial propellant step must not apply a full-engine impulse.
const tiny = starterFlight(false);
tiny.rocket.position.y += 5000;
tiny.rocket.landed = false;
tiny.rocket.stageFuel[tiny.rocket.stageIndex] = 0.01;
tiny.rocket.spool = 1; tiny.rocket.throttle = 1;
stepRocket(tiny.rocket, tiny.bodies, 1 / 60);
assert.ok(tiny.rocket.actualThrust < tiny.rocket.activeEngine.thrust * 0.01,
  'last-step thrust must be limited to the propellant actually available');

// A clean circular, atmosphere-clearing state is verified only after cutoff.
const orbitTest = starterFlight(false);
const r = orbitTest.earth.radius + 250000;
orbitTest.rocket.position = {x:orbitTest.earth.position.x, y:orbitTest.earth.position.y + r};
const circularSpeed = Math.sqrt(orbitTest.earth.mu / r);
orbitTest.rocket.velocity = {x:orbitTest.earth.velocity.x + circularSpeed, y:orbitTest.earth.velocity.y};
orbitTest.rocket.throttle = 0; orbitTest.rocket.spool = 0; orbitTest.rocket.landed = false;
const circularOrbit = orbitElements(orbitTest.rocket.position, orbitTest.rocket.velocity, orbitTest.earth);
assert.ok(isOrbitVerified(circularOrbit, orbitTest.earth, orbitTest.rocket), 'a true bound circular orbit above the atmosphere should pass verification');
orbitTest.rocket.throttle = 1;
assert.ok(!isOrbitVerified(circularOrbit, orbitTest.earth, orbitTest.rocket), 'a bound-looking osculating orbit during powered flight must not count as achieved');

// Supported flight time-warp values use the same fixed 1/60 s physics steps.
const warpOne = starterFlight(true), warpTwo = starterFlight(true);
for (let i = 0; i < 600; i++) { updateOrbits(warpOne.bodies, 1/60); controlRocket(warpOne.rocket, idle, 1/60); stepRocket(warpOne.rocket, warpOne.bodies, 1/60); }
for (let frame = 0; frame < 300; frame++) {
  for (let sub = 0; sub < 2; sub++) { updateOrbits(warpTwo.bodies, 1/60); controlRocket(warpTwo.rocket, idle, 1/60); stepRocket(warpTwo.rocket, warpTwo.bodies, 1/60); }
}
assert.ok(Math.abs(warpOne.rocket.position.x - warpTwo.rocket.position.x) < 1e-6 &&
  Math.abs(warpOne.rocket.position.y - warpTwo.rocket.position.y) < 1e-6 &&
  Math.abs(warpOne.rocket.velocity.x - warpTwo.rocket.velocity.x) < 1e-9 &&
  Math.abs(warpOne.rocket.velocity.y - warpTwo.rocket.velocity.y) < 1e-9,
  'equivalent fixed-step simulation time must be independent of 1x/2x frame grouping');

console.log(`  ok  V6.4.3 guidance, Max-Q, g-limit, burnout/coast and orbit validation (Max-Q ${(rocket.maxDynPressure/1000).toFixed(1)} kPa at ${(rocket.maxQAltitude/1000).toFixed(1)} km; cutoff ${(rocket.flightEvents.find(e=>e.type==='ENGINE_CUTOFF')?.altitude/1000).toFixed(1)} km; apogee ${(orbit.apoapsis-earth.radius)/1000|0} km; periapsis ${(orbit.periapsis-earth.radius)/1000|0} km; no orbit forced)`);
