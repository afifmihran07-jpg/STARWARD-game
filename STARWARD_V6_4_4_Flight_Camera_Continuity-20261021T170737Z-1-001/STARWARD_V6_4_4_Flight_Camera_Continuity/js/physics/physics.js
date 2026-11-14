/* =========================================================================
   physics.js — one fixed step of Newtonian flight.

   Gravity is summed over every body (no "primary" fudge), thrust comes from
   whatever engines the current stage lit, and the same step resolves the
   ground so a vehicle cannot sink into a planet.
   ========================================================================= */
import {gravityAt} from './gravity.js';
import {surfaceCollision} from './collision.js';

/** Impact speed above which the vehicle is destroyed. */
const CRASH_SPEED = 22;

/** Standard-atmosphere speed-of-sound estimate for Earth; other atmospheres
 * use a clearly simplified temperature envelope because the game stores only
 * nominal density and height for those bodies. Mach is undefined in vacuum. */
function speedOfSoundAtAltitude(body, altitude) {
  if (!body?.atmosphere || altitude >= body.atmosphere.height) return 0;
  const h = Math.max(0, altitude);
  if (body.id === 'earth') {
    let temperature;
    if (h < 11000) temperature = 288.15 - 0.0065 * h;
    else if (h < 20000) temperature = 216.65;
    else if (h < 32000) temperature = 216.65 + 0.001 * (h - 20000);
    else if (h < 47000) temperature = 228.65 + 0.0028 * (h - 32000);
    else if (h < 51000) temperature = 270.65;
    else if (h < 71000) temperature = 270.65 - 0.0028 * (h - 51000);
    else if (h < 86000) temperature = 214.65 - 0.002 * (h - 71000);
    else temperature = 184.65;
    return Math.sqrt(1.4 * 287.05 * Math.max(140, temperature));
  }
  const fraction = Math.max(0.25, 1 - h / body.atmosphere.height);
  return 340 * Math.sqrt(fraction);
}

