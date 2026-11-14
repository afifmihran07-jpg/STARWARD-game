/* B2: the autopilot is wired into controlRocket, the G key and the HUD, the
 * player always overrides it, and MAP-mode arrow keys do not fly the rocket. */
import assert from 'node:assert/strict';
import {makeGame, run, element} from './_gameHarness.js';
import {controlRocket} from '../js/flight/flightController.js';
import {guide} from '../js/flight/guidance.js';
import {MISSION_PROFILES} from '../js/construction/missionSystems.js';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, m); checks++; };
const idle = {pressed: () => false};
const holding = (...keys) => ({pressed: k => keys.includes(k)});

/** Press a one-shot key through the real Game.keys() handler. */
function press(g, code) {
  let pending = true;
  g.input.pressedOnce = k => { if (pending && k === code) { pending = false; return true; } return false; };
  g.keys();
  g.input.pressedOnce = () => false;
}
function launched(preset = 'earthObservation') {
  const g = makeGame();
  g.loadPresetRocket(preset);
  g.launch();
  return g;
}

/* ---- G engages with the mission profile's target; SPACE ignites --------- */
{
  const g = launched('earthObservation');
  const r = g.rocket;
  eq(r.autoGuidance, false, 'autopilot off at launch');
  press(g, 'KeyG');
  eq(r.autoGuidance, true, 'G engages the autopilot');
  eq(r.guidanceTargetAltitude, MISSION_PROFILES.earthObservation.orbitAlt, 'target = mission profile orbit altitude (500 km)');
  ok(g.toasts.at(-1).includes('Autopilot ON') && g.toasts.at(-1).includes('500 km'), 'toast names the target');
  run(g, 0.2);
  eq(r.guidancePhase, 'STANDBY', 'before ignition the autopilot waits in STANDBY');
  eq(r.stageIndex, -1, 'the autopilot never ignites by itself');
  g.stage();                                            // SPACE
  run(g, 5);
  ok(['VERTICAL_RISE', 'PITCH_PROGRAM'].includes(r.guidancePhase), 'after SPACE the ascent phases run: ' + r.guidancePhase);
  ok(r.altitudeAboveSurface(r.body) > 50, 'vehicle lifted off under autopilot');
  // The HUD row shows the real phase and target.
  ok(/AUTO · (VERTICAL RISE|GRAVITY TURN) → 500 km/.test(element('metricsMore').innerHTML), 'HUD GUIDANCE row shows the live phase');
}

/* ---- The controller applies exactly the guidance commands --------------- */
{
  const g = launched('weather');
  const r = g.rocket;
  r.nextStage(); r.autoGuidance = true; r.guidanceTargetAltitude = 700e3; r.guidanceMemory = null;
  run(g, 20);
  const expected = guide(r, r.primaryBody, {altitude: r.guidanceTargetAltitude, maxG: r.guidanceMaxG, maxQ: r.guidanceMaxQ}, r.guidanceMemory);
  controlRocket(r, idle, 1 / 60);
  eq(r.throttle, expected.throttle, 'controller throttle = guidance throttle');
  eq(r.steer, expected.steer, 'controller steer = guidance steer');
  eq(r.guidancePhase, expected.phase, 'controller records the guidance phase');
}

