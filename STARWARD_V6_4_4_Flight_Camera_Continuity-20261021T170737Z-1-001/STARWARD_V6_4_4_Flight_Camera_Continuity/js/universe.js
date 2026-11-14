/* =========================================================================
   universe.js — the solar system and everything flyable in it.

   Every celestial body uses its real gravitational parameter mu = GM. Values
   are from JPL / IAU reference tables, so orbital velocities, periods and
   escape speeds all come out physically correct for free.
   ========================================================================= */
(function (global) {
  'use strict';

  const { Vec3, Quat } = global.Math3;
  const P = global.Physics;
  const G = P.G;

  /**
   * Build a celestial body from a mass in kg.
   * mu = G*M is precomputed because it is used every frame.
   */
  function celestial(spec) {
    return {
      kind: 'body',
      name: spec.name,
      pos: spec.pos ? Vec3.clone(spec.pos) : Vec3.create(),
      vel: spec.vel ? Vec3.clone(spec.vel) : Vec3.create(),
      mass: spec.mass,                       // kg
      mu: G * spec.mass,                     // m^3/s^2
      radius: spec.radius,                   // m (collision + draw)
      color: spec.color || '#8899aa',
      atmosphere: spec.atmosphere || null,
      atmosphereTop: spec.atmosphereTop || 0,
      sunlit: spec.sunlit !== false,
      // Sidereal rotation rate about the body's own axis (rad/s).
      spin: spec.spin || 0,
      spinAxis: spec.spinAxis ? Vec3.norm(spec.spinAxis) : Vec3.create(0, 1, 0),
      parent: spec.parent || null,
      label: spec.label || spec.name
    };
  }

  /* --------------------------- System definition ----------------------- */
  // Planetary paths use circular two-body approximations at their real
  // mean orbital radii. Moons and the station are kinematic about parents.

  function buildSystem() {
    const bodies = [];
    const byName = {};

    const add = (spec) => {
      const b = celestial(spec);
      bodies.push(b);
      byName[spec.name] = b;
      return b;
    };

    // --- The Sun -------------------------------------------------------
    const sun = add({
      name: 'Sol',
      mass: 1.9885e30,
      radius: 6.9634e8,
      color: '#ffcf5c',
      atmosphere: 'rgba(255,190,80,0.55)',
      glow: true
    });

    // --- Earth ---------------------------------------------------------
    const earth = add({
      name: 'Earth',
      mass: 5.9722e24,
      radius: 6.371e6,
      color: '#3f7fbf',
      atmosphere: 'rgba(120,190,255,0.5)',
      atmosphereTop: 1.016e6,          // exosphere scale height region
      spin: 7.2921159e-5,             // sidereal day: 86164 s
      parent: sun
    });
    {
      const s = P.circularState(sun, 1.495978707e11);
      Vec3.copy(earth.pos, s.pos);
      Vec3.copy(earth.vel, s.vel);
    }

    // --- Luna ----------------------------------------------------------
    // Placed with circularState, which offsets from EARTH's centre and adds
    // Earth's own velocity. (Using the raw position here would compute the
    // orbital direction from the barycentre and produce a wrong speed.)
    const luna = add({
      name: 'Luna',
      mass: 7.342e22,
      radius: 1.7374e6,
      color: '#9a958c',
      parent: earth
    });
    {
      const s = P.circularState(earth, 3.844e8);
      Vec3.copy(luna.pos, s.pos);
      Vec3.copy(luna.vel, s.vel);
    }

    // --- Mars ----------------------------------------------------------
    const mars = add({
      name: 'Mars',
      mass: 6.4171e23,
      radius: 3.3895e6,
      color: '#c1440e',
      atmosphere: 'rgba(255,150,110,0.28)',
      spin: 7.0882e-5,
      parent: sun
    });
    {
      const s = P.circularState(sun, 2.2794382e11);
      Vec3.copy(mars.pos, s.pos);
      Vec3.copy(mars.vel, s.vel);
    }

    // --- Phobos (low orbit, good for a landing mission) -----------------
    const phobos = add({
      name: 'Phobos',
      mass: 1.0659e16,
      radius: 11267,                       // mean radius ~11.3 km
      color: '#6b6259',
      parent: mars
    });
    {
      const s = P.circularState(mars, 9376e3);
      Vec3.copy(phobos.pos, s.pos);
      Vec3.copy(phobos.vel, s.vel);
    }

    // --- The orbital station (the thing you actually fly to) -----------
    // Altitude 4200 km above Earth's surface, i.e. an orbital radius of
    // 6371 + 4200 = 10571 km. (Passing 4.2e6 as a *radius* would place it
    // inside the planet.)
    const station = add({
      name: 'Waystation Kestrel',
      mass: 4.2e6,
      radius: 90,
      color: '#c9d4de',
      parent: earth          // so advanceKinematic orbits it around Earth
    });
    {
      const s = P.circularState(earth, earth.radius + 4.2e6);
      Vec3.copy(station.pos, s.pos);
      Vec3.copy(station.vel, s.vel);
      station.earth = earth;
    }

    const parentIndices = new Int32Array(bodies.length);
    parentIndices.fill(-1);
    for (let i = 0; i < bodies.length; i++) {
      if (bodies[i].parent) parentIndices[i] = bodies.indexOf(bodies[i].parent);
    }
    const kinematicScratch = {
      parentIndices,
      oldPos: new Float64Array(bodies.length * 3),
      oldVel: new Float64Array(bodies.length * 3),
      nextPos: new Float64Array(bodies.length * 3),
      nextVel: new Float64Array(bodies.length * 3)
    };

    return {
      bodies,
      byName,
      sun, earth, mars, luna, phobos, station,
      kinematicScratch,
      // Bodies the ship is gravitationally bound to (excludes the star).
      gravitySources: [earth, mars, luna, phobos, sun]
    };
  }

  /**
   * The body a craft at `pos` is most strongly pulled by, ignoring the Sun
   * (otherwise everything would always report "Sol"). Used to pick which
   * orbit to display on the HUD and for altitude readouts.
   */
  function dominantBody(pos, sys) {
    let best = null, bestA = -1;
    for (let i = 0; i < sys.gravitySources.length; i++) {
      const b = sys.gravitySources[i];
      if (b === sys.sun) continue;
      const a = P.gravityAt(pos, b, {});
      const mag = Vec3.len(a);
      if (mag > bestA) { bestA = mag; best = b; }
    }
    return best;
  }

  /**
 * Advance bodies that ride on a parent's orbit (planets, moons, station).
 *
 * These are treated kinematically rather than as full N-body participants:
 * we hold their orbit circular and rotate them about their parent. Their
 * velocity must be rotated by the SAME angle, otherwise a body would be
 * reported as moving somewhere it never actually goes.
 *
 * Without this, a station would sit still while advertising an orbital
 * velocity, and a ship on the same orbit would drift through it.
 */
function advanceKinematic(sys, dt) {
  const bodies = sys.bodies;
  const scratch = sys.kinematicScratch;
  const count = bodies.length;
  const oldPos = scratch.oldPos, oldVel = scratch.oldVel;
  const nextPos = scratch.nextPos, nextVel = scratch.nextVel;
  const parentIndices = scratch.parentIndices;

  for (let i = 0; i < count; i++) {
    const j = i * 3, body = bodies[i];
    oldPos[j] = nextPos[j] = body.pos.x;
    oldPos[j + 1] = nextPos[j + 1] = body.pos.y;
    oldPos[j + 2] = nextPos[j + 2] = body.pos.z;
    oldVel[j] = nextVel[j] = body.vel.x;
    oldVel[j + 1] = nextVel[j + 1] = body.vel.y;
    oldVel[j + 2] = nextVel[j + 2] = body.vel.z;
  }

  for (let i = 0; i < count; i++) {
    const parentIndex = parentIndices[i];
    if (parentIndex < 0) continue;
    const j = i * 3, p = parentIndex * 3;
    const rx = oldPos[j] - oldPos[p];
    const ry = oldPos[j + 1] - oldPos[p + 1];
    const rz = oldPos[j + 2] - oldPos[p + 2];
    const vx = oldVel[j] - oldVel[p];
    const vy = oldVel[j + 1] - oldVel[p + 1];
    const vz = oldVel[j + 2] - oldVel[p + 2];
    const r = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (r < 1e-3) continue;

    const omega = Math.sqrt(vx * vx + vy * vy + vz * vz) / r; // rad/s
    const ang = omega * dt;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    nextPos[j] = nextPos[p] + rx * ca - ry * sa;
    nextPos[j + 1] = nextPos[p + 1] + rx * sa + ry * ca;
    nextPos[j + 2] = nextPos[p + 2] + rz;
    nextVel[j] = nextVel[p] + vx * ca - vy * sa;
    nextVel[j + 1] = nextVel[p + 1] + vx * sa + vy * ca;
    nextVel[j + 2] = nextVel[p + 2] + vz;
  }

  for (let i = 0; i < count; i++) {
    const j = i * 3, body = bodies[i];
    body.pos.x = nextPos[j];
    body.pos.y = nextPos[j + 1];
    body.pos.z = nextPos[j + 2];
    body.vel.x = nextVel[j];
    body.vel.y = nextVel[j + 1];
    body.vel.z = nextVel[j + 2];
  }
}

/** Altitude above a body's surface (negative inside). */
  function altitude(pos, body) {
    if (!body) return NaN;
    return Vec3.dist(pos, body.pos) - body.radius;
  }

  global.Universe = {
    buildSystem, celestial, dominantBody, altitude, advanceKinematic, G
  };
})(window);