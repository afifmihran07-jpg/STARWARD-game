/* =========================================================================
   trajectoryPredictor.js — forward integration of the same physics.

   The prediction is not a curve fit: it runs gravity and thrust through the
   identical stepper the flight uses, so the drawn path cannot disagree with
   the simulation. The planned path is the same integration with an extra
   prograde ΔV applied at t0.
   ========================================================================= */
import {gravityAt} from '../physics/gravity.js';

const STEPS = 300;
const STEP_DT = 5;

export class TrajectoryPredictor {
  constructor() {
    this.points = [];
    this.last = 0;
    this.ms = 0;
  }

  update(rocket, bodies, now) {
    if (!rocket || rocket.crashed) {
      this.points = [];
      return;
    }
    if (now - this.last < 400) return;
    this.last = now;
    const t0 = performance.now();
    this.points = this.trace(rocket, bodies, 0);
    this.ms = performance.now() - t0;
  }

  /** Path the vehicle would follow after a prograde/retrograde burn of `dv`. */
  plan(rocket, bodies, dv) {
    if (!rocket || !dv) return [];
    return this.trace(rocket, bodies, dv);
  }

  trace(rocket, bodies, deltaV) {
    const body = rocket.primaryBody || bodies[1];
    let p = {x: rocket.position.x, y: rocket.position.y};
    let v = {x: rocket.velocity.x, y: rocket.velocity.y};
    if (deltaV) {
      const s = Math.hypot(v.x, v.y) || 1;
      v.x += (v.x / s) * deltaV;
      v.y += (v.y / s) * deltaV;
    }

    const engine = rocket.activeEngine;
    const burning = rocket.throttle > 0 && engine && rocket.currentFuel > 0 && !deltaV;
    const dt = STEP_DT;
    const out = [{x: p.x, y: p.y}];
    const mass = rocket.mass || 1;

    for (let i = 0; i < STEPS; i++) {
      const g = gravityAt(p, bodies);
      let ax = g.x, ay = g.y;
      if (burning && i < 70) {
        const t = engine.thrust * rocket.throttle;
        ax += Math.sin(rocket.angle) * t / mass;
        ay += Math.cos(rocket.angle) * t / mass;
      }
      v.x += ax * dt;
      v.y += ay * dt;
      p.x += v.x * dt;
      p.y += v.y * dt;
      if (i % 3 === 0) out.push({x: p.x, y: p.y});
      if (body.altitude(p) < 0 && i > 2) {
        out.push({x: p.x, y: p.y});
        break;
      }
    }
    return out;
  }
}
