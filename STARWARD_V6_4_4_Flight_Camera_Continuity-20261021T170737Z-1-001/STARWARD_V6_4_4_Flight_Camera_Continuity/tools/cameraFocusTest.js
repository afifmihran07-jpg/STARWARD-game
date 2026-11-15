/* A3: camera focus switches between the carrier and the deployed spacecraft
 * (V key / VIEW button, automatic after DEPLOY) and never changes physics. */
import assert from 'node:assert/strict';
import {makeGame, run, element} from './_gameHarness.js';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, m); checks++; };
const snap = v => JSON.stringify({p: v.position, v: v.velocity, a: v.angle, w: v.angVel, t: v.throttle,
  s: v.spool, f: v.stageFuel, m: v.mass, si: v.stageIndex});
function press(g, code) {
  let pending = true;
  g.input.pressedOnce = k => { if (pending && k === code) { pending = false; return true; } return false; };
  g.keys();
  g.input.pressedOnce = () => false;
}
/** A deployed spacecraft in a seeded test orbit (debug fixture, not a launch). */
function deployed() {
  const g = makeGame({debug: true});
  g.seedOrbitForTesting(500, 'earthObservation');
  run(g, 1);
  assert.ok(g.deployMission().ok, 'fixture: deployment');
  return g;
}

/* ---- Before deployment: carrier only ------------------------------------ */
{
  const g = makeGame();
  g.loadPresetRocket('earthObservation'); g.launch();
  eq(g.cameraFocus, 'carrier', 'camera starts on the carrier');
  eq(element('cameraFocusButton').disabled, true, 'VIEW button disabled before deployment');
  eq(g.toggleCameraFocus(), 'carrier', 'V without a spacecraft keeps the carrier');
  ok(g.toasts.at(-1).includes('No deployed spacecraft'), 'explains why');
}

/* ---- After DEPLOY: automatic spacecraft focus, V toggles ---------------- */
{
  const g = deployed();
  const craft = g.deployedSpacecraft, carrier = g.rocket;
  eq(g.cameraFocus, 'spacecraft', 'camera follows the spacecraft right after deployment');
  eq(g.focusVehicle(), craft, 'focus vehicle is the spacecraft');
  g.updateFlightCamera(true);
  eq(g.camera.target.x, craft.position.x, 'camera target on the spacecraft (x)');
  eq(g.camera.target.y, craft.position.y, 'camera target on the spacecraft (y)');
  eq(element('cameraFocusButton').disabled, false, 'VIEW button enabled');
  eq(element('cameraFocusButton').textContent, 'VIEW: CRAFT', 'button shows the spacecraft view');
  g.update(1 / 60);
  ok(/CAMERA<\/span><b>SPACECRAFT \[V\]/.test(element('metricsMore').innerHTML), 'telemetry shows the camera is on the spacecraft');

  press(g, 'KeyV');
  eq(g.cameraFocus, 'carrier', 'V switches back to the carrier');
  eq(g.camera.target.x, carrier.position.x, 'camera target on the carrier');
  eq(element('cameraFocusButton').textContent, 'VIEW: CARRIER', 'button shows the carrier view');
  press(g, 'KeyV');
  eq(g.cameraFocus, 'spacecraft', 'V again: spacecraft');

  // Toggling and camera updates do not touch either vehicle.
  const before = [snap(carrier), snap(craft)];
  for (let i = 0; i < 10; i++) { g.toggleCameraFocus(); g.updateFlightCamera(i % 2 === 0); g.refreshMissionOpsPanel(); g.syncCameraFocusButton(); }
  eq(JSON.stringify([snap(carrier), snap(craft)]), JSON.stringify(before), 'camera focus changes leave both vehicles untouched');

  // New launch resets to the carrier.
  g.launch();
  eq(g.cameraFocus, 'carrier', 'relaunch resets the camera to the carrier');
}

/* ---- Physics is identical with and without camera toggling -------------- */
{
  const a = deployed(), b = deployed();
  eq(snap(a.deployedSpacecraft), snap(b.deployedSpacecraft), 'fixture: identical start');
  for (let i = 0; i < 600; i++) {
    if (i % 7 === 0) a.toggleCameraFocus();            // a: toggles constantly
    a.update(1 / 60);
    b.update(1 / 60);                                  // b: never touches the camera focus
  }
  eq(snap(a.rocket), snap(b.rocket), 'carrier state is bit-identical with or without camera toggling');
  eq(snap(a.deployedSpacecraft), snap(b.deployedSpacecraft), 'spacecraft state is bit-identical with or without camera toggling');
  eq(a.missionOperations.dataStoredMB, b.missionOperations.dataStoredMB, 'mission operations unaffected by the camera');
}

console.log(`${checks} checks passed: carrier focus before deployment, automatic spacecraft focus after DEPLOY, ` +
  'V key and VIEW button toggle, telemetry shows the camera target, physics bit-identical with camera toggling');