export function stepRocket(rocket, bodies, dt) {
  if (!rocket.primaryBody) rocket.primaryBody = findPrimaryBody(rocket, bodies);
  if (rocket.crashed) return;
  const primary = rocket.primaryBody;

  let ax = 0, ay = 0;
  rocket.actualThrust = 0;

  const g = gravityAt(rocket.position, bodies);
  ax += g.x;
  ay += g.y;

  const engine = rocket.activeEngine;
  const alt = primary.altitude(rocket.position);
  rocket.flightElapsed = (rocket.flightElapsed || 0) + dt;

  // --- Atmosphere state (shared by drag, ISP, steering, FX) -----------------
  const rvx0 = rocket.velocity.x - primary.velocity.x;
  const rvy0 = rocket.velocity.y - primary.velocity.y;
  const relSpeed = Math.hypot(rvx0, rvy0);
  let rho = 0, q = 0;
  if (primary.atmosphere && alt < primary.atmosphere.height) {
    rho = primary.atmosphere.density * Math.exp(-Math.max(0, alt) / 8500);
    q = 0.5 * rho * relSpeed * relSpeed;
  }
  rocket.dynPressure = q;
  if (q > (rocket.maxDynPressure || 0)) {
    rocket.maxDynPressure = q;
    rocket.maxQAltitude = alt;
    rocket.maxQTime = rocket.flightElapsed;
    if (rocket.maxQRecorded) {
      const event = (rocket.flightEvents || []).find(e => e.type === 'MAX_Q');
      if (event) { event.time = rocket.maxQTime; event.altitude = alt; event.dynamicPressure = q; }
    }
  } else if (!rocket.maxQRecorded && (rocket.maxDynPressure || 0) >= 1000 &&
      alt > 500 && q <= rocket.maxDynPressure * 0.97) {
    rocket.maxQRecorded = true;
    // Max-Q is a flight event, not a new propulsion phase. Keep POWERED_ASCENT
    // until cutoff/coast is actually reached.
    rocket.flightEvents = rocket.flightEvents || [];
    rocket.flightEvents.push({type:'MAX_Q', time:rocket.maxQTime, altitude:rocket.maxQAltitude, dynamicPressure:rocket.maxDynPressure});
  }
  // Mach is an atmospheric quantity; do not invent a vacuum sound speed.
  const soundSpeed = speedOfSoundAtAltitude(primary, alt);
  rocket.mach = soundSpeed > 1 ? relSpeed / soundSpeed : 0;

  // --- Engine spool: thrust lags the lever like real turbopumps -------------
  const leverOn = rocket.throttle > 0.005 && engine && rocket.currentFuel > 0 && !rocket.crashed;
  const spoolTarget = leverOn ? rocket.throttle : 0;
  // Spool up ~1.2s, spool down ~0.6s — punchy but physical.
  const spoolRate = spoolTarget > (rocket.spool || 0) ? 2.4 : 4.5;
  rocket.spool = (rocket.spool || 0) + (spoolTarget - (rocket.spool || 0)) * Math.min(1, dt * spoolRate);
  if (Math.abs(spoolTarget - rocket.spool) < 0.002) rocket.spool = spoolTarget;

  // Vacuum-optimised engines underperform deep in atmosphere and vice versa:
  // blend Isp by pressure ratio so sea-level vs vacuum choice matters.
  let ispEff = engine ? engine.isp : 0;
  if (engine && primary.atmosphere) {
    const pRatio = Math.max(0, Math.min(1, 1 - Math.max(0, alt) / primary.atmosphere.height));
    const seaBias = engine.isp >= 400 ? 0.72 : 0.92; // high-Isp = vacuum tuned
    ispEff = engine.isp * (seaBias + (1 - seaBias) * (1 - pRatio));
  }
  rocket.ispEff = ispEff;
  if (rocket._stageIgnitionPending && rocket.spool > 0.1 && engine) {
    rocket.flightEvents = rocket.flightEvents || [];
    rocket.flightEvents.push({type:'NEXT_STAGE_IGNITION', time:rocket.flightElapsed, altitude:alt, stageIndex:rocket.stageIndex});
    rocket._stageIgnitionPending = false;
    rocket.flightPhase = 'POWERED_ASCENT';
  }

  if (rocket.spool > 0.003 && engine && rocket.currentFuel > 0) {
    const isp = Math.max(50, ispEff);
    const requestedThrust = engine.thrust * rocket.spool;
    const requestedFuel = requestedThrust / (isp * 9.80665) * dt;
    // Do not apply a full final-step thrust impulse after the last propellant has
    // already been consumed. Scale thrust to the mass flow available this step.
    const availableFuel = Math.max(0, rocket.currentFuel);
    const burnedFuel = Math.min(availableFuel, requestedFuel);
    const effectiveThrust = dt > 0 ? burnedFuel * isp * 9.80665 / dt : 0;
    rocket.actualThrust = effectiveThrust;
    ax += Math.sin(rocket.angle) * effectiveThrust / Math.max(1, rocket.mass);
    ay += Math.cos(rocket.angle) * effectiveThrust / Math.max(1, rocket.mass);
    rocket.burn(burnedFuel);
    if (rocket.currentFuel <= 1e-9) {
      rocket.throttle = 0;
      rocket.spool = 0;
      // Stage changes are physical state changes; the remaining stage continues
      // from the same position/velocity (the model has no separation impulse).
      const priorStage = rocket.stageIndex;
      if (!rocket.crashed && !rocket.landed) {
        const lit = rocket.nextStage();
        if (lit) {
          rocket.flightEvents = rocket.flightEvents || [];
          rocket.flightEvents.push({type:'STAGE_SEPARATION', time:rocket.flightElapsed, altitude:alt,
            fromStage:priorStage + 1, toStage:rocket.stageIndex + 1, separationImpulse:0});
          rocket.flightPhase = 'STAGE_SEPARATION';
          if (rocket.activeEngine && !rocket.landed) {
            rocket.throttle = 1; // automatic staging commands the next engine to light
            rocket._stageIgnitionPending = true;
          }
        } else {
          rocket.flightPhase = 'ENGINE_CUTOFF';
          rocket.flightEvents = rocket.flightEvents || [];
          rocket.flightEvents.push({type:'ENGINE_CUTOFF', time:rocket.flightElapsed, altitude:alt, reason:'PROPELLANT_DEPLETED', stageIndex:priorStage});
        }
      }
    }
  }

  // --- Drag: CdA from stack width, sleeker = less drag --------------------
  if (q > 0) {
    const widthM = 4; // ~2 build units; keeps physics import-free
    const area = Math.PI * Math.pow(widthM / 2, 2);
    // Cd ~0.22 nose-first; blunt sideways flow punished via AoA.
    const nx = relSpeed > 0.01 ? rvx0 / relSpeed : 0;
    const ny = relSpeed > 0.01 ? rvy0 / relSpeed : 0;
    const noseX = Math.sin(rocket.angle), noseY = Math.cos(rocket.angle);
    const align = Math.abs(noseX * -nx + noseY * -ny); // 1 = nose-first
    const cd = 0.22 + (1 - align) * 1.1;
    // Proper opposing acceleration: F = q * A * Cd.
    const dragAcc = q * area * cd / Math.max(1, rocket.mass);
    ax -= nx * dragAcc;
    ay -= ny * dragAcc;
  }

  // --- Rotation dynamics: torque, inertia, SAS -----------------------------
  // `steer` (-1..1) is set by the flight controller; torque authority comes
  // from the parts (gimbal/fins/wheels). SAS auto-damps leftover spin.
  {
    const authority = typeof rocket.torqueAuthority === 'function'
      ? rocket.torqueAuthority(q) : 1.2;
    const steerCmd = Math.max(-1, Math.min(1, rocket.steer || 0));
    // Gimbal effectiveness scales with thrust; wheels work without it.
    const gimbalFactor = 0.35 + 0.65 * Math.min(1, (rocket.spool || 0) * 1.5);
    let angAcc = steerCmd * authority * gimbalFactor;
    if (rocket.sas && Math.abs(steerCmd) < 0.05) {
      // Stability assist: critically-ish damped stop, no oscillation — and
      // strong enough that releasing a hard turn settles within a few seconds.
      angAcc += (-(rocket.angVel || 0) * 3.0);
    } else {
      angAcc += (-(rocket.angVel || 0) * 0.35); // natural rotary damping
    }
    rocket.angVel = (rocket.angVel || 0) + angAcc * dt;
    const maxRate = 1.6; // rad/s — nobody should spin faster than this
    rocket.angVel = Math.max(-maxRate, Math.min(maxRate, rocket.angVel));
    // Weathervane: fins pull the nose into the relative airflow at high q.
    // Stable orientation is nose-ALONG the velocity vector (arrow-like); the
    // difference must be wrapped to ±π *after* dropping the old +π offset or
    // the error lands on the wrong side and pitches the vehicle over.
    if (q > 2000 && relSpeed > 30) {
      const airAng = Math.atan2(rvx0, rvy0); // direction of motion
      let diff = airAng - rocket.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      // Restoring gain (×6) pulls the nose back to prograde quickly after a
      // manoeuvre; capped by the SAS damping above so it cannot overshoot.
      // A strong passive weathervane used to cancel nearly all commanded pitch
      // during Max-Q, delaying horizontal velocity until the air was gone. Keep
      // it stabilizing, but let the automatic guidance maintain a small AoA.
      const weathervaneGain = rocket.autoGuidance ? 1.5 : 6;
      rocket.angVel += diff * Math.min(0.6, q / 60000) * dt * weathervaneGain;
    }
    rocket.angle += rocket.angVel * dt;
  }

  // If landed and no thrust, clamp to the surface — don't let gravity pull the
  // rocket into the ground between integration steps.
  if (rocket.landed && (rocket.spool || 0) <= 0.01) {
    // Keep the rocket co-moving with the planet, but allow upward motion
    rocket.velocity.x = primary.velocity.x;
    if (rocket.velocity.y < primary.velocity.y) {
      rocket.velocity.y = primary.velocity.y;
    }
    // Still run collision to keep position on the surface as the planet moves.
    const stillInContact = surfaceCollision(rocket, primary);
    if (!stillInContact) {
      rocket.landed = false;
    }
  } else {
    rocket.velocity.x += ax * dt;
    rocket.velocity.y += ay * dt;
    rocket.position.x += rocket.velocity.x * dt;
    rocket.position.y += rocket.velocity.y * dt;

    // Impact is judged against the *surface*, not against the solar system.
    const relX = rocket.velocity.x - primary.velocity.x;
    const relY = rocket.velocity.y - primary.velocity.y;

    const hit = surfaceCollision(rocket, primary);
    if (hit) {
      // Use the surface-normal closing speed for the crash check, not the
      // total relative velocity (sliding sideways is not a crash).
      // Only consider inward velocity (negative) for crash detection.
      const dx = rocket.position.x - primary.position.x;
      const dy = rocket.position.y - primary.position.y;
      const dist = Math.hypot(dx, dy);
      const nx = dx / dist, ny = dy / dist;
      // Surface-normal velocity in the primary body's frame. `inward` must
      // be computed here (it is not provided by surfaceCollision).
      const inward = relX * nx + relY * ny;
      const normalSpeed = Math.abs(inward);
      if (inward < 0 && normalSpeed > CRASH_SPEED) {
        rocket.crashed = true;
        rocket.landed = false;
        rocket.throttle = 0;
        rocket.velocity.x = primary.velocity.x;
        rocket.velocity.y = primary.velocity.y;
      } else if (inward >= 0) {
        // Moving outward or stationary - not a crash
        rocket.landed = true;
        // Zero relative velocity so the rocket sits still on the surface.
        rocket.velocity.x = primary.velocity.x;
        rocket.velocity.y = primary.velocity.y;
      } else {
        // Moving inward but slow enough - soft landing
        rocket.landed = true;
        // Zero relative velocity so the rocket sits still on the surface.
        rocket.velocity.x = primary.velocity.x;
        rocket.velocity.y = primary.velocity.y;
      }
    } else {
      rocket.landed = false;
      rocket.hasFlown = true;
      if (alt > 5 && !(rocket.flightEvents || []).some(e => e.type === 'LIFTOFF')) {
        rocket.flightPhase = 'POWERED_ASCENT';
        rocket.flightEvents = rocket.flightEvents || [];
        rocket.flightEvents.push({type:'LIFTOFF', time:rocket.flightElapsed, altitude:alt});
      }
    }
  }

  if (rocket._engineWasProducing && rocket.actualThrust <= 0.005 && rocket.throttle <= 0.005 &&
      (rocket.spool || 0) <= 0.01 && !(rocket.flightEvents || []).some(e => e.type === 'ENGINE_CUTOFF' && e.stageIndex === rocket.stageIndex)) {
    rocket.flightEvents = rocket.flightEvents || [];
    rocket.flightEvents.push({type:'ENGINE_CUTOFF', time:rocket.flightElapsed, altitude:primary.altitude(rocket.position), reason:'COMMAND_OR_THRUST_TAILOFF', stageIndex:rocket.stageIndex});
    rocket.flightPhase = 'ENGINE_CUTOFF';
  }
  rocket._engineWasProducing = rocket.actualThrust > 0.005;
  rocket.acceleration = {x: ax, y: ay};
  // G-force for HUD/FX: net acceleration felt (thrust+drag), in g's.
  {
    const gx = ax - g.x, gy = ay - g.y;
    rocket.gForce = Math.hypot(gx, gy) / 9.80665;
  }
  rocket.body = primary;
  rocket.primaryBody = primary;
}

