import assert from 'node:assert/strict';
import {Camera, flightFocusFraction, flightFocusOffset} from '../js/camera.js';

const canvas = {width: 1280, height: 720};
const heights = [0, 250, 1000, 2500, 5000, 7500, 10000, 20000, 35000, 50000, 80000, 150000];
let prior = -Infinity;
for (const altitude of heights) {
  const fraction = flightFocusFraction(altitude);
  assert.ok(Number.isFinite(fraction), `focus fraction must be finite at ${altitude} m`);
  assert.ok(fraction >= prior, `focus fraction must not move back at ${altitude} m`);
  prior = fraction;
}
assert.ok(Math.abs(flightFocusFraction(0) - 0.08) < 1e-12);
assert.ok(flightFocusFraction(7500) < 0.10,
  'the offset must not jump to its maximum in the first 7.5 km');
assert.ok(Math.abs(flightFocusFraction(50000) - 0.23) < 1e-12);
assert.ok(Math.abs(flightFocusFraction(150000) - 0.23) < 1e-12);

// The world-space offset must project back to the same screen fraction across
// the entire flight zoom range, including a current zoom far from its target.
for (const zoom of [60, 1, 0.2, 0.01, 0.001, 0.0001, 0.00002, 2e-6]) {
  for (const altitude of heights) {
    const offset = flightFocusOffset(canvas.height, altitude, zoom, 2e-6);
    const projectedFraction = offset * zoom / canvas.height;
    assert.ok(Math.abs(projectedFraction - flightFocusFraction(altitude)) < 1e-10,
      `screen anchor must be zoom invariant at ${altitude} m / zoom ${zoom}`);
  }
}

// Simulate the camera's complete frame order while altitude and target zoom
// change together. The camera must apply the anchor after zoom easing, at the
// same render frame, even with occasional throttled-browser frame deltas.
const camera = new Camera(canvas);
camera.limits(2e-6, 60);
const deltas = [1 / 60, 1 / 60, 0.033, 1 / 60, 0.1, 1 / 60];
let altitude = 0;
let rocketY = 6371000;
for (let i = 0; i < 1800; i++) {
  const dt = deltas[i % deltas.length];
  altitude = Math.min(160000, altitude + 95 * dt);
  rocketY = 6371000 + altitude;

  const reveal = Math.max(0, Math.min(1, (altitude / 100000 - 0.1) / 0.9));
  const desiredZoom = Math.exp(Math.log(0.08) * (1 - reveal) +
    Math.log(2.2e-5) * reveal);
  camera.setTargetZoom(desiredZoom);
  const fraction = flightFocusFraction(altitude);
  camera.setScreenAnchor(0, rocketY, fraction);
  camera.update(dt);

  const screen = camera.worldToScreen(0, rocketY);
  const actualFraction = (canvas.height / 2 - screen.y) / canvas.height;
  assert.ok(Math.abs(actualFraction - fraction) < 1e-8,
    `camera anchor should not pump at frame ${i}: ${actualFraction} vs ${fraction}`);
  assert.ok(Number.isFinite(camera.x) && Number.isFinite(camera.y) &&
    Number.isFinite(camera.zoom), `camera state must remain finite at frame ${i}`);
}
console.log('  ok  focus profile is smooth, zoom-invariant and stable through altitude reveal');
