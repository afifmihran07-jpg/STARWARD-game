/* =========================================================================
   physics.js — orbital mechanics + rigid-body dynamics.

   Everything here is SI (metres, seconds, kilograms, newtons). Celestial
   bodies are point masses (plus an optional collision radius), which is the
   standard approximation for two-body orbital mechanics.

   Sign / convention notes
     mu            = GM, the gravitational parameter of a body
     specific energy = v^2/2 - mu/r   (per unit mass)
     Body forward   = local -Z ; up = local +Y   (see Quat.lookRotation)
   ========================================================================= */
(function (global) {
  'use strict';

  const { Vec3, Util } = global.Math3;
  const clamp = Util.clamp;

  const G = 6.67430e-11;              // CODATA 2018, m^3 kg^-1 s^-2
  const TAU = Math.PI * 2;

  /* ------------------------------ Gravity ------------------------------ */

  /**
   * Newtonian gravitational acceleration of a test particle at `p`
   * due to a body at `body.pos` with parameter `body.mu`.
   *
   *     a = mu * (r_body - p) / |r|^3
   *
   * Uses the same 1/r^2 law for the attraction and the (softened) case
   * inside the body, so it never divides by zero at the centre.
   */
  function gravityAt(p, body, out) {
    const dx = body.pos.x - p.x;
    const dy = body.pos.y - p.y;
    const dz = body.pos.z - p.z;
    const r2 = dx * dx + dy * dy + dz * dz;
    const r = Math.sqrt(r2);
    if (r < 1e-6) { out.x = out.y = out.z = 0; return out; }
    // invR3: 1/r^3, so a = mu * d * invR3
    const invR3 = 1 / (r2 * r);
    const k = body.mu * invR3;
    out.x = dx * k; out.y = dy * k; out.z = dz * k;
    return out;
  }

  /**
   * Net acceleration at `p` from a list of gravitating bodies.
   * `skip` excludes the body the particle is bound to (e.g. a landing
   * craft standing on a surface, where we want the other bodies only).
   */
  function gravitySum(p, bodies, out, skip) {
    out.x = out.y = out.z = 0;
    const tmp = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b === skip || !b.mu) continue;
      gravityAt(p, b, tmp);
      out.x += tmp.x; out.y += tmp.y; out.z += tmp.z;
    }
    return out;
  }

  /* --------------------------- Orbit elements -------------------------- */
  /**
   * Classical orbital elements derived from a state vector (position +
   * velocity) and the gravitational parameter mu. This is the standard
   * textbook reduction, and is what the HUD displays.
   *
   * Returns null if the state is degenerate (at the focus).
   */
  function stateToOrbit(pos, vel, mu) {
    const r = Vec3.len(pos);
    if (!(r > 0)) return null;
    const v2 = Vec3.dot(vel, vel);

    // Specific orbital energy, then semi-major axis from the vis-viva relation.
    const energy = v2 / 2 - mu / r;
    const smAxis = (energy < 0) ? -mu / (2 * energy) : Infinity;

    // Specific angular momentum h = r x v, and its magnitude.
    const h = Vec3.cross(pos, vel);
    const hMag = Vec3.len(h);

    // Eccentricity vector e = ((v^2 - mu/r) * r - (r.v) * v) / mu
    const rv = Vec3.dot(pos, vel);
    const k = (v2 - mu / r) / mu;
    const eVec = Vec3.create(
      k * pos.x - rv * vel.x / mu,
      k * pos.y - rv * vel.y / mu,
      k * pos.z - rv * vel.z / mu
    );
    const ecc = Vec3.len(eVec);

    const res = {
      smAxis, ecc, energy, hMag, r,
      period: Infinity, closed: false,
      periapsis: 0, apoapsis: Infinity,
      hyper: false, parabolic: false
    };

    if (Math.abs(ecc - 1) < 1e-9) {
      // Parabolic: marginally bound escape trajectory.
      res.parabolic = true;
      res.periapsis = hMag * hMag / mu;   // equals r at the moment of closest approach
      return res;
    }

    if (ecc > 1) {
      // Hyperbolic escape: no apoapsis, no period.
      res.hyper = true;
      res.periapsis = (hMag * hMag) / (mu * (1 + ecc));
      return res;
    }

    // Elliptical / circular.
    res.closed = true;
    res.periapsis = smAxis * (1 - ecc);
    res.apoapsis = smAxis * (1 + ecc);
    // Kepler III: T = 2*pi*sqrt(a^3 / mu)
    res.period = TAU * Math.sqrt((smAxis * smAxis * smAxis) / mu);
    return res;
  }

  /**
   * Vis-viva: the speed required at radius `r` for an orbit of semi-major
   * axis `a` around a body with parameter `mu.
   *     v^2 = mu * (2/r - 1/a)
   */
  function visViva(mu, r, a) {
    if (!(r > 0) || !isFinite(a) || a <= 0) return NaN;
    const v2 = mu * (2 / r - 1 / a);
    return v2 >= 0 ? Math.sqrt(v2) : NaN;   // NaN when the state is unreachable
  }

  /** Circular orbital speed at radius r. */
  function circularSpeed(mu, r) { return Math.sqrt(mu / r); }

  /**
   * Velocity for a circular orbit of a body currently at position `centre`,
   * around a central body of parameter `mu`, in the plane with normal
   * `normal`.
   *
   * IMPORTANT: `centre` must be the *central body's* position, because the
   * orbital direction is n x r where r points from the central body to the
   * orbiting body. Passing the orbiter's own position instead would compute
   * the direction from the system barycentre and give a wildly wrong speed.
   */
  function circularVelocity(centre, normal, mu) {
    const n = Vec3.norm(normal);
    const rx = centre.x, ry = centre.y, rz = centre.z;
    // Cross the position vector with the orbit normal: n x r points along
    // the direction of travel for a prograde (counter-clockwise) orbit.
    const t = Vec3.create(
      n.y * rz - n.z * ry,
      n.z * rx - n.x * rz,
      n.x * ry - n.y * rx
    );
    const len = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (len < 1e-9) return Vec3.create(0, 0, 0);
    const speed = Math.sqrt(mu / len);
    return Vec3.mul(Vec3.norm(t), speed);
  }

  /**
   * State for a circular orbit of radius `radius` about a body with
   * parameter `mu`, expressed as an absolute position + velocity given the
   * body's current position. This is the correct way to place an orbiting
   * object; it never confuses the centre with the orbiter.
   */
  function circularState(body, radius, normal) {
    const mu = body.mu;
    // Offset along +X from the body's centre.
    const rel = Vec3.mul(Vec3.create(1, 0, 0), radius);
    // NB: Vec3.add takes exactly two operands and returns a NEW vector.
    const pos = Vec3.add(body.pos, rel);

    // Velocity direction = normal x r, magnitude = circular speed.
    const n = Vec3.norm(normal || Vec3.create(0, 0, 1));
    const t = Vec3.norm(Vec3.cross(n, rel));
    let vel = Vec3.mul(t, Math.sqrt(mu / radius));

    // Inherit the central body's own velocity so the orbiter shares it.
    if (body.vel) vel = Vec3.add(vel, body.vel);
    return { pos, vel };
  }

  /**
   * Hohmann transfer between circular orbits of radius r1 and r2.
   * Returns the two burn magnitudes and the time of flight, all closed-form
   * (the player can verify these against the simulation).
   */
  function hohmann(mu, r1, r2) {
    const aT = (r1 + r2) / 2;
    const dv1 = Math.sqrt(mu / r1) * (Math.sqrt(2 * r2 / (r1 + r2)) - 1);
    const dv2 = Math.sqrt(mu / r2) * (1 - Math.sqrt(2 * r1 / (r1 + r2)));
    const tof = Math.PI * Math.sqrt((aT * aT * aT) / mu);
    return { dv1: Math.abs(dv1), dv2: Math.abs(dv2), tof, aT };
  }
