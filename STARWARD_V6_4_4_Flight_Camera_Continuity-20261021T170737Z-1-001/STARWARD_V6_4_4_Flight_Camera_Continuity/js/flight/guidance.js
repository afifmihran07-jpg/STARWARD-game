/* =========================================================================
   guidance.js — gravity-turn ascent and circularization autopilot (P1-1).

   A PURE function: guide(rocket, body, target, memory) reads the live vehicle
   state and returns commands {steer, throttle, stage, phase, memory}. It never
   writes to the rocket; flightController.controlRocket applies the commands.
   It uses only the vehicle's position/velocity relative to its primary body
   and orbital elements computed from them — never the trajectory predictor.

   Phases
     STANDBY        engines not ignited yet (throttle armed, waiting for SPACE)
     VERTICAL_RISE  straight up to ~1 km above the pad
     PITCH_PROGRAM  pitch over as apoapsis rises towards the target, held near
                    prograde in dense air, never letting time-to-apoapsis
                    collapse; throttle limited by max-q and max-g
     COAST          main engine cut off once apoapsis reaches the target;
                    point horizontal-prograde and wait for apoapsis
     CIRCULARIZE    burn near apoapsis, steering to keep radial velocity ≈ 0,
                    until the horizontal speed reaches local circular speed
     ORBIT          bound, periapsis above the atmosphere + 10 km, engines off
     TARGET_UNREACHABLE  remaining Δv cannot circularize at the target: burn the
                    rest horizontally (best effort) and say so
     ENGINE_OUT     no lit engine with propellant and nothing left to stage

   Educational 2D model, not flight software.
   ========================================================================= */
const G0 = 9.80665;
const DEG = Math.PI / 180;

export const GUIDANCE_DEFAULTS = Object.freeze({
  altitude: 200000,      // target apoapsis / orbit altitude, m
  maxQ: 35000,           // dynamic-pressure limit, Pa
  maxG: 4,               // powered acceleration limit (thrust + drag), g
  kickAltitude: 1000,    // end of the vertical rise, m above the surface
  periapsisMargin: 10000 // orbit requires periapsis ≥ atmosphere top + this, m
});

