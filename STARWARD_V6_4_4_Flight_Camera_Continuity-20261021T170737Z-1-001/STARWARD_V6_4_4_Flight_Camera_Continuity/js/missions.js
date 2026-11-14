/* =========================================================================
   missions.js — objectives and their success conditions.

   Missions never move the ship. Every objective is a *predicate* evaluated
   against the real simulation state (distances, relative velocity, orbital
   elements), so success is earned by flying the physics correctly rather
   than by triggering a cutscene.
   ========================================================================= */
(function (global) {
  'use strict';

  const { Vec3, Util } = global.Math3;
  const P = global.Physics;
  const U = global.Universe;

  /**
   * Mission definition shape:
   *   id, name, brief, difficulty
   *   spawn(ctx) -> { pos, vel, targetName }
   *   objectives: [{ text, done(ctx) -> bool, optional }]
   */
  const MISSIONS = [];

  /** Orbit of the ship relative to a body, or null. */
  function orbitAbout(ctx, body) {
    return P.stateToOrbit(
      Vec3.sub(ctx.ship.body.pos, body.pos),
      Vec3.sub(ctx.ship.body.vel, body.vel),
      body.mu
    );
  }

  /**
   * Spawn state for a circular orbit at altitude `alt` above `body`.
   * Delegates to Physics.circularState, which offsets from the body's centre
   * and inherits the body's own velocity.
   */
  function circularStart(body, alt) {
    return P.circularState(body, body.radius + alt);
  }

  /* --------------------------- Mission 1: LEO --------------------------- */
  const m1 = {
    id: 'leo-checkout',
    name: 'Orbital Checkout',
    difficulty: 'TRAINING',
    brief: 'Kestrel-1 is on a stable orbit. Confirm your instruments, then ' +
           'match velocity with the Kestrel waystation and dock.',
    spawn: function (ctx) {
      const earth = ctx.sys.earth;
      const st = ctx.sys.station;

      // Start exactly on the station's own circular orbit, 60 km of arc
      // behind it. Rotating the station's position about Earth's centre
      // preserves the orbital radius exactly, whereas offsetting in a
      // straight line would change the radius and inject eccentricity.
      const rel = Vec3.sub(st.pos, earth.pos);
      const ang = -6e4 / Vec3.len(rel);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const pos = Vec3.create(
        earth.pos.x + rel.x * ca - rel.y * sa,
        earth.pos.y + rel.x * sa + rel.y * ca,
        earth.pos.z + rel.z
      );
      // Rotate the orbital velocity by the same angle so the two states
      // describe the same circle at different phases.
      const rv = Vec3.sub(st.vel, earth.vel);
      const vel = Vec3.create(
        earth.vel.x + rv.x * ca - rv.y * sa,
        earth.vel.y + rv.x * sa + rv.y * ca,
        earth.vel.z + rv.z
      );

      return { pos, vel, targetName: st.name };
    },
    range: function (ctx) {
      return Vec3.dist(ctx.ship.body.pos, ctx.sys.station.pos);
    },
    relSpeed: function (ctx) {
      return Vec3.len(Vec3.sub(ctx.ship.body.vel, ctx.sys.station.vel));
    },
    objectives: [
      {
        text: 'Reach within 5 km of the waystation',
        done: function (ctx) { return m1.range(ctx) < 5000; }
      },
      {
        text: 'Match velocity (relative speed < 5 m/s)',
        done: function (ctx) { return m1.relSpeed(ctx) < 5; }
      },
      {
        text: 'Close to docking range (< 150 m)',
        done: function (ctx) { return m1.range(ctx) < 150; }
      },
      {
        text: 'Dock with the station',
        done: function (ctx) {
          const ship = ctx.ship.body;
          return m1.range(ctx) < 120 && m1.relSpeed(ctx) < 3;
        }
      }
    ]
  };
  MISSIONS.push(m1);
/* ------------------- Mission 2: orbital transfer ---------------------- */
  const m2 = {
    id: 'transfer',
    name: 'Hohmann Climb',
    difficulty: 'INTERMEDIATE',
    brief: 'You are in a 300 km parking orbit. Raise the orbit above ' +
           '20,000 km and circularise. Spend propellant wisely.',
    spawn: function (ctx) {
      const s = circularStart(ctx.sys.earth, 3.0e5);
      return { pos: s.pos, vel: s.vel, targetName: 'Earth' };
    },
    objectives: [
      {
        text: 'Raise apoapsis above 20,000 km',
        done: function (ctx) {
          const o = orbitAbout(ctx, ctx.sys.earth);
          return !!o && o.closed && (o.apoapsis - ctx.sys.earth.radius) > 2.0e7;
        }
      },
      {
        text: 'Circularise: periapsis above 20,000 km',
        done: function (ctx) {
          const o = orbitAbout(ctx, ctx.sys.earth);
          if (!o || !o.closed) return false;
          const rp = o.periapsis - ctx.sys.earth.radius;
          const ra = o.apoapsis - ctx.sys.earth.radius;
          return rp > 2.0e7 && ra > 2.0e7;
        }
      },
      {
        text: 'Hold the new orbit for 20 seconds',
        done: function (ctx) { return ctx.state.holdTime > 20; }
      }
    ],
    initState: function () { return { holdTime: 0 }; },
    onUpdate: function (ctx) {
      // Count how long the orbit has been both closed and near-circular.
      const o = orbitAbout(ctx, ctx.sys.earth);
      const good = o && o.closed && o.ecc < 0.05;
      ctx.state.holdTime = good ? ctx.state.holdTime + ctx.dt : 0;
    }
  };
  MISSIONS.push(m2);

  /* --------------------- Mission 3: escape ----------------------------- */
  const m3 = {
    id: 'escape',
    name: 'Break the Harness',
    difficulty: 'ADVANCED',
    brief: 'Earth holds you at 7.6 km/s; escape needs 11.2 km/s. There is ' +
           'no drag out here to help you — earn every metre per second.',
    spawn: function (ctx) {
      const s = circularStart(ctx.sys.earth, 3.0e5);
      return { pos: s.pos, vel: s.vel, targetName: 'Earth' };
    },
    objectives: [
      {
        text: 'Achieve positive orbital energy (escape velocity)',
        done: function (ctx) {
          const o = orbitAbout(ctx, ctx.sys.earth);
          return !!o && !o.closed && !o.parabolic && o.energy > 0;
        }
      },
      {
        text: 'Recede beyond 100,000 km from Earth',
        done: function (ctx) {
          return Vec3.dist(ctx.ship.body.pos, ctx.sys.earth.pos) > 1.0e8;
        }
      }
    ]
  };
  MISSIONS.push(m3);

  /* ------------------- Mission 4: Phobos landing ----------------------- */
  const m4 = {
    id: 'phobos',
    name: 'Descent to Phobos',
    difficulty: 'EXPERT',
    brief: 'Phobos orbits Mars at ~1.8 km/s, so a landing needs almost no ' +
           'braking. Touch down under 3 m/s.',
    spawn: function (ctx) {
      const s = circularStart(ctx.sys.mars, 9.376e6 - 3.3895e6);
      return { pos: s.pos, vel: s.vel, targetName: 'Phobos' };
    },
    objectives: [
      {
        text: 'Close to within 5 km of Phobos',
        done: function (ctx) {
          return Vec3.dist(ctx.ship.body.pos, ctx.sys.phobos.pos) < 5000;
        }
      },
      {
        text: 'Touchdown: within 200 m of the surface',
        done: function (ctx) {
          return U.altitude(ctx.ship.body.pos, ctx.sys.phobos) < 200;
        }
      },
      {
        text: 'Landed: vertical speed below 3 m/s',
        done: function (ctx) {
          const alt = U.altitude(ctx.ship.body.pos, ctx.sys.phobos);
          return alt < 150 && ctx.ship.speed() < 3;
        }
      }
    ],
    onUpdate: function (ctx) {
      // Advise, but never auto-fail: the player owns the landing.
      const alt = U.altitude(ctx.ship.body.pos, ctx.sys.phobos);
      if (alt < 400 && ctx.ship.speed() > 6) {
        ctx.warn('DESCENT RATE ' + ctx.ship.speed().toFixed(1) + ' m/s');
      }
    }
  };
  MISSIONS.push(m4);
/* --------------------------- Mission runner --------------------------- */
  function MissionRunner(def, ctx) {
    this.def = def;
    this.ctx = ctx;
    this.index = 0;
    this.complete = false;
    this.failed = false;

    const objs = def.objectives || [];
    this.done = new Array(objs.length).fill(false);
    this.total = objs.length;

    if (def.initState) ctx.state = def.initState();
    else if (!ctx.state) ctx.state = {};
  }

  MissionRunner.prototype = {
    /**
     * Advance the mission state machine by one frame.
     * Objectives are sequential: we evaluate the first incomplete one and
     * only move on once it is satisfied.
     */
    update: function (dt) {
      const def = this.def;
      const ctx = this.ctx;
      ctx.dt = dt;

      // Continuous mission logic (timers, advisories).
      if (def.onUpdate) def.onUpdate(ctx);

      const objs = def.objectives || [];
      if (this.index < objs.length && !this.done[this.index]) {
        let ok = false;
        try {
          ok = objs[this.index].done.call(def, ctx);
        } catch (e) {
          ok = false;                 // a broken predicate must not crash the game
        }
        if (ok) {
          this.done[this.index] = true;
          if (ctx.onObjectiveComplete) ctx.onObjectiveComplete(this.index);
        }
      }

      while (this.index < objs.length && this.done[this.index]) this.index++;
      if (this.index >= objs.length) this.complete = true;
    },

    /** Objective rows for the HUD, each with its completion state. */
    rows: function () {
      const objs = this.def.objectives || [];
      const out = [];
      for (let i = 0; i < objs.length; i++) {
        out.push({
          text: objs[i].text,
          done: this.done[i],
          active: i === this.index && !this.complete
        });
      }
      return out;
    },

    /** Text of the active objective, or a completion message. */
    activeText: function () {
      const objs = this.def.objectives || [];
      if (this.index < objs.length) return objs[this.index].text;
      return 'Mission objectives complete';
    },

    /** Fraction of objectives satisfied, 0..1. */
    progress: function () {
      if (!this.total) return 1;
      let n = 0;
      for (let i = 0; i < this.total; i++) if (this.done[i]) n++;
      return n / this.total;
    }
  };

  global.Missions = { MISSIONS, MissionRunner };
})(window);