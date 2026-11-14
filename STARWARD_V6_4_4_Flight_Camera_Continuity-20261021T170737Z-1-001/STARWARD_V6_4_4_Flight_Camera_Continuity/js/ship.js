/* =========================================================================
   ship.js — the player craft: flight model and propellant.

   The flight model is deliberately Newtonian. There is no "steering" that
   overrides velocity; every input either applies a force or a torque, and
   the integrator decides what happens next.
   ========================================================================= */
(function (global) {
  'use strict';

  const { Vec3, Quat, Util } = global.Math3;
  const P = global.Physics;
  const clamp = Util.clamp;

  /* Vehicle specification (SI units) */
  const SPEC = {
    dryMass: 3200,             // kg, structure + payload
    propMass: 1800,            // kg, usable propellant
    isp: 345,                  // s, vacuum specific impulse
    g0: 9.80665,               // m/s^2, standard gravity
    mainThrust: 46000,         // N, main engine
    rcsThrust: 9000,           // N, vernier / translational thrusters
    rcsTorque: 42000,          // N*m, max control torque
    maxAngVel: 0.9,            // rad/s, safety limiter
    collisionRadius: 22        // m, bounding sphere
  };
  SPEC.exhaustVel = SPEC.isp * SPEC.g0;

  function Ship(pos, vel, vehicle) {
    const spec = Object.assign({}, SPEC, vehicle || {});
    if (vehicle && vehicle.stages) {
      spec.stages = vehicle.stages.map(function (stage) {
        return Object.assign({}, stage);
      });
    } else {
      spec.stages = [{
        dryMass: spec.dryMass,
        propMass: spec.propMass,
        mainThrust: spec.mainThrust,
        isp: spec.isp,
        engineName: 'Service module'
      }];
    }
    this.spec = spec;
    this.SPEC = spec;
    this.stages = spec.stages;
    this.stageIndex = 0;
    this.stagePending = false;
    this.stageDryMass = this.stages[0].dryMass;
    this.propMass = this.stages[0].propMass;
    this.fairingMass = Math.max(0, spec.fairingMass || 0);
    this.maxPropMass = this.stages.reduce(function (sum, stage) {
      return sum + stage.propMass;
    }, 0);

    const body = new P.RigidBody({
      pos: pos || Vec3.create(),
      vel: vel || Vec3.create(),
      mass: spec.dryMass + this.maxPropMass,
      inertia: [spec.dryMass * 0.35, spec.dryMass * 0.5, spec.dryMass * 0.4],
      radius: spec.collisionRadius,
      restitution: 0.25,
      name: spec.name || 'Kestrel-1'
    });

    this.body = body;
    this.body.mass = this.mass;
    this.body.invMass = this.body.mass > 0 ? 1 / this.body.mass : 0;

    // Control inputs, all in [-1, 1]
    this.throttle = 0;
    this.afterburner = false;
    this.pitchCmd = 0;
    this.yawCmd = 0;
    this.rollCmd = 0;

    // Assist modes (translational, not rotational)
    this.assistPrograde = false;
    this.assistRetrograde = false;
    this.assistMatch = false;     // null relative velocity to target
    this.assistStop = false;      // full stop

    this.thrustNow = 0;
    this.burning = false;
    this.dvUsed = 0;
    this.assisting = false;

    // Point the nose along the velocity vector at spawn, with the ship's "up"
    // toward the local zenith (radially out of the primary).
    //
    // The up reference must NOT be a fixed world axis. This ship's orbit lies
    // in the XY plane, so at spawn the velocity is close to +Y; asking for
    // up = +Y makes the look-rotation basis degenerate (forward parallel to
    // up), and the degenerate-case fallback then picks an arbitrary axis. The
    // ship ends up rolled ~180 deg, which turns the prograde chase view
    // upside down and makes the predicted trajectory appear as a vertical
    // spike instead of a curve. The local zenith is the physically meaningful
    // choice for an orbiting craft and is never parallel to the velocity in a
    // non-radial orbit.
    const requestedForward = spec.initialForward;
    const fwd = requestedForward
      ? Vec3.norm(requestedForward)
      : (Vec3.len(vel) > 1 ? Vec3.norm(vel) : Vec3.create(1, 0, 0));
    const radial = Vec3.norm(body.pos);
    // If the orbit is degenerate (radial velocity), fall back to any axis that
    // is not parallel to the nose.
    let upRef = radial;
    if (Vec3.lenSq(Vec3.cross(fwd, upRef)) < 1e-8) {
      upRef = Math.abs(fwd.z) < 0.9 ? Vec3.create(0, 0, 1) : Vec3.create(0, 1, 0);
    }
    this.body.quat = Quat.lookRotation(fwd, upRef);
  }

  Ship.prototype = {
    SPEC,

    get mass() { return this.spec.dryMass + this.remainingPropellant(); },
    get fuelFraction() { return this.remainingPropellant() / this.maxPropMass; },

    remainingPropellant() {
      let mass = this.propMass;
      for (let i = this.stageIndex + 1; i < this.stages.length; i++) {
        mass += this.stages[i].propMass;
      }
      return mass;
    },

    /**
     * Remaining delta-v from the rocket equation: dv = Isp*g0*ln(m0/m1),
     * where m0 is the current total mass and m1 is the dry mass the craft
     * will be reduced to by burning everything.
     *
     * This is the real budget the player is spending, and it shrinks as
     * propellant is consumed, exactly as in a real vehicle.
     */
    deltaVRemaining() {
      let dryMass = this.spec.dryMass;
      let fuelAhead = this.remainingPropellant();
      let dv = 0;
      for (let i = this.stageIndex; i < this.stages.length; i++) {
        const stage = this.stages[i];
        const fuel = i === this.stageIndex ? this.propMass : stage.propMass;
        const exhaustVel = stage.isp * this.spec.g0;
        if (fuel > 0 && dryMass > 0) {
          dv += exhaustVel * Math.log((dryMass + fuelAhead) /
            (dryMass + fuelAhead - fuel));
        }
        fuelAhead -= fuel;
        dryMass -= stage.dryMass;
      }
      return dv;
    },

    forward() { return this.body.forward(); },
    up() { return this.body.up(); },
    right() { return this.body.right(); },
    speed() { return Vec3.len(this.body.vel); },

    /** True while any thruster (main, RCS or assist) is consuming propellant. */
    anyAssist() {
      return this.assistPrograde || this.assistRetrograde ||
             this.assistMatch || this.assistStop;
    },

    stage() {
      if (!this.stagePending || this.stageIndex + 1 >= this.stages.length) return false;
      this.spec.dryMass = Math.max(1, this.spec.dryMass - this.stageDryMass);
      this.stageIndex++;
      const next = this.stages[this.stageIndex];
      this.stageDryMass = next.dryMass;
      this.propMass = next.propMass;
      this.spec.mainThrust = next.mainThrust;
      this.spec.isp = next.isp;
      this.spec.exhaustVel = next.isp * this.spec.g0;
      this.stagePending = false;
      this.body.inertia.x = this.spec.dryMass * 0.35;
      this.body.inertia.y = this.spec.dryMass * 0.5;
      this.body.inertia.z = this.spec.dryMass * 0.4;
      this.body.invInertia.x = 1 / this.body.inertia.x;
      this.body.invInertia.y = 1 / this.body.inertia.y;
      this.body.invInertia.z = 1 / this.body.inertia.z;
      this.body.mass = this.mass;
      this.body.invMass = 1 / this.body.mass;
      return true;
    },

    jettisonFairing() {
      if (this.fairingMass <= 0) return false;
      const payloadStage = this.stages[this.stages.length - 1];
      payloadStage.dryMass = Math.max(0, payloadStage.dryMass - this.fairingMass);
      this.spec.dryMass = Math.max(1, this.spec.dryMass - this.fairingMass);
      if (this.stageIndex === this.stages.length - 1) {
        this.stageDryMass = payloadStage.dryMass;
      }
      this.fairingMass = 0;
      this.spec.fairing = false;
      this.spec.dragCoefficient = this.spec.unfairedDragCoefficient || 0.55;
      this.body.inertia.x = this.spec.dryMass * 0.35;
      this.body.inertia.y = this.spec.dryMass * 0.5;
      this.body.inertia.z = this.spec.dryMass * 0.4;
      this.body.invInertia.x = 1 / this.body.inertia.x;
      this.body.invInertia.y = 1 / this.body.inertia.y;
      this.body.invInertia.z = 1 / this.body.inertia.z;
      this.body.mass = this.mass;
      this.body.invMass = 1 / this.body.mass;
      return true;
    },

    /**
     * Apply one control step. `dt` is the fixed physics step.
     * Everything here is a force or a torque; nothing directly edits
     * velocity or position. That is what keeps the flight model honest.
     */
    update: function (dt, target) {
      const body = this.body;
      const spec = this.spec;
      const stage = this.stages[this.stageIndex];

      // Keep the body mass in sync so a = F/m stays correct as fuel burns.
      body.mass = this.mass;
      body.invMass = body.mass > 0 ? 1 / body.mass : 0;
      this.stagePending = this.propMass <= 1e-6 &&
        this.stageIndex + 1 < this.stages.length;

      // --- Work out the total commanded thrust ----------------------
      let commanded = 0;
      if (this.throttle !== 0) {
        commanded += Math.abs(this.throttle) *
          (this.afterburner ? spec.mainThrust * 1.55 : spec.mainThrust);
      }
      if (Math.abs(this.pitchCmd) + Math.abs(this.yawCmd) +
          Math.abs(this.rollCmd) + Vec3.len(body.angVel) > 0.01) {
        commanded += spec.rcsThrust * 0.25;
      }
      this.assisting = this.anyAssist();
      if (this.assisting) commanded += spec.rcsThrust * 0.6;

      // --- Consume propellant --------------------------------------
      let delivered = 0;
      if (this.propMass > 0 && commanded > 0 && !this.stagePending) {
        // mdot = F / ve  (Newton's third law)
        const exhaustVel = stage.isp * spec.g0;
        const mdot = commanded / exhaustVel;
        const used = Math.min(mdot * dt, this.propMass);
        this.propMass -= used;
        delivered = (used / dt) * exhaustVel;   // never exceed available
      }
      this.thrustNow = delivered;
      this.burning = delivered > 0;

      // --- Main engine ---------------------------------------------
      if (this.throttle !== 0 && delivered > 0) {
        // Split the budget: main engine gets what is left after the
        // thrusters and assist burns have drawn their share.
        const share = this.assisting ? 0.5 : 1.0;
        const mag = delivered * this.throttle * share;
        body.addForce(Vec3.mul(this.forward(), mag));
        this.dvUsed += Math.abs(mag / body.mass * dt);
      }

      this.applyAttitude();
      this.applyTranslationalAssist(dt, target);

      // Safety limiter so the ship always stays flyable.
      const w = Vec3.len(body.angVel);
      if (w > spec.maxAngVel) {
      const s = spec.maxAngVel / w;
        body.angVel.x *= s; body.angVel.y *= s; body.angVel.z *= s;
      }
    },
/**
     * Convert pitch/yaw/roll commands into torques in body axes, then rotate
     * into world space. Because this is real torque on a real inertia
     * tensor, the gyroscopic term in the integrator couples pitch, yaw and
     * roll exactly as it does for a real vehicle.
     */
    applyAttitude: function () {
      const body = this.body;
      const spec = this.spec;
      const { pitchCmd, yawCmd, rollCmd } = this;
      const desiredRate = 0.65;
      const response = 5;
      // The rigid-body integrator stores angular velocity and inertia in
      // body axes. Command a rotation rate and actively damp residual spin.
      const t = Vec3.create(
        (pitchCmd * desiredRate - body.angVel.x) * body.inertia.x * response,
        (yawCmd * desiredRate - body.angVel.y) * body.inertia.y * response,
        (-rollCmd * desiredRate - body.angVel.z) * body.inertia.z * response
      );
      t.x = clamp(t.x, -spec.rcsTorque, spec.rcsTorque);
      t.y = clamp(t.y, -spec.rcsTorque, spec.rcsTorque);
      t.z = clamp(t.z, -spec.rcsTorque, spec.rcsTorque);
      body.addTorque(t);
    },

    /**
     * Assist burns are still Newtonian: each computes a required force and
     * applies it, rather than editing velocity directly.
     *
     *  - prograde / retrograde: accelerate along (or against) velocity
     *  - stop:      cancel all velocity
     *  - match:     cancel velocity *relative* to the target
     *
     * The "stop" and "match" controllers are first-order (force = -m*v/tau),
     * so they bleed off velocity over a time constant the way real RCS
     * thrusters do, rather than snapping to zero.
     */
    applyTranslationalAssist: function (dt, target) {
      const body = this.body;
      const F = this.spec.rcsThrust;

      // Clamp a desired force to what the thrusters can actually deliver.
      const limited = (want) => {
        const mag = Vec3.len(want);
        return mag > F ? Vec3.mul(want, F / mag) : want;
      };

      if (this.assistPrograde) {
        const v = Vec3.norm(body.vel);
        if (Vec3.lenSq(v) > 0) body.addForce(Vec3.mul(v, F));
      }
      if (this.assistRetrograde) {
        const v = Vec3.norm(body.vel);
        if (Vec3.lenSq(v) > 0) body.addForce(Vec3.mul(v, -F));
      }
      if (this.assistStop) {
        body.addForce(limited(Vec3.mul(body.vel, -body.mass / 6)));
      }
      if (this.assistMatch && target && target.vel) {
        const rel = Vec3.sub(body.vel, target.vel);
        body.addForce(limited(Vec3.mul(rel, -body.mass / 8)));
      }
    },

    /** Zero all controls (used on pause and on mission reset). */
    neutral: function () {
      this.throttle = 0;
      this.pitchCmd = 0;
      this.yawCmd = 0;
      this.rollCmd = 0;
      this.assistPrograde = false;
      this.assistRetrograde = false;
      this.assistMatch = false;
      this.assistStop = false;
      this.thrustNow = 0;
      this.burning = false;
    }
  };

  /* ------------------------------ Geometry ----------------------------- */
  /**
   * Build the ship mesh in body coordinates: forward is -Z, up is +Y.
   * A wedge fuselage, two canards, and two engine bells.
   */
  Ship.buildMesh = function () {
    const v = [];
    const f = [];
    const push = (x, y, z) => { v.push({ x, y, z }); return v.length - 1; };

    // Fuselage: a hexagonal prism tapering to the nose.
    const nose = push(0, 0, -10);
    const tailC = push(0, 0, 5);
    const ring = [
      push(-2.5, 1.5, 0), push(2.5, 1.5, 0),
      push(3.5, -1, 0), push(-3.5, -1, 0),
      push(-2, -2.5, 0), push(2, -2.5, 0)
    ];

    // Connect the nose to the ring, and the ring to the tail cap.
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      f.push([nose, b, a]);                       // forward cone
      f.push([tailC, a, b]);                      // aft cap
    }

    // Wings (flat quads out to ±X).
    const wA = push(-11, 0.5, 1), wB = push(-11, 0.5, -3);
    const wC = push(11, 0.5, 1), wD = push(11, 0.5, -3);
    const wRootA = push(-2.5, 0.5, 1), wRootB = push(-2.5, 0.5, -3);
    const wRootC = push(2.5, 0.5, 1), wRootD = push(2.5, 0.5, -3);
    f.push([wRootA, wA, wB], [wRootA, wB, wRootB]);
    f.push([wRootC, wD, wC], [wRootC, wRootD, wD]);

    // Vertical stabiliser.
    const sA = push(0, 6, 4.5), sB = push(0, 6, 0.5);
    f.push([push(0, 1, 4.5), sA, sB], [push(0, 1, 4.5), sB, push(0, 1, 0.5)]);

    // Engine bells: small cones at the tail.
    const bellL = push(-2, 0.5, 7), bellL2 = push(-1, 0.2, 7);
    const bellR = push(2, 0.5, 7), bellR2 = push(1, 0.2, 7);
    f.push([ring[0], ring[1], bellR], [bellR, ring[1], bellR2]);
    f.push([ring[3], bellL, ring[0]], [bellL, bellL2, ring[0]]);

    return { verts: v, faces: f };
  };

  /** Procedural launch vehicle mesh: fairing, stage tanks, boosters and bells. */
  Ship.buildRocketMesh = function (spec) {
    const verts = [];
    const faces = [];
    const push = (x, y, z) => {
      verts.push({ x: x, y: y, z: z });
      return verts.length - 1;
    };
    const ring = (z, radius, xOffset) => {
      const ids = [];
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI * 2 / 10;
        ids.push(push((xOffset || 0) + Math.cos(a) * radius,
          Math.sin(a) * radius, z));
      }
      return ids;
    };
    const connect = (a, b) => {
      for (let i = 0; i < a.length; i++) {
        const next = (i + 1) % a.length;
        faces.push([a[i], a[next], b[next], b[i]]);
      }
    };

    const hasFairing = spec.fairing !== false;
    const nose = hasFairing ? push(0, 0, -23) : -1;
    const fairingTop = hasFairing ? ring(-18, 0.5, 0) : null;
    const fairingBase = hasFairing ? ring(-10, 3.2, 0) : null;
    const upperTankBase = ring(-7, 3.8, 0);
    const upperTankEnd = ring(2, 3.8, 0);
    const lowerTankBase = ring(5, 4.5, 0);
    const lowerTankEnd = ring(18, 4.5, 0);
    if (hasFairing) {
      connect(fairingTop, fairingBase);
      connect(fairingBase, upperTankBase);
    }
    connect(upperTankBase, upperTankEnd);
    connect(upperTankEnd, lowerTankBase);
    connect(lowerTankBase, lowerTankEnd);
    if (hasFairing) {
      for (let i = 0; i < fairingTop.length; i++) {
        faces.push([nose, fairingTop[i], fairingTop[(i + 1) % fairingTop.length]]);
      }
    }

    const stageCount = Math.max(1, spec.stages ? spec.stages.length : 1);
    for (let stage = 1; stage < stageCount; stage++) {
      const z = 2 + stage * (16 / stageCount);
      const band = ring(z, 4.7, 0);
      const adjacent = ring(z + 0.8, 4.7, 0);
      connect(band, adjacent);
    }

    const boosterCount = spec.boosters || 0;
    const visibleBoosters = boosterCount >= 4 ? 4 : (boosterCount >= 2 ? 2 : 0);
    for (let i = 0; i < visibleBoosters; i++) {
      const x = visibleBoosters === 2
        ? (i === 0 ? -6.1 : 6.1)
        : (i < 2 ? -6.1 : 6.1);
      const zStart = visibleBoosters === 4 && i >= 2 ? 1.5 : 3;
      const top = ring(zStart, 0.85, x);
      const mid = ring(12, 0.85, x);
      const bottom = ring(19, 0.72, x);
      connect(top, mid);
      connect(mid, bottom);
    }

    const bellCount = Math.min(Math.max(1, spec.engineCount || 1), 4);
    const engineRadius = 1.05;
    for (let i = 0; i < bellCount; i++) {
      const x = (i - (bellCount - 1) / 2) * 2.35;
      const top = ring(18, engineRadius, x);
      const bottom = ring(22, engineRadius * 1.45, x);
      connect(top, bottom);
    }

    return { verts: verts, faces: faces };
  };

  global.Ship = Ship;
})(window);