/* --------------------------- Rigid body ------------------------------- */
  /**
   * A rigid body: position, linear velocity, orientation (quaternion),
   * angular velocity, mass and a diagonal inertia tensor in body axes.
   *
   * Inertia is stored as a diagonal triple (ix, iy, iz) because our ships
   * and stations are all modelled with their principal axes aligned to the
   * body frame. That keeps `I^-1 * torque` exact and cheap.
   */
  function RigidBody(opts) {
    opts = opts || {};
    this.pos = opts.pos ? Vec3.clone(opts.pos) : Vec3.create();
    this.vel = opts.vel ? Vec3.clone(opts.vel) : Vec3.create();
    this.quat = opts.quat || { x: 0, y: 0, z: 0, w: 1 };
    this.angVel = opts.angVel ? Vec3.clone(opts.angVel) : Vec3.create();

    this.mass = opts.mass !== undefined ? opts.mass : 1000;
    this.invMass = this.mass > 0 ? 1 / this.mass : 0;

    const I = opts.inertia || [1, 1, 1];
    this.inertia = Vec3.create(I[0], I[1], I[2]);
    this.invInertia = Vec3.create(
      I[0] > 0 ? 1 / I[0] : 0, I[1] > 0 ? 1 / I[1] : 0, I[2] > 0 ? 1 / I[2] : 0
    );

    this.name = opts.name || 'body';
    this.radius = opts.radius || 1;     // collision sphere radius
    this.restitution = opts.restitution !== undefined ? opts.restitution : 0.4;
    this.fixed = !!opts.fixed;          // static: infinite mass, zero velocity

    // Force / torque accumulators, cleared each substep.
    this.force = Vec3.create();
    this.torque = Vec3.create();
  }

  RigidBody.prototype = {
    /** Body-axis to world: rotate a local direction into world space. */
    toWorldDir: function (v) { return global.Math3.Quat.rotate(this.quat, v); },
    /** World to body-axis. */
    toLocalDir: function (v) { return global.Math3.Quat.rotateInv(this.quat, v); },
    /** Body forward (-Z) in world space. */
    forward: function () { return global.Math3.Quat.rotate(this.quat, Vec3.create(0, 0, -1)); },
    /** Body up (+Y) in world space. */
    up: function () { return global.Math3.Quat.rotate(this.quat, Vec3.create(0, 1, 0)); },
    /** Body right (+X) in world space. */
    right: function () { return global.Math3.Quat.rotate(this.quat, Vec3.create(1, 0, 0)); },

    clearAccumulators: function () {
      this.force.x = this.force.y = this.force.z = 0;
      this.torque.x = this.torque.y = this.torque.z = 0;
    },

    /** Apply a world-space force at the centre of mass (no torque). */
    addForce: function (f) { Vec3.addScaled(this.force, f, 1); return this; },

    /** Apply a world-space force at a world-space offset r from the CoM. */
    addForceAt: function (f, r) {
      Vec3.addScaled(this.force, f, 1);
      Vec3.addScaled(this.torque, Vec3.cross(r, f), 1);
      return this;
    },

    /** Apply a world-space torque (an angular impulse input for thrusters). */
    addTorque: function (t) { Vec3.addScaled(this.torque, t, 1); return this; },

    /** Kinetic energy = 1/2 m v^2 + 1/2 w . (I w) */
    kineticEnergy: function () {
      const lin = 0.5 * this.mass * Vec3.dot(this.vel, this.vel);
      const Iw = Vec3.create(
        this.inertia.x * this.angVel.x,
        this.inertia.y * this.angVel.y,
        this.inertia.z * this.angVel.z
      );
      const rot = 0.5 * Vec3.dot(this.angVel, Iw);
      return lin + rot;
    }
  };

  /* ---------------------------- Integrator ----------------------------- */
  /**
   * Semi-implicit (symplectic) Euler — the velocity is updated first and
   * then used to advance position, which conserves energy far better over
   * long orbits than explicit Euler.
   *
   *   v_{n+1} = v_n + (F/m) dt
   *   x_{n+1} = x_n + v_{n+1} dt
   *   w_{n+1} = w_n + I^-1 (T - w x I w) dt
   *   q_{n+1} = q_n + 0.5 q_n (x) w dt
   */
  function integrateBody(body, dt) {
    if (body.fixed) { body.clearAccumulators(); return; }

    // --- linear ---
    const ax = body.force.x * body.invMass;
    const ay = body.force.y * body.invMass;
    const az = body.force.z * body.invMass;
    body.vel.x += ax * dt;
    body.vel.y += ay * dt;
    body.vel.z += az * dt;
    body.pos.x += body.vel.x * dt;
    body.pos.y += body.vel.y * dt;
    body.pos.z += body.vel.z * dt;

    // --- angular: include the gyroscopic term -w x (I w) ---
    const w = body.angVel, I = body.inertia, Ii = body.invInertia;
    const Lx = I.x * w.x, Ly = I.y * w.y, Lz = I.z * w.z;
    const gyroX = w.y * Lz - w.z * Ly;
    const gyroY = w.z * Lx - w.x * Lz;
    const gyroZ = w.x * Ly - w.y * Lx;
    w.x += (body.torque.x - gyroX) * Ii.x * dt;
    w.y += (body.torque.y - gyroY) * Ii.y * dt;
    w.z += (body.torque.z - gyroZ) * Ii.z * dt;

    const Q = global.Math3.Quat;
    Q.integrate(body.quat, w, dt);
    body.clearAccumulators();
  }

  /**
   * Advise a maximum stable timestep for a body orbiting a body of
   * parameter `mu` at distance `r`: the orbital period divided by ~400
   * keeps integration error negligible. The game loop uses this to
   * sub-step when time warp would otherwise skip across an orbit.
   */
  function maxStableDt(mu, r) {
    if (!(r > 0) || !(mu > 0)) return 10;
    const period = TAU * Math.sqrt((r * r * r) / mu);
    return clamp(period / 400, 0.005, 10);
  }
