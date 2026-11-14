/* Headless regression for the starter rocket's first ascent. */
import assert from 'node:assert';
import {Editor} from '../js/construction/editor.js';
import {Rocket} from '../js/rocket/rocket.js';
import {createSolarSystem, updateOrbits} from '../js/celestial/solarSystem.js';
import {stepRocket} from '../js/physics/physics.js';
import {terrainHeight} from '../js/physics/collision.js';
import {controlRocket} from '../js/flight/flightController.js';

const editor = new Editor();
editor.loadStarter();
const bodies = createSolarSystem();
const earth = bodies.find(b => b.id === 'earth');
const rocket = new Rocket(editor.parts);
rocket.position = {
  x: earth.position.x,
  y: earth.position.y + earth.radius + terrainHeight(Math.PI / 2, earth) + rocket.supportExtent(0, 1)
};
rocket.velocity = {x: earth.velocity.x, y: earth.velocity.y};
rocket.angle = 0;
rocket.throttle = 1;
rocket.stageIndex = -1;
rocket.landed = true;
rocket.refresh();
rocket.primaryBody = earth;
rocket.body = earth;
assert.ok(rocket.nextStage(), 'starter rocket must ignite a stage');

let maxAltitude = 0;
let priorCriticalBandAltitude = -Infinity;
let criticalBandSamples = 0;
const checkpoints = new Map();
const checkpointSeconds = new Set([5, 10, 20, 30, 60, 100]);
const idleInput = {pressed: () => false};
for (let i = 0; i < 6000; i++) {
  updateOrbits(bodies, 1 / 60);
  controlRocket(rocket, idleInput, 1 / 60);
  stepRocket(rocket, bodies, 1 / 60);
  const altitude = rocket.altitudeAboveSurface(earth);
  assert.ok(Number.isFinite(altitude), 'altitude must remain finite');
  assert.ok(Number.isFinite(rocket.position.x) && Number.isFinite(rocket.position.y),
    'position must remain finite');
  // This is the reported glitch band. Check the physical state directly so a
  // stable-looking camera cannot mask a real altitude/velocity reversal.
  if (altitude >= 1400 && altitude <= 1800) {
    const dx = rocket.position.x - earth.position.x;
    const dy = rocket.position.y - earth.position.y;
    const rvx = rocket.velocity.x - earth.velocity.x;
    const rvy = rocket.velocity.y - earth.velocity.y;
    const radialSpeed = (rvx * dx + rvy * dy) / Math.max(1, Math.hypot(dx, dy));
    assert.ok(radialSpeed > 0, `starter must be physically ascending in the 1.4–1.8 km band (t=${((i+1)/60).toFixed(2)}s)`);
    assert.ok(altitude >= priorCriticalBandAltitude - 1e-3,
      `altitude must not reverse in the reported 1.4–1.8 km band: ${priorCriticalBandAltitude} -> ${altitude}`);
    priorCriticalBandAltitude = altitude;
    criticalBandSamples++;
  }
  maxAltitude = Math.max(maxAltitude, altitude);
  const seconds = (i + 1) / 60;
  if (Number.isInteger(seconds) && checkpointSeconds.has(seconds)) {
    const dx = rocket.position.x - earth.position.x;
    const dy = rocket.position.y - earth.position.y;
    const rvx = rocket.velocity.x - earth.velocity.x;
    const rvy = rocket.velocity.y - earth.velocity.y;
    const radialSpeed = (rvx * dx + rvy * dy) / Math.max(1, Math.hypot(dx, dy));
    checkpoints.set(seconds, {altitude, radialSpeed});
  }
}
const orderedCheckpoints = [...checkpointSeconds].sort((a, b) => a - b);
for (const seconds of orderedCheckpoints) {
  assert.ok(checkpoints.has(seconds), `flight checkpoint ${seconds}s must be recorded`);
  assert.ok(checkpoints.get(seconds).radialSpeed > 0,
    `starter rocket should still be ascending at ${seconds}s; radial speed was ` +
    `${Math.round(checkpoints.get(seconds).radialSpeed)} m/s`);
}
for (let i = 1; i < orderedCheckpoints.length; i++) {
  const earlier = orderedCheckpoints[i - 1], later = orderedCheckpoints[i];
  assert.ok(checkpoints.get(later).altitude > checkpoints.get(earlier).altitude,
    `starter altitude should rise from ${earlier}s to ${later}s; got ` +
    `${Math.round(checkpoints.get(earlier).altitude)}m → ${Math.round(checkpoints.get(later).altitude)}m`);
}
assert.ok(criticalBandSamples > 2, 'the simulation must exercise multiple fixed steps inside the reported 1.4–1.8 km altitude band');
assert.ok(maxAltitude > 100000, `starter should pass 100 km; got ${Math.round(maxAltitude)} m`);
assert.ok(!rocket.crashed, 'starter must not crash during ascent');
console.log(`  ok  starter ascent stays upward through 1.4–1.8 km and reaches 100 s of powered/coasting flight (${Math.round(maxAltitude / 1000)} km max)`);