export const GUIDANCE_PHASE_LABELS = Object.freeze({
  STANDBY: 'STANDBY · PRESS SPACE', VERTICAL_RISE: 'VERTICAL RISE', PITCH_PROGRAM: 'GRAVITY TURN',
  COAST: 'COAST TO APOAPSIS', CIRCULARIZE: 'CIRCULARIZING', ORBIT: 'ORBIT · ENGINES OFF',
  TARGET_UNREACHABLE: 'TARGET UNREACHABLE · BEST EFFORT', ENGINE_OUT: 'ENGINE OUT · NO PROPELLANT',
  MANUAL_OVERRIDE: 'MANUAL OVERRIDE'
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** Relative state and orbital quantities about the body (no side effects). */
export function relativeState(rocket, body) {
  const rx = rocket.position.x - body.position.x, ry = rocket.position.y - body.position.y;
  const vx = rocket.velocity.x - body.velocity.x, vy = rocket.velocity.y - body.velocity.y;
  const r = Math.hypot(rx, ry);
  const up = {x: rx / r, y: ry / r};
  const h = rx * vy - ry * vx;                         // specific angular momentum (z)
  const vr = vx * up.x + vy * up.y;                    // radial speed
  const vt = Math.abs(h) / r;                          // horizontal speed
  const v2 = vx * vx + vy * vy;
  const energy = v2 / 2 - body.mu / r;
  const a = energy < 0 ? -body.mu / (2 * energy) : Infinity;
  const e = Math.sqrt(Math.max(0, 1 + 2 * energy * h * h / (body.mu * body.mu)));
  // A closed orbit needs e < 1; but any negative-energy trajectory (including
  // the purely radial e = 1 one straight off the pad) has a finite apoapsis.
  const bound = energy < 0 && e < 1;
  return {
    rx, ry, vx, vy, r, up, h, vr, vt, v2, a, e, bound,
    altitude: r - body.radius,
    apoapsis: energy < 0 ? a * (1 + e) : Infinity,      // radius
    periapsis: energy < 0 ? a * (1 - e) : 0
  };
}

/** Signed time (s) to the next apoapsis; negative just after passing it. */
export function timeToApoapsis(s, mu) {
  if (!s.bound || !(s.a > 0)) return Infinity;
  if (s.e < 1e-6) return 0;
  const n = Math.sqrt(mu / (s.a * s.a * s.a));
  const cosE = (1 - s.r / s.a) / s.e;
  const sinE = (s.rx * s.vx + s.ry * s.vy) / (s.e * Math.sqrt(mu * s.a));
  const E = Math.atan2(sinE, cosE);
  let M = E - s.e * Math.sin(E);
  if (M < 0) M += 2 * Math.PI;
  return (Math.PI - M) / n;                            // in (−π/n, π/n]
}

/** Δv to circularize at the apoapsis of the current orbit (m/s). */
export function circularizationDeltaV(s, mu) {
  if (!s.bound) return Infinity;
  const ra = s.apoapsis;
  return Math.sqrt(mu / ra) - Math.sqrt(Math.max(0, mu * (2 / ra - 1 / s.a)));
}

/** Rocket angle (thrust along (sin a, cos a)) for a pitch θ from local vertical. */
function angleForPitch(s, pitch, downrange) {
  // Horizontal unit vector in the direction of travel (or launch direction).
  const tx = s.up.y * downrange, ty = -s.up.x * downrange;
  const dx = Math.cos(pitch) * s.up.x + Math.sin(pitch) * tx;
  const dy = Math.cos(pitch) * s.up.y + Math.sin(pitch) * ty;
  return Math.atan2(dx, dy);
}

/**
 * @param rocket  live Rocket (read only)
 * @param body    primary body
 * @param target  {altitude, maxQ, maxG}; missing fields use GUIDANCE_DEFAULTS
 * @param memory  previous memory object (or null); never mutated
 * @returns {{steer:number, throttle:number, stage:boolean, phase:string, memory:object, info:object}}
 */
export function guide(rocket, body, target = {}, memory = null) {
  const cfg = {...GUIDANCE_DEFAULTS, ...Object.fromEntries(Object.entries(target).filter(([, v]) => Number.isFinite(v)))};
  const mem = {meco: false, circularizing: false, unreachable: false, inOrbit: false, downrange: 0, ...(memory || {})};
  const s = relativeState(rocket, body);
  const atmTop = body.atmosphere ? body.atmosphere.height : 0;
  const targetRadius = body.radius + Math.max(cfg.altitude, atmTop + cfg.periapsisMargin);
  // Launch to the downrange side the vehicle is already moving towards;
  // default clockwise (+x at the top of the planet) from the pad.
  if (!mem.downrange) mem.downrange = Math.abs(s.h) > 1 ? -Math.sign(s.h) : 1;
  const downrange = mem.downrange;

  const engine = rocket.activeEngine;
  const hasThrust = !!engine && rocket.currentFuel > 0;
  const canStage = typeof rocket.canStage === 'function' ? rocket.canStage() : false;
  const mass = Math.max(1, rocket.mass);
  const gLocal = body.mu / (s.r * s.r);
  const q = rocket.dynPressure || 0;

  // Throttle limits.
  //  max-g: thrust acceleration ≤ maxG.
  //  max-q: q = ½ρv², so q ≤ maxQ means speed ≤ v_lim = √(2·maxQ/ρ). The air
  //  density comes from the live state (ρ = 2q/v²), not a copy of the model.
  //  Command an acceleration toward v_lim and convert it to throttle with the
  //  local gravity along the flight path.
  const thrustMax = engine ? engine.thrust : 0;
  const gThrottle = thrustMax > 0 ? clamp(cfg.maxG * 0.99 * G0 * mass / thrustMax, 0, 1) : 0;
  const speed = Math.sqrt(s.v2);
  let qThrottle = 1;
  if (thrustMax > 0 && q > 1 && speed > 1) {
    const rho = 2 * q / s.v2;
    const vLim = Math.sqrt(2 * cfg.maxQ / rho) * 0.97;
    const aCmd = clamp(0.6 * (vLim - speed), -gLocal, cfg.maxG * G0);
    const gravityAlongPath = gLocal * Math.max(0, s.vr / speed);
    qThrottle = clamp(mass * (aCmd + gravityAlongPath) / thrustMax, 0, 1);
  }
  const limitedThrottle = Math.min(gThrottle, qThrottle);

  const steerTo = angle => {
    const err = wrap(angle - (rocket.angle || 0));
    return clamp(4 * err - 2.5 * (rocket.angVel || 0), -1, 1);
  };
  const out = (phase, throttle, angle, extra = {}) => ({
    phase, throttle: clamp(throttle, 0, 1),
    steer: angle == null ? 0 : steerTo(angle),
    stage: !!extra.stage,
    memory: mem,
    info: {apoapsis: s.apoapsis - body.radius, periapsis: s.periapsis - body.radius, vr: s.vr, vt: s.vt, q, ...extra.info}
  });
  const horizontal = angleForPitch(s, 90 * DEG, downrange);

  // Not ignited yet: arm the throttle, wait for the player's SPACE.
  if (rocket.stageIndex < 0) return out('STANDBY', 1, rocket.angle || 0);

  // Orbit achieved: bound, periapsis clear of the atmosphere (+10 km, +1 km
  // so spool-down cannot leave it on the line) and horizontal speed at local
  // circular speed. Engines off.
  const periapsisClear = s.bound && s.periapsis - body.radius >= atmTop + cfg.periapsisMargin + 1000;
  const circular = s.vt >= Math.sqrt(body.mu / s.r) - 0.5;
  // Once achieved, ORBIT is latched: a real orbit is slightly elliptical, so
  // near apoapsis the horizontal speed dips below local circular speed —
  // that must not restart the engines. Engines stay off until the player
  // disengages the autopilot.
  if (mem.inOrbit) return out('ORBIT', 0, horizontal);
  if (periapsisClear && circular) {
    mem.inOrbit = true;
    return out('ORBIT', 0, horizontal);
  }

  // Staging: lit stage dry or no engine, and a further propulsive stage exists.
  if (!hasThrust) {
    if (canStage) return out(mem.meco && !mem.circularizing ? 'COAST' : 'PITCH_PROGRAM', 1, null, {stage: true});
    return out(periapsisClear ? 'ORBIT' : 'ENGINE_OUT', 0, horizontal);
  }

  // Remaining vacuum Δv of the lit stage and everything above it.
  const dvLeft = typeof rocket.stats === 'function' ? rocket.stats().dv : Infinity;

  if (mem.unreachable) {
    return out('TARGET_UNREACHABLE', limitedThrottle, horizontal, {info: {dvLeft}});
  }

  if (!mem.meco) {
    if (s.apoapsis >= targetRadius) {
      // MECO decision: can the remaining Δv circularize at this apoapsis?
      const need = circularizationDeltaV(s, body.mu);
      if (dvLeft < need * 1.03) {
        mem.unreachable = true;
        return out('TARGET_UNREACHABLE', limitedThrottle, horizontal, {info: {dvLeft, need}});
      }
      mem.meco = true;
    } else {
      // Ascent: vertical rise, then a pitch program held near prograde.
      if (s.altitude < cfg.kickAltitude) return out('VERTICAL_RISE', limitedThrottle, angleForPitch(s, 0, downrange));
      // Pitch is scheduled on apoapsis progress, so the vehicle reaches the
      // horizontal exactly as its apoapsis reaches the target altitude.
      const apoAlt = Math.max(0, s.apoapsis - body.radius);
      const frac = clamp(apoAlt / (targetRadius - body.radius), 0, 1);
      let pitch = 90 * DEG * Math.pow(frac, 0.55);
      // Flight-path angle from vertical (prograde); keep the angle of attack
      // small while the air is dense.
      const fpa = Math.atan2(s.vt, s.vr);
      const aoa = q > 20000 ? 6 * DEG : q > 5000 ? 10 * DEG : 20 * DEG;
      pitch = clamp(pitch, fpa - aoa, fpa + aoa);
      // Keep climbing until apoapsis reaches the target: hold the vertical
      // speed needed to stay holdSeconds from apoapsis (10 s near the ground,
      // growing to 50 s at the top of the air, 25 s above it) (net downward acceleration is
      // gravity minus the centrifugal term). Pitch no further over than lets
      // the thrust's vertical component restore that vertical speed.
      const gEff = Math.max(0, gLocal - s.vt * s.vt / s.r);
      const holdSeconds = s.altitude < atmTop ? clamp(10 + s.altitude / 1000, 10, 50) : 25;
      const vrRequired = gEff * holdSeconds;
      const aThrust = thrustMax * Math.max(0.05, limitedThrottle) / mass;
      const aVertical = gEff + 0.1 * (vrRequired - s.vr);
      const pitchMax = Math.acos(clamp(aVertical / Math.max(aThrust, 1e-6), 0, 1));
      pitch = Math.min(pitch, pitchMax);
      // Do not pitch below the horizon while still climbing out of the air.
      pitch = clamp(pitch, 0, s.altitude < atmTop ? 88 * DEG : 92 * DEG);
      return out('PITCH_PROGRAM', limitedThrottle, angleForPitch(s, pitch, downrange));
    }
  }

  // Past MECO: drag inside the atmosphere can pull apoapsis back down.
  if (!mem.circularizing && s.altitude < atmTop && s.apoapsis < targetRadius * 0.995) {
    mem.meco = false;
    return out('PITCH_PROGRAM', limitedThrottle, horizontal);
  }

  // Coast until the circularization burn should start (half the burn before apoapsis).
  if (!mem.circularizing) {
    const need = circularizationDeltaV(s, body.mu);
    const accel = Math.max(0.1, Math.min(thrustMax / mass, cfg.maxG * G0));
    const burnTime = need / accel;
    const tApo = timeToApoapsis(s, body.mu);
    if (tApo > burnTime / 2) return out('COAST', 0, horizontal, {info: {tApo, burnTime, need, dvLeft}});
    mem.circularizing = true;
  }

  // Circularize: thrust horizontal, pitched to null the radial speed.
  const pitch = clamp(90 * DEG + clamp(s.vr * 0.15, -30, 30) * DEG, 60 * DEG, 120 * DEG);
  return out('CIRCULARIZE', limitedThrottle, angleForPitch(s, pitch, downrange), {info: {dvLeft}});
}