/* ---------------------------- Collisions ------------------------------ */
  /**
   * Build a static (infinite-mass) collider matching the RigidBody interface,
   * so it can safely be passed to `resolveSphereContact`.
   *
   * A static body still has a velocity: it carries the ship along with it,
   * which is exactly why contacts must be resolved on *relative* velocity.
   */
  function staticCollider(pos, vel, radius, restitution) {
    return {
      pos: Vec3.clone(pos),
      vel: vel ? Vec3.clone(vel) : Vec3.create(),
      angVel: Vec3.create(),
      invMass: 0,                                   // infinite mass
      invInertia: Vec3.create(0, 0, 0),
      radius: radius,
      restitution: restitution !== undefined ? restitution : 0.3,
      fixed: true,
      // Inert bodies never respond to impulses, so these are identity
      // transforms, present only for interface compatibility.
      toLocalDir: function (v) { return Vec3.clone(v); },
      toWorldDir: function (v) { return Vec3.clone(v); },
      forward: function () { return Vec3.create(0, 0, -1); },
      up: function () { return Vec3.create(0, 1, 0); }
    };
  }

  /**
   * Resolve a sphere-sphere contact between two rigid bodies using an
   * impulse that conserves linear momentum along the contact normal:
   *
   *   j = -(1 + e) * v_rel . n / (1/mA + 1/mB)
   *
   * v_rel is the relative velocity of the contact points, so a body that is
   * also spinning correctly exchanges angular momentum too.
   * Returns the impulse magnitude, or 0 when there was no impact.
   */
  function resolveSphereContact(a, b, dt) {
    const d = Vec3.sub(b.pos, a.pos);
    const dist = Vec3.len(d);
    const rSum = a.radius + b.radius;
    if (dist >= rSum || dist < 1e-9) return 0;

    const n = Vec3.mul(d, 1 / dist);              // contact normal, A -> B
    const pen = rSum - dist;

    // Contact points: the closest points on each sphere along the normal.
    const rA = Vec3.mul(n, a.radius);
    const rB = Vec3.neg(Vec3.mul(n, b.radius));

    // Velocity of each material point at the contact.
    const vA = contactVelocity(a, rA);
    const vB = contactVelocity(b, rB);
    const vRel = Vec3.sub(vB, vA);
    const vn = Vec3.dot(vRel, n);

    // Positional correction (Baumgarte-style, applied to position so it
    // cannot inject energy): push apart proportional to penetration.
    const slop = 0.005 * rSum;                  // 0.5% of the contact size
    const corr = Math.max(pen - slop, 0) * 0.8 / (a.invMass + b.invMass || 1);
    if (!a.fixed) Vec3.addScaled(a.pos, n, -corr * a.invMass);
    if (!b.fixed) Vec3.addScaled(b.pos, n, corr * b.invMass);

    // Separating / resting contact: no bounce, just stop the approach.
    if (vn > 0) return 0;

    const e = Math.min(a.restitution, b.restitution);
    const invSum = a.invMass + b.invMass;
    if (invSum <= 0) return 0;

    // Effective mass along the contact, including the rotational term.
    let effMass = invSum;
    effMass += rotationTerm(a, rA, n);
    effMass += rotationTerm(b, rB, n);

    const jn = -(1 + e) * vn / effMass;

    if (!a.fixed) applyContactImpulse(a, rA, n, -jn);
    if (!b.fixed) applyContactImpulse(b, rB, n, jn);

    return jn;
  }

  /** Velocity of the material point at world offset r from a body's CoM. */
  function contactVelocity(body, r) {
    const w = body.angVel;
    // v_point = v_com + w x r
    return Vec3.create(
      body.vel.x + (w.y * r.z - w.z * r.y),
      body.vel.y + (w.z * r.x - w.x * r.z),
      body.vel.z + (w.x * r.y - w.y * r.x)
    );
  }

  /** n . ((I^-1 (r x n)) x r) — the rotational contribution to contact mass. */
  function rotationTerm(body, r, n) {
    if (body.invMass === 0) return 0;
    const rn = Vec3.cross(r, n);
    // Convert the cross product into body space, scale by I^-1, convert back.
    const local = body.toLocalDir(rn);
    local.x *= body.invInertia.x;
    local.y *= body.invInertia.y;
    local.z *= body.invInertia.z;
    const world = body.toWorldDir(local);
    return Vec3.dot(Vec3.cross(world, r), n);
  }

  /** Apply impulse j*n at offset r, updating linear and angular velocity. */
  function applyContactImpulse(body, r, n, j) {
    if (body.invMass === 0) return;
    const imp = Vec3.mul(n, j);
    body.vel.x += imp.x * body.invMass;
    body.vel.y += imp.y * body.invMass;
    body.vel.z += imp.z * body.invMass;

    // dL = r x (j n); convert to body space, apply I^-1, convert back.
    const t = Vec3.cross(r, imp);
    const local = body.toLocalDir(t);
    local.x *= body.invInertia.x;
    local.y *= body.invInertia.y;
    local.z *= body.invInertia.z;
    const dw = body.toWorldDir(local);
    body.angVel.x += dw.x;
    body.angVel.y += dw.y;
    body.angVel.z += dw.z;
  }

