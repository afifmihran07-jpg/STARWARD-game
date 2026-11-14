/* =========================================================================
   maneuverNode.js — the map's prograde / retrograde burn planner.

   The node only holds an intent (a ΔV). The planned trajectory is drawn by
   the predictor, and the burn is applied instantly when the player executes
   it, so what you see really is what you get.
   ========================================================================= */
const STEP = 10;
const MAX = 5000;

export class ManeuverNode {
  constructor() {
    this.deltaV = 0;
    this.active = false;
  }

  adjust(direction) {
    const dv = Math.max(-MAX, Math.min(MAX, this.deltaV + direction * STEP));
    this.deltaV = dv;
    this.active = dv !== 0;
    return dv;
  }

  nudge(fraction) {
    this.deltaV = Math.round(this.deltaV + fraction * 50);
    this.active = this.deltaV !== 0;
    return this.deltaV;
  }

  clear() {
    this.active = false;
    this.deltaV = 0;
  }
}
