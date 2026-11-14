/* =========================================================================
   rocket.js — a flying vehicle: the parts, its stages and its flight state.

   A "build unit" is 2 m. Stages are derived from the build: every decoupler /
   separator ends a stage, counted from the bottom of the stack up — the order
   they are jettisoned in flight. Propellant is tracked per stage, because a
   rocket that burns all of stage 1 must still have stage 2's tanks full when
   the stage joint opens.
   ========================================================================= */
import {PART_DEFINITIONS as D} from './partDefinitions.js';
import {terrainHeight} from '../physics/collision.js';

export const METERS_PER_UNIT = 2;

const isEngine = p => !!D[p.type].thrust;
const propellant = p => D[p.type].fuelCapacity || 0;

/** Split a build into stage groups, bottom group first (it fires first). */
export function groupStages(parts) {
  const sorted = parts.slice().sort((a, b) => b.y - a.y);
  const groups = [];
  let current = [];
  for (const p of sorted) {
    current.push(p);
    if (D[p.type].stage) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

export class Rocket {
  constructor(parts) {
    this.parts = parts.map(p => ({
      id: p.id, type: p.type, x: p.x, y: p.y, rotation: p.rotation || 0,
      flipX: !!p.flipX, stage: p.stage || 0
    }));
    this.position = {x: 0, y: 0};
    this.velocity = {x: 0, y: 0};
    this.acceleration = {x: 0, y: 0};
    this.angle = 0;
    // --- Modern flight state -------------------------------------------------
    // `throttle` is the pilot's lever (0..1). `spool` is what the engines are
    // actually producing — it chases the lever with a first-order lag so
    // slam-the-throttle feels like turbopumps spooling, not a light switch.
    // `angVel` / `steer` give the stack real rotational inertia instead of a
    // kinematic angle snap, and `sas` damps rotation when hands are off.
    this.throttle = 0;
    this.spool = 0;
    this.angVel = 0;
    this.steer = 0;
    this.sas = true;
    this.gForce = 0;
    this.dynPressure = 0;
    this.mach = 0;
    this.maxDynPressure = 0;
    this.maxQAltitude = null;
    this.maxQTime = null;
    this.maxQRecorded = false;
    this.flightElapsed = 0;
    this.flightEvents = [];
    this.flightPhase = 'PRELAUNCH';
    this.autoGuidance = false;
    this.guidanceTargetAltitude = 200000;
    this.guidanceMaxG = 4.0;
    this.ispEff = 0;
    this.stageIndex = -1;
    /** Stage groups already dropped (for the "STAGE n / N" read-outs). */
    this.stagesJettisoned = 0;
    this.crashed = false;
    this.landed = false;
    this.stageFuel = [];
    this._activeEngine = null;
    this.refresh();
  }

  /** Total mass, wet. */
  get mass() {
    return this.dryMass + this.fuel;
  }

  /** Propellant left across every stage still attached. */
  get fuel() {
    return this.stageFuel.reduce((a, b) => a + b, 0);
  }

  /** Propellant the lit stage can still spend. */
  get currentFuel() {
    return this.stageIndex >= 0 ? (this.stageFuel[this.stageIndex] || 0) : 0;
  }

  /** Propellant the lit stage started with. */
  get currentCapacity() {
    return this.stageIndex >= 0 ? ((this.stageCapacity || [])[this.stageIndex] || 0) : 0;
  }

  get fuelCapacity() {
    return this.groups.reduce((s, g) => s + g.reduce((t, p) => t + propellant(p), 0), 0);
  }

  /** Height of the stack in build units (used by the camera framing). */
  get height() {
    if (!this.parts.length) return 0;
    const ys = this.parts.map(p => p.y);
    return Math.max(...ys) - Math.min(...ys) + 4;
  }

  /** Percentage of propellant left, 0..1. */
  get fuelFraction() {
    return this.fuelCapacity ? Math.max(0, Math.min(1, this.fuel / this.fuelCapacity)) : 0;
  }

  get activeEngine() {
    return this._activeEngine;
  }

  /** Distance from the rocket origin to its lowest point along a direction. */
  supportExtent(nx, ny) {
    const cos = Math.cos(this.angle), sin = Math.sin(this.angle);
    let extent = 0;
    for (const part of this.parts) {
      const def = D[part.type];
      const centerX = (part.x * cos - part.y * sin) * METERS_PER_UNIT;
      const centerY = -(part.x * sin + part.y * cos) * METERS_PER_UNIT;
      const angle = this.angle + (part.rotation || 0);
      const axisX = Math.cos(angle) * nx - Math.sin(angle) * ny;
      const axisY = -Math.sin(angle) * nx - Math.cos(angle) * ny;
      // Part dimensions are full widths/heights; project their half sizes from
      // each part centre to get the actual outer support point.
      const halfExtent = 0.5 * (def.width * Math.abs(axisX) + def.height * Math.abs(axisY)) * METERS_PER_UNIT;
      extent = Math.max(extent, -(centerX * nx + centerY * ny) + halfExtent);
    }
    return Math.max(0, extent);
  }

  altitudeAboveSurface(body) {
    const dx = this.position.x - body.position.x;
    const dy = this.position.y - body.position.y;
    const distance = Math.hypot(dx, dy);
    const nx = dx / distance, ny = dy / distance;
    const surface = body.radius + terrainHeight(Math.atan2(ny, nx), body);
    return Math.max(0, distance - surface - this.supportExtent(nx, ny));
  }

  /** Parts still bolted on (everything above the jettisoned stages). */
  get attachedParts() {
    const doomed = new Set();
    for (let i = 0; i < this.stageIndex; i++) {
      for (const p of this.groups[i] || []) doomed.add(p.id);
    }
    return this.parts.filter(p => !doomed.has(p.id));
  }

  /** Recompute mass, per-stage propellant, engines and stage groups. */
  refresh() {
    const previous = this.stageFuel ? this.stageFuel.slice() : null;
    this.dryMass = this.parts.reduce((s, p) => s + D[p.type].mass, 0);
    this.groups = groupStages(this.parts);
    const caps = this.groups.map(g => g.reduce((s, p) => s + propellant(p), 0));
    this.stageCapacity = caps;
    // Same stage count: keep what is left in each tank. Fewer stages: the
    // remaining upper stages were never lit, so they are still full.
    this.stageFuel = caps.map((cap, i) =>
      previous && previous.length === caps.length ? Math.min(cap, previous[i] ?? cap) : cap);
    this.engines = this.parts.filter(isEngine).map(p => D[p.type]);
    this.stageIndex = Math.min(this.stageIndex, this.groups.length - 1);
    this._activeEngine = this._summarise(this.stageIndex);
  }

  /** Combined thrust/Isp of the engines lit by a stage index. */
  _summarise(index) {
    if (index < 0 || index >= this.groups.length) return null;
    const engines = this.groups[index].filter(isEngine).map(p => D[p.type]);
    if (!engines.length) return null;
    const thrust = engines.reduce((s, e) => s + e.thrust, 0);
    const isp = engines.reduce((s, e) => s + e.thrust * e.isp, 0) / thrust;
    return {thrust, isp, count: engines.length};
  }

  /** Stack height in metres (used to size the chase camera). */
  get heightMeters() {
    if (!this.parts.length) return 20;
    let top = Infinity, bottom = -Infinity;
    for (const p of this.parts) {
      const def = D[p.type];
      if (!def) continue;
      top = Math.min(top, p.y - def.height / 2);
      bottom = Math.max(bottom, p.y + def.height / 2);
    }
    return Math.max(8, (bottom - top) * METERS_PER_UNIT);
  }

  /**
   * Steering authority in rad/s^2: gimbal + fins + reaction wheels, scaled by
   * dynamic pressure (fins bite in air) and control state. Big heavy stacks
   * turn slower — this is what makes large rockets feel heavy.
   */
  torqueAuthority(q) {
    let torque = 0.6; // base gimbal
    for (const p of this.parts) {
      const def = D[p.type];
      if (!def) continue;
      if (p.type === 'reactionWheel') torque += 1.1;
      else if (p.type === 'rcs') torque += 0.35;
      else if (p.type === 'fin' || p.type === 'finSet' || p.type === 'gridFin') torque += 0.25 + Math.min(1.4, q / 12000);
      else if (p.type === 'winglet') torque += 0.2 + Math.min(1.0, q / 15000);
    }
    const massT = Math.max(1, this.mass / 1000);
    // Heavier => lazier, but never frozen. ~ 2.6 rad/s^2 nimble, ~0.5 heavy.
    return Math.max(0.45, Math.min(3.0, torque * 14 / Math.pow(massT, 0.7)));
  }

  /** Reset per-flight dynamic state on launch. */
  resetFlightState() {
    this.spool = 0;
    this.angVel = 0;
    this.steer = 0;
    this.gForce = 0;
    this.dynPressure = 0;
    this.mach = 0;
    this.maxDynPressure = 0;
    this.maxQAltitude = null;
    this.maxQTime = null;
    this.maxQRecorded = false;
    this.flightElapsed = 0;
    this.flightEvents = [];
    this.flightPhase = 'PRELAUNCH';
    this.ispEff = this._activeEngine ? this._activeEngine.isp : 0;
  }

  /**
   * True when SPACE can do something useful: ignite the first stage, or
   * separate to a further group that still carries an engine. Engineless
   * groups above the last propulsive stage are the payload: they stay
   * attached until the player explicitly deploys them.
   */
  canStage() {
    if (this.stageIndex < 0) return this.groups.length > 0;
    const next = this.stageIndex + 1;
    return next < this.groups.length &&
      this.groups.slice(next).some(g => g.some(isEngine));
  }

  /** The lit stage is the last propulsive one and an engineless payload sits above it. */
  get payloadAttached() {
    return this.stageIndex >= 0 && this.stageIndex + 1 < this.groups.length && !this.canStage();
  }

  /** 1-based number of the lit stage in the original stack (0 before ignition). */
  get stageNumber() {
    return this.stageIndex >= 0 ? (this.stagesJettisoned || 0) + this.stageIndex + 1 : 0;
  }

  /** Stage count of the original stack, including stages already jettisoned. */
  get totalStages() {
    return (this.stagesJettisoned || 0) + Math.max(1, this.groups.length);
  }

  /**
   * Light the next stage; everything below it is jettisoned.
   *
   * The surviving parts are re-grouped by refresh(), which numbers the groups
   * from 0 again — so the newly lit stage is always local group 0 afterwards.
   * stageIndex is reset to 0 and the surviving stages keep their own
   * propellant (previously the old index was kept, which skipped a stage and
   * stranded its fuel on every separation after the first).
   */
  nextStage() {
    if (!this.canStage()) return null;
    if (this.stageIndex < 0) {
      // Ignition: nothing is jettisoned.
      this.stageIndex = 0;
      this._activeEngine = this._summarise(0);
      return this.groups[0] || null;
    }
    const next = this.stageIndex + 1;
    const keep = new Set();
    for (let i = next; i < this.groups.length; i++) {
      for (const p of this.groups[i]) keep.add(p.id);
    }
    const survivingFuel = this.stageFuel.slice(next);
    this.parts = this.parts.filter(p => keep.has(p.id));
    this.stagesJettisoned = (this.stagesJettisoned || 0) + next;
    this.stageIndex = 0;
    this.refresh();
    // The survivors are the same groups in the same order, so their tanks
    // carry over one-for-one — never refilled, never lost.
    this.stageFuel = this.stageCapacity.map((cap, i) =>
      Math.max(0, Math.min(cap, survivingFuel[i] ?? cap)));
    return this.groups[0] || null;
  }

  /**
   * Log a separation that has just happened (call right after nextStage()
   * succeeded on an already-lit vehicle). Arms the next-stage ignition event,
   * which stepRocket records once the new engines actually spool up.
   */
  recordStageSeparation(fromStage, trigger = 'MANUAL', altitude = null) {
    this.flightEvents = this.flightEvents || [];
    this.flightEvents.push({type:'STAGE_SEPARATION', time:this.flightElapsed || 0, altitude,
      fromStage, toStage:this.stageNumber, separationImpulse:0, trigger});
    this.flightPhase = 'STAGE_SEPARATION';
    if (this.activeEngine) this._stageIgnitionPending = true;
  }

  /** Spend propellant from the lit stage. */
  burn(kg) {
    if (this.stageIndex < 0) return;
    this.stageFuel[this.stageIndex] = Math.max(0, (this.stageFuel[this.stageIndex] || 0) - kg);
  }
stats() {
    const engines = this.engines;
    const command = this.parts.some(p => D[p.type].category === 'COMMAND');
    const liftoff = this._summarise(0);
    const thrust = (liftoff ? liftoff.thrust : 0) || engines.reduce((s, e) => s + e.thrust, 0);
    const mass = this.mass;
    const dry = this.dryMass;

    // Sequential (Tsiolkovsky) rocket equation, one stage at a time and in
    // firing order: each stage burns its own *remaining* propellant while
    // carrying everything above it, then its whole group — leftover
    // propellant and dry structure, engines and decoupler — is dropped before
    // the next stage lights. Ideal vacuum Δv using each engine's rated Isp.
    // Starts at the lit stage in flight, so it is also the remaining Δv.
    let dv = 0;
    let remaining = mass;
    const stageDv = [];
    for (let i = Math.max(0, this.stageIndex); i < this.groups.length; i++) {
      const group = this.groups[i];
      const lit = group.filter(isEngine).map(p => D[p.type]);
      const fuel = Math.max(0, this.stageFuel[i] ?? group.reduce((s, p) => s + propellant(p), 0));
      const groupDry = group.reduce((s, p) => s + D[p.type].mass, 0);
      let stage = 0;
      if (lit.length && fuel > 0) {
        const stageThrust = lit.reduce((s, e) => s + e.thrust, 0);
        const isp = lit.reduce((s, e) => s + e.thrust * e.isp, 0) / stageThrust;
        const after = remaining - fuel;
        if (after > 0) stage = isp * 9.80665 * Math.log(remaining / after);
      }
      stageDv.push(stage);
      dv += stage;
      remaining -= fuel + groupDry;
    }

    return {
      mass,
      dryMass: dry,
      fuel: this.fuel,
      fuelCapacity: this.fuelCapacity,
      dv,
      stageDv,
      twr: mass ? thrust / (mass * 9.81) : 0,
      thrust,
      stages: Math.max(1, this.groups.length),
      engines: engines.length,
      command
    };
  }
}