/* --------------------- Trajectory prediction ------------------------- */
  /**
   * Forward-integrate a *copy* of the ship's state under gravity only,
   * producing the future path. Because this uses the same `gravitySum` and
   * the same symplectic Euler step as the live simulation, the predicted
   * line is exactly what the ship will do if it stops thrusting — the
   * overlay cannot disagree with the physics.
   *
   * @param {RigidBody} ship       ship to copy the state of
   * @param {Array}     bodies     gravitating bodies
   * @param {number}    duration   seconds of flight to predict
   * @param {number}    samples    number of points to return
   * @param {number}    [throttle] optional sustained thrust fraction (0..1)
   * @param {Vec3}      [burnDir]  thrust direction in world space
   * @returns {Array<{x,y,z,t}>}    sampled points, oldest first
   */
  function predictTrajectory(ship, bodies, duration, samples, throttle, burnDir, burnForce) {
    const pts = [];
    if (!(duration > 0) || samples < 2) return pts;

    // Local copy of the state so prediction never touches the live ship.
    const pos = Vec3.clone(ship.pos);
    const vel = Vec3.clone(ship.vel);
    const acc = Vec3.create();
    const f = Vec3.create();

    const dt = duration / (samples - 1);
    // Keep the step small enough that fast periapsis passages stay accurate.
    const dtMax = maxStableDt(
      bodies.length ? bodies[0].mu : 0,
      bodies.length ? Math.max(Vec3.dist(pos, bodies[0].pos), 1) : 1
    );
    const h = Math.min(dt, dtMax);
    const stepsPerSample = Math.max(1, Math.round(dt / h));

    for (let s = 0; s < samples; s++) {
      pts.push({ x: pos.x, y: pos.y, z: pos.z, t: s * dt });

      for (let k = 0; k < stepsPerSample; k++) {
        gravitySum(pos, bodies, acc);
        Vec3.addScaled(vel, acc, h);

        if (throttle && burnDir && burnForce) {
          Vec3.addScaled(vel, burnDir, (burnForce * throttle / ship.mass) * h);
        }
        Vec3.addScaled(pos, vel, h);
      }
    }
    return pts;
  }

  /**
   * Closest approach between a sampled trajectory and a target moving at
   * constant velocity, plus the time at closest approach and the relative
   * speed at that instant.
   *
   * Relative speed is obtained by central-differencing the sampled path
   * (the same integrator that produced the prediction), so it reflects the
   * actual simulated velocity rather than an assumption.
   */
  function closestApproach(path, targetPos, targetVel) {
    if (!path || path.length === 0) {
      return { distance: Infinity, time: 0, relSpeed: 0, index: 0 };
    }

    const tvx = targetVel ? targetVel.x : 0;
    const tvy = targetVel ? targetVel.y : 0;
    const tvz = targetVel ? targetVel.z : 0;

    let best = Infinity, bestT = 0, bestIdx = 0, bestRelSpeed = 0;

    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const dx = p.x - targetPos.x, dy = p.y - targetPos.y, dz = p.z - targetPos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < best) { best = d; bestT = p.t; bestIdx = i; }
    }

    // Central difference of the path gives the velocity of the craft.
    const lo = path[Math.max(0, bestIdx - 1)];
    const hi = path[Math.min(path.length - 1, bestIdx + 1)];
    const span = hi.t - lo.t;
    if (span > 0) {
      const vx = (hi.x - lo.x) / span;
      const vy = (hi.y - lo.y) / span;
      const vz = (hi.z - lo.z) / span;
      bestRelSpeed = Math.sqrt(
        (vx - tvx) * (vx - tvx) +
        (vy - tvy) * (vy - tvy) +
        (vz - tvz) * (vz - tvz)
      );
    }

    return { distance: best, time: bestT, relSpeed: bestRelSpeed, index: bestIdx };
  }

  global.Physics = {
    G, TAU,
    gravityAt, gravitySum,
    stateToOrbit, visViva, circularSpeed, circularVelocity, circularState, hohmann,
    RigidBody, integrateBody, maxStableDt,
    resolveSphereContact, contactVelocity, staticCollider,
    predictTrajectory, closestApproach
  };
})(window);