/** The body whose gravity dominates where the vehicle is right now. */
export function findPrimaryBody(rocket, bodies) {
  let best = null;
  let bestPull = -1;
  for (const b of bodies) {
    if (b.id === 'sun') continue;
    const d = Math.hypot(rocket.position.x - b.position.x, rocket.position.y - b.position.y);
    const pull = b.mu / Math.max(d * d, 1);
    if (pull > bestPull) {
      bestPull = pull;
      best = b;
    }
  }
  return best || bodies[0];
}

/** Instant impulse along the current velocity vector (the map maneuver node). */
export function applyDeltaV(rocket, deltaV) {
  const speed = Math.hypot(rocket.velocity.x, rocket.velocity.y);
  if (!speed) {
    rocket.velocity.y = deltaV;
    return;
  }
  rocket.velocity.x += (rocket.velocity.x / speed) * deltaV;
  rocket.velocity.y += (rocket.velocity.y / speed) * deltaV;
}

/** Hohmann-style estimate for the transfer the map shows next to a body. */
export function transferDeltaV(r1, r2, mu) {
  if (!(r1 > 0) || !(r2 > 0) || mu <= 0) return null;
  const v1 = Math.sqrt(mu / r1);
  const v2 = Math.sqrt(mu / r2);
  const at = (r1 + r2) / 2;
  const burn1 = Math.abs(v1 * (Math.sqrt(2 * r2 / at) - 1));
  const burn2 = Math.abs(v2 * (1 - Math.sqrt(2 * r1 / at)));
  return {departure: burn1, arrival: burn2, total: burn1 + burn2, time: Math.PI * Math.sqrt((at ** 3) / (8 * mu))};
}