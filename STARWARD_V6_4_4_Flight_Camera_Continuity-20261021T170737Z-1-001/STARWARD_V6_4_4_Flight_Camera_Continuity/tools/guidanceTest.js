/* B1 / P1-1: js/flight/guidance.js is a pure function with correct phases,
 * throttle limits and orbital helpers. Crafted states only (no integration). */
import assert from 'node:assert/strict';
import {guide, relativeState, timeToApoapsis, circularizationDeltaV, GUIDANCE_DEFAULTS} from '../js/flight/guidance.js';
import {Editor} from '../js/construction/editor.js';
import {Rocket} from '../js/rocket/rocket.js';
import {createSolarSystem} from '../js/celestial/solarSystem.js';
import {terrainHeight} from '../js/physics/collision.js';

const G0 = 9.80665;
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, m); checks++; };
const near = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m}: got ${a}, expected ${b} ±${tol}`); checks++; };

const bodies = createSolarSystem();
const earth = bodies.find(b => b.id === 'earth');
const ATM = earth.atmosphere.height;

/** earthObservation stack; `stage` presses of SPACE; placed relative to Earth. */
function vehicle({stage = 2, alt = 300e3, vr = 0, vt = null, angle = Math.PI / 2, q = 0} = {}) {
  const e = new Editor(); e.loadPreset('earthObservation');
  const r = new Rocket(e.parts);
  for (let i = 0; i < stage; i++) r.nextStage();
  const R = earth.radius + alt;
  const speedT = vt == null ? Math.sqrt(earth.mu / R) : vt;
  // On the +y side of Earth: up = +y; downrange (clockwise) = +x.
  r.position = {x: earth.position.x, y: earth.position.y + R};
  r.velocity = {x: earth.velocity.x + speedT, y: earth.velocity.y + vr};
  r.angle = angle; r.angVel = 0; r.throttle = 0; r.spool = 0; r.dynPressure = q;
  r.landed = false; r.hasFlown = true; r.primaryBody = earth; r.body = earth;
  return r;
}
const snapshot = r => JSON.stringify({p: r.position, v: r.velocity, a: r.angle, w: r.angVel, t: r.throttle, s: r.spool,
  si: r.stageIndex, f: r.stageFuel, n: r.parts.length, ev: (r.flightEvents || []).length, g: r.autoGuidance, st: r.steer});

/* ---- Helpers vs independent formulas ------------------------------------ */
{
  const r = vehicle({alt: 300e3});                       // circular
  const s = relativeState(r, earth);
  near(s.e, 0, 1e-9, 'circular orbit: e = 0');
  near(s.apoapsis - earth.radius, 300e3, 1e-3, 'circular orbit: apoapsis 300 km');
  near(circularizationDeltaV(s, earth.mu), 0, 1e-6, 'circular orbit needs no circularization Δv');
  // At periapsis of an ellipse, time to apoapsis is half the period.
  const R = earth.radius + 300e3, vp = Math.sqrt(earth.mu / R) + 400;
  const el = relativeState(vehicle({alt: 300e3, vt: vp}), earth);
  const a = 1 / (2 / R - vp * vp / earth.mu);
  near(el.a, a, 1e-3, 'semi-major axis matches vis-viva');
  near(timeToApoapsis(el, earth.mu), Math.PI * Math.sqrt(a ** 3 / earth.mu), 0.5, 'time to apoapsis from periapsis = half period');
  const ra = 2 * a - R, vApo = Math.sqrt(earth.mu * (2 / ra - 1 / a));
  near(circularizationDeltaV(el, earth.mu), Math.sqrt(earth.mu / ra) - vApo, 1e-6, 'circularization Δv = v_circ(ra) − v_apo');
  // Just past apoapsis the time is slightly negative.
  const past = relativeState(vehicle({alt: 300e3, vt: Math.sqrt(earth.mu / R) - 200, vr: -5}), earth);
  ok(timeToApoapsis(past, earth.mu) < 0, 'just past apoapsis: negative time to apoapsis');
  // Radial (e = 1) negative-energy trajectory off the pad still has a finite apoapsis.
  const pad = relativeState(vehicle({alt: 0, vt: 0, vr: 100}), earth);
  ok(Number.isFinite(pad.apoapsis) && pad.apoapsis - earth.radius < 1000, 'radial climb: finite, low apoapsis');
}

/* ---- Purity: guide() never mutates the rocket or the memory -------------- */
{
  const states = [vehicle({stage: 0}), vehicle({stage: 1, alt: 500, vt: 0, vr: 50, angle: 0}),
    vehicle({stage: 1, alt: 20e3, vt: 300, vr: 400, angle: 0.3, q: 30000}), vehicle({alt: 300e3})];
  for (const [i, r] of states.entries()) {
    const before = snapshot(r);
    const mem = Object.freeze({meco: false, circularizing: false, unreachable: false, downrange: 1});
    const out1 = guide(r, earth, {altitude: 500e3}, mem);   // frozen memory: any write would throw
    const out2 = guide(r, earth, {altitude: 500e3}, mem);
    eq(snapshot(r), before, `state ${i}: rocket unchanged by guide()`);
    ok(out1.memory !== mem, `state ${i}: memory returned as a new object`);
    eq(JSON.stringify([out1.steer, out1.throttle, out1.phase, out1.stage]),
       JSON.stringify([out2.steer, out2.throttle, out2.phase, out2.stage]), `state ${i}: deterministic`);
    ok(out1.throttle >= 0 && out1.throttle <= 1 && out1.steer >= -1 && out1.steer <= 1, `state ${i}: commands in range`);
  }
}

/* ---- Phases ------------------------------------------------------------- */
{
  const standby = guide(vehicle({stage: 0, alt: 0, vt: 0}), earth, {});
  eq(standby.phase, 'STANDBY', 'not ignited -> STANDBY');
  eq(standby.throttle, 1, 'STANDBY arms the throttle for SPACE');

  const rise = guide(vehicle({stage: 1, alt: 400, vt: 0, vr: 30, angle: 0}), earth, {});
  eq(rise.phase, 'VERTICAL_RISE', 'below 1 km -> VERTICAL_RISE');
  near(rise.steer, 0, 1e-9, 'vertical rise: already vertical, no steering');

  const turn = guide(vehicle({stage: 1, alt: 15e3, vt: 200, vr: 450, angle: 0.2, q: 15000}), earth, {altitude: 500e3});
  eq(turn.phase, 'PITCH_PROGRAM', 'climbing below target apoapsis -> PITCH_PROGRAM');

  // MECO: apoapsis at target and enough Δv to circularize -> COAST, engines off.
  const R = earth.radius + 200e3;
  const coast = guide(vehicle({alt: 200e3, vt: Math.sqrt(earth.mu / R) - 300, vr: 600}), earth, {altitude: 250e3});
  eq(coast.phase, 'COAST', 'apoapsis at target with Δv to spare -> COAST');
  eq(coast.throttle, 0, 'COAST: engines off');
  ok(coast.memory.meco, 'COAST: MECO remembered');

  // Near apoapsis after MECO -> CIRCULARIZE with thrust.
  // Just past apoapsis (v_r slightly negative): the burn must already be on.
  const nearApo = vehicle({alt: 250e3, vt: Math.sqrt(earth.mu / (earth.radius + 250e3)) - 150, vr: -1});
  const circ = guide(nearApo, earth, {altitude: 250e3}, {meco: true, downrange: 1});
  eq(circ.phase, 'CIRCULARIZE', 'at apoapsis after MECO -> CIRCULARIZE (got ' + circ.phase + ')');
  ok(circ.throttle > 0, 'CIRCULARIZE: burning');

  // Circular above the atmosphere -> ORBIT, engines off.
  const orbit = guide(vehicle({alt: 300e3}), earth, {altitude: 300e3}, {meco: true, circularizing: true, downrange: 1});
  eq(orbit.phase, 'ORBIT', 'circular orbit above the atmosphere -> ORBIT');
  eq(orbit.throttle, 0, 'ORBIT: engines off');

  // ORBIT is latched: at the apoapsis of a slightly elliptical orbit the
  // horizontal speed is below local circular speed, but the engines must
  // stay off once orbit was reached (found by the E2E stability check).
  const Ra = earth.radius + 530e3, Rp = earth.radius + 500e3, aEl = (Ra + Rp) / 2;
  const vApo = Math.sqrt(earth.mu * (2 / Ra - 1 / aEl));
  const atApo = vehicle({alt: 530e3, vt: vApo, vr: 0});
  ok(vApo < Math.sqrt(earth.mu / Ra), 'fixture: below circular speed at apoapsis');
  const latched = guide(atApo, earth, {altitude: 500e3}, {meco: true, circularizing: true, inOrbit: true, downrange: 1});
  eq(latched.phase, 'ORBIT', 'ORBIT stays latched at apoapsis of an elliptical orbit');
  eq(latched.throttle, 0, 'latched ORBIT: engines stay off');
  const fresh = guide(atApo, earth, {altitude: 500e3}, {meco: true, circularizing: true, downrange: 1});
  ok(fresh.phase !== 'ORBIT' || fresh.memory.inOrbit, 'without the latch the same state is not mistaken for a finished insertion');

  // Apoapsis at target but nowhere near enough Δv -> TARGET_UNREACHABLE, best-effort burn.
  const poor = vehicle({alt: 150e3, vt: 2000, vr: 1500});
  poor.stageFuel[poor.stageIndex] = 50;
  const unreachable = guide(poor, earth, {altitude: 200e3});
  eq(unreachable.phase, 'TARGET_UNREACHABLE', 'insufficient Δv at MECO -> TARGET_UNREACHABLE');
  ok(unreachable.throttle > 0, 'TARGET_UNREACHABLE: keeps burning the remainder');
  ok(unreachable.memory.unreachable, 'TARGET_UNREACHABLE: remembered');

  // Lit stage dry, another propulsive stage above -> request staging.
  const dry = vehicle({stage: 1, alt: 40e3, vt: 900, vr: 700});
  dry.stageFuel[dry.stageIndex] = 0;
  const st = guide(dry, earth, {altitude: 500e3});
  eq(st.stage, true, 'dry stage with a stage above -> stage request');

  // Last stage dry, suborbital -> ENGINE_OUT (failure stated, no thrust).
  const out = vehicle({alt: 150e3, vt: 3000, vr: 200});
  out.stageFuel[out.stageIndex] = 0;
  const eo = guide(out, earth, {altitude: 500e3});
  eq(eo.phase, 'ENGINE_OUT', 'no propellant, nothing to stage, suborbital -> ENGINE_OUT');
  eq(eo.throttle, 0, 'ENGINE_OUT: no thrust commanded');
  eq(eo.stage, false, 'ENGINE_OUT: no stage request');
}

/* ---- Throttle limits ---------------------------------------------------- */
{
  // Max-g in vacuum on a light upper stage.
  const light = vehicle({alt: 150e3, vt: 3000, vr: 800});
  light.stageFuel[light.stageIndex] = 200;               // nearly empty: TWR > 4 g at full throttle
  const lg = guide(light, earth, {altitude: 500e3, maxG: 4});
  ok(light.activeEngine.thrust / light.mass > 4 * G0, 'fixture: full thrust would exceed 4 g');
  ok(lg.throttle * light.activeEngine.thrust / light.mass <= 4 * G0 + 1e-9, 'max-g: thrust acceleration ≤ 4 g');

  // Max-q: at the limit the speed-based law cuts throttle below the low-q value.
  const lowQ = guide(vehicle({stage: 1, alt: 8e3, vt: 150, vr: 200, angle: 0.4, q: 10000}), earth, {});
  const highQ = guide(vehicle({stage: 1, alt: 8e3, vt: 300, vr: 400, angle: 0.4, q: 45000}), earth, {});
  ok(highQ.throttle < lowQ.throttle, `max-q: throttle reduced above the limit (${highQ.throttle.toFixed(2)} < ${lowQ.throttle.toFixed(2)})`);
  eq(GUIDANCE_DEFAULTS.maxQ, 35000, 'default dynamic-pressure limit 35 kPa');
  eq(GUIDANCE_DEFAULTS.altitude, 200000, 'default target 200 km');
}

console.log(`${checks} checks passed: guidance helpers vs independent formulas, purity/determinism, every phase, ` +
  'max-g and max-q throttle limits, staging request, unreachable and engine-out failure states');