/* ---- Manual input overrides instantly and the autopilot stays off ------- */
{
  const g = launched('weather');
  const r = g.rocket;
  r.nextStage(); r.autoGuidance = true; r.guidanceTargetAltitude = 700e3;
  run(g, 15);
  ok(r.autoGuidance && r.throttle > 0, 'fixture: autopilot flying');
  // Player holds A (steer left) for one frame.
  controlRocket(r, holding('KeyA'), 1 / 60);
  eq(r.autoGuidance, false, 'manual steering disengages the autopilot in the same frame');
  eq(r.steer, -1, 'the player\'s steering takes effect immediately');
  eq(r.guidancePhase, 'MANUAL_OVERRIDE', 'phase records the override');
  // Releasing the key does not re-engage it: no fighting, no surprise resume.
  const t = r.throttle;
  controlRocket(r, idle, 1 / 60);
  eq(r.autoGuidance, false, 'autopilot stays off after the key is released');
  eq(r.throttle, t, 'throttle is left where the player has it');
  g.update(1 / 60);
  ok(g.toasts.some(x => /Autopilot disengaged/.test(x)), 'the override is announced');
  ok(/MANUAL OVERRIDE \[G\]/.test(element('metricsMore').innerHTML), 'HUD shows MANUAL OVERRIDE');
  // Throttle keys override too.
  r.autoGuidance = true;
  controlRocket(r, holding('KeyX'), 1 / 60);
  eq(r.autoGuidance, false, 'X (cut throttle) overrides');
  eq(r.throttle, 0, 'X cuts the throttle immediately');
  // G re-engages with a fresh phase derived from the state.
  r.guidanceMemory = {meco: true, circularizing: true, unreachable: true, downrange: 1};
  press(g, 'KeyG');
  eq(r.autoGuidance, true, 'G re-engages');
  eq(r.guidanceMemory, null, 're-engaging starts from the live state, not stale memory');
  press(g, 'KeyG');
  eq(r.autoGuidance, false, 'G again disengages');
}

/* ---- MAP mode: arrow keys cycle bodies, they do not fly the rocket ------ */
{
  const g = launched('weather');
  const r = g.rocket;
  r.nextStage(); r.autoGuidance = true; r.guidanceTargetAltitude = 700e3;
  run(g, 10);
  g.setMode('MAP');
  g.input.keys.add('ArrowDown'); g.input.keys.add('ArrowRight');
  run(g, 1);
  eq(r.autoGuidance, true, 'MAP arrow keys do not disengage the autopilot');
  g.input.keys.clear();
  // Without the autopilot, arrows on the map leave throttle/steer alone (audit B-13).
  r.autoGuidance = false; r.throttle = 0.5; r.steer = 0;
  g.input.keys.add('ArrowDown'); g.input.keys.add('ArrowRight');
  run(g, 0.5);
  eq(r.throttle, 0.5, 'MAP arrows do not change the throttle');
  eq(r.steer, 0, 'MAP arrows do not steer');
  g.input.keys.clear();
  g.input.keys.add('KeyW');
  run(g, 0.5);
  ok(r.throttle > 0.5, 'W still throttles up on the map');
  g.input.keys.clear();
  // In FLIGHT the arrows are flight controls as before.
  g.setMode('FLIGHT');
  r.throttle = 0.5;
  g.input.keys.add('ArrowUp');
  run(g, 0.5);
  ok(r.throttle > 0.5, 'ArrowUp throttles up in FLIGHT');
  g.input.keys.clear();
}

/* ---- Autopilot staging request is applied and logged -------------------- */
{
  const g = launched('weather');
  const r = g.rocket;
  r.nextStage(); r.landed = false; r.hasFlown = true;
  r.position.y += 40e3; r.velocity.x += 900; r.velocity.y += 700;
  r.stageFuel[r.stageIndex] = 0;                       // booster dry
  r.autoGuidance = true; r.guidanceTargetAltitude = 700e3;
  controlRocket(r, idle, 1 / 60);
  eq(r.stageNumber, 2, 'dry booster: autopilot stages to the upper stage');
  ok(r.flightEvents.some(e => e.type === 'STAGE_SEPARATION' && e.trigger === 'AUTOPILOT' && e.fromStage === 1 && e.toStage === 2),
    'autopilot separation is logged');
  ok(r.payloadAttached, 'payload stays attached');
}

console.log(`${checks} checks passed: G toggles the autopilot (profile target, STANDBY until SPACE), controller applies guidance, ` +
  'manual input overrides instantly and it stays off until G, MAP arrows do not fly the rocket, autopilot staging, HUD phase');
