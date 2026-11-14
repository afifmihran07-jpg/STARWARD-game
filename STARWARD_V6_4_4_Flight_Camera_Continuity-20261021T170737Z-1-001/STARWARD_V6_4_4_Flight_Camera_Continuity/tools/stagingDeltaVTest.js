/* Regression test for audit findings B-1 (stage sequencing / upper-stage
 * ignition / stranded fuel), B-8 (multi-stage Δv) and B-12 (HUD Δv left).
 *
 * Expected values are computed here independently of Rocket.groupStages():
 * every custom vehicle is described as an explicit list of stages, and Δv is
 * worked out with the sequential rocket equation directly from the part
 * catalog. One case is also pinned to a hand-calculated literal. */
import assert from 'node:assert/strict';
import {Rocket} from '../js/rocket/rocket.js';
import {RocketPart} from '../js/rocket/rocketPart.js';
import {PART_DEFINITIONS as D} from '../js/rocket/partDefinitions.js';
import {attachmentSlots} from '../js/rocket/attachmentSystem.js';
import {Editor} from '../js/construction/editor.js';
import {MISSION_PRESET_CONFIGS} from '../js/construction/missionPresets.js';
import {createSolarSystem, updateOrbits} from '../js/celestial/solarSystem.js';
import {stepRocket} from '../js/physics/physics.js';
import {terrainHeight} from '../js/physics/collision.js';
import {controlRocket} from '../js/flight/flightController.js';
import {SaveManager} from '../js/save/saveManager.js';

const G0 = 9.80665;
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); checks++; };
const near = (a, b, tol, msg) => { assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ${b} ±${tol}`); checks++; };

const wet = t => D[t].mass + (D[t].fuelCapacity || 0);
const fuelOf = t => D[t].fuelCapacity || 0;
const isEngine = t => !!D[t].thrust;

/** Stack the stages top-down (stages[0] is the topmost), like the presets. */
function buildStack(stagesTopDown) {
  const parts = []; let prev = null;
  for (const stage of stagesTopDown) for (const type of stage) {
    const slot = prev ? attachmentSlots(type, prev, 0)[1] : {x: 0, y: 0};
    const p = new RocketPart(type, slot.x, slot.y); parts.push(p); prev = p;
  }
  return parts;
}

/** Independent sequential rocket equation over explicit stages (firing order). */
function expectedDv(firingOrder) {
  let m = firingOrder.flat().reduce((s, t) => s + wet(t), 0);
  let dv = 0;
  for (const stage of firingOrder) {
    const engines = stage.filter(isEngine).map(t => D[t]);
    const fuel = stage.reduce((s, t) => s + fuelOf(t), 0);
    if (engines.length && fuel > 0) {
      const T = engines.reduce((s, e) => s + e.thrust, 0);
      const isp = engines.reduce((s, e) => s + e.thrust * e.isp, 0) / T;
      dv += isp * G0 * Math.log(m / (m - fuel));
    }
    m -= stage.reduce((s, t) => s + wet(t), 0);
  }
  return dv;
}

const thrustOf = stage => stage.filter(isEngine).reduce((s, t) => s + D[t].thrust, 0);
const massOf = stages => stages.flat().reduce((s, t) => s + wet(t), 0);

/* ---------------------------------------------------------------------- */
/* Custom vehicles, top-down. A trailing engineless group is the payload.  */
/* ---------------------------------------------------------------------- */
const CUSTOM = {
  twoStage: {
    top: [
      ['probeCore', 'mediumTank', 'vacuumEngine'],
      ['decoupler', 'largeTank', 'largeTank', 'bigEngine']
    ],
    payload: false
  },
  threeStage: {
    top: [
      ['probeCore', 'smallTank', 'smallEngine'],
      ['decoupler', 'mediumTank', 'vacuumEngine'],
      ['decoupler', 'largeTank', 'largeTank', 'bigEngine']
    ],
    payload: false
  },
  fourStageWithPayload: {
    top: [
      ['noseCone', 'probeCore', 'battery', 'antenna', 'science'],   // payload, no engine
      ['decoupler', 'smallTank', 'smallEngine'],
      ['separator', 'mediumTank', 'vacuumEngine'],
      ['decoupler', 'largeTank', 'mediumEngine'],
      ['rSeparator', 'hugeTank', 'largeTank', 'bigEngine']
    ],
    payload: true
  }
};

/* ---- 1. Δv: hand literal + independent formula for 2/3/4 stages ------- */
{
  const r = new Rocket(buildStack(CUSTOM.twoStage.top));
  // Hand calculation (see audit Phase 1 report):
  //   m0 = 37,200 kg; stage 1: 330·g0·ln(37200/11200) = 3,884.7 m/s
  //   stage 2 (booster dry mass dropped): 420·g0·ln(7250/1250) = 7,240.3 m/s
  near(r.stats().dv, 11125.0, 0.5, 'two-stage Δv matches hand calculation');
  near(r.stats().stageDv[0], 3884.71, 0.05, 'two-stage first-stage Δv');
  near(r.stats().stageDv[1], 7240.25, 0.05, 'two-stage second-stage Δv carries no dropped booster mass');
}
for (const [name, def] of Object.entries(CUSTOM)) {
  const r = new Rocket(buildStack(def.top));
  const firing = def.top.slice().reverse();
  eq(r.groups.length, def.top.length, `${name}: stage groups`);
  near(r.stats().dv, expectedDv(firing), 0.01, `${name}: total Δv`);
  near(r.mass, massOf(def.top), 1e-6, `${name}: liftoff mass`);
}

/* ---- 2. Manual staging: order, ignition, fuel, mass after separation --- */
function manualStaging(name, def) {
  const r = new Rocket(buildStack(def.top));
  const firing = def.top.slice().reverse();
  const propulsive = firing.filter(s => s.some(isEngine)).length;
  ok(r.nextStage(), `${name}: ignition`);
  for (let k = 0; k < propulsive; k++) {
    const stage = firing[k];
    const above = firing.slice(k);
    eq(r.stageNumber, k + 1, `${name}: stage number ${k + 1}`);
    eq(r.totalStages, firing.length, `${name}: total stages stays ${firing.length}`);
    ok(r.activeEngine, `${name}: stage ${k + 1} has a lit engine`);
    eq(r.activeEngine.thrust, thrustOf(stage), `${name}: stage ${k + 1} lights its own engines`);
    near(r.currentFuel, stage.reduce((s, t) => s + fuelOf(t), 0), 1e-6, `${name}: stage ${k + 1} starts with full tanks`);
    near(r.mass, massOf(above), 1e-6, `${name}: mass after separation to stage ${k + 1}`);
    near(r.stats().dv, expectedDv(above), 0.01, `${name}: remaining Δv at stage ${k + 1}`);
    // Burn 70 % of this stage, then separate: the leftover goes with the stage
    // and the next stage must arrive full (no refill, no loss, no skip).
    r.burn(r.currentFuel * 0.7);
    const next = r.nextStage();
    if (k < propulsive - 1) ok(next, `${name}: separation ${k + 1}→${k + 2}`);
    else eq(next, null, `${name}: no separation past the last propulsive stage`);
  }
  if (def.payload) {
    ok(r.payloadAttached, `${name}: payload reported attached`);
    ok(r.parts.some(p => p.type === 'probeCore'), `${name}: payload still on the vehicle`);
    ok(r.parts.some(p => p.type === 'science'), `${name}: payload hardware still on the vehicle`);
  } else {
    eq(r.payloadAttached, false, `${name}: no payload group`);
  }
  eq(r.canStage(), false, `${name}: stage button disabled at the end`);
}
for (const [name, def] of Object.entries(CUSTOM)) manualStaging(name, def);

/* ---- 3. Auto-staging through the physics step (depletion path) -------- */
function placeInOrbit(r, bodies) {
  const earth = bodies.find(b => b.id === 'earth');
  const R = earth.radius + 300000, v = Math.sqrt(earth.mu / R);
  r.position = {x: earth.position.x + R, y: earth.position.y};
  r.velocity = {x: earth.velocity.x, y: earth.velocity.y + v};
  r.angle = 0; r.landed = false; r.hasFlown = true;
  r.primaryBody = earth; r.body = earth;
  return earth;
}

/** Drain each lit stage through stepRocket and record what lights next. */
function autoStageSequence(parts) {
  const bodies = createSolarSystem();
  const r = new Rocket(parts);
  placeInOrbit(r, bodies);
  r.nextStage(); r.throttle = 1; r.spool = 1;
  const lit = [{thrust: r.activeEngine && r.activeEngine.thrust, fuel: r.currentFuel, mass: r.mass}];
  for (let guard = 0; guard < 20; guard++) {
    const before = r.stagesJettisoned;
    r.stageFuel[r.stageIndex] = 1e-6;      // last drop of this stage
    r.throttle = 1; r.spool = 1;
    stepRocket(r, bodies, 1 / 60);
    if (r.stagesJettisoned === before) break;   // final cutoff
    // Sample the new stage at the moment of separation…
    const entry = {thrust: r.activeEngine && r.activeEngine.thrust, fuel: r.currentFuel, mass: r.mass};
    // …then it must be commanded on and actually produce thrust.
    for (let i = 0; i < 120; i++) stepRocket(r, bodies, 1 / 60);
    entry.actualThrust = r.actualThrust;
    lit.push(entry);
  }
  return {r, lit};
}

for (const [name, def] of Object.entries(CUSTOM)) {
  const firing = def.top.slice().reverse().filter(s => s.some(isEngine));
  const {r, lit} = autoStageSequence(buildStack(def.top));
  eq(lit.length, firing.length, `${name}: every propulsive stage lit by auto-staging`);
  lit.forEach((s, k) => {
    eq(s.thrust, thrustOf(firing[k]), `${name}: auto-stage ${k + 1} lights the right engines`);
    if (k > 0) ok(s.actualThrust > 0, `${name}: auto-staged stage ${k + 1} produces thrust`);
  });
  const events = r.flightEvents.filter(e => e.type === 'STAGE_SEPARATION');
  eq(events.length, firing.length - 1, `${name}: one separation event per joint`);
  events.forEach((e, k) => {
    eq(e.fromStage, k + 1, `${name}: separation ${k + 1} from-stage`);
    eq(e.toStage, k + 2, `${name}: separation ${k + 1} to-stage`);
  });
  eq(r.flightEvents.filter(e => e.type === 'NEXT_STAGE_IGNITION').length, firing.length - 1,
    `${name}: an ignition event for every upper stage`);
  ok(r.flightEvents.some(e => e.type === 'ENGINE_CUTOFF' && e.reason === 'PROPELLANT_DEPLETED'),
    `${name}: final cutoff recorded`);
  near(r.fuel, 0, 1e-3, `${name}: no stranded propellant after the last stage burns out`);
}

/* ---- 4. All six mission presets (plus the starter) --------------------- */
// Independently computed sequential Δv (stage dry mass dropped), m/s.
// earthObservation / technology recomputed with the same independent probe
// after Phase 3 A1 added a 45 kg Comms Antenna to each (was 8750 / 16125).
const PRESET_DV = {starter: 6442, earthObservation: 8688, weather: 9105, communications: 9456,
  lunar: 8920, planetary: 9326, technology: 15815};
for (const key of Object.keys(MISSION_PRESET_CONFIGS)) {
  const editor = new Editor(); editor.loadPreset(key);
  const r0 = new Rocket(editor.parts);
  near(r0.stats().dv, PRESET_DV[key], 1, `${key}: builder Δv`);

  // Expected firing order from the build-time stage plan.
  const plan = r0.groups.map(g => ({
    thrust: g.filter(p => isEngine(p.type)).reduce((s, p) => s + D[p.type].thrust, 0),
    fuel: g.reduce((s, p) => s + fuelOf(p.type), 0),
    ids: new Set(g.map(p => p.id))
  }));
  let lastProp = -1; plan.forEach((s, i) => { if (s.thrust > 0) lastProp = i; });
  const {r, lit} = autoStageSequence(editor.parts);
  eq(lit.length, lastProp + 1, `${key}: every propulsive stage is lit`);
  lit.forEach((s, k) => {
    eq(s.thrust, plan[k].thrust, `${key}: stage ${k + 1} lights its own engines`);
    near(s.fuel, plan[k].fuel, 1e-6, `${key}: stage ${k + 1} has its full propellant at ignition`);
  });
  near(r.fuel, 0, 1e-3, `${key}: no stranded upper-stage propellant`);
  // Payload (engineless groups above the last propulsive stage) stays on.
  for (let i = lastProp + 1; i < plan.length; i++) {
    for (const id of plan[i].ids) ok(r.parts.some(p => p.id === id), `${key}: payload part ${id} still attached`);
  }
  if (lastProp < plan.length - 1) ok(r.payloadAttached, `${key}: payload attached until DEPLOY`);
  eq(r.stageNumber, lastProp + 1, `${key}: final stage number`);
}

/* ---- 5. Real-time ascent: upper stage lights after booster burnout ---- */
{
  const editor = new Editor(); editor.loadPreset('earthObservation');
  const bodies = createSolarSystem(); const earth = bodies.find(b => b.id === 'earth');
  const r = new Rocket(editor.parts);
  r.position = {x: earth.position.x, y: earth.position.y + earth.radius + terrainHeight(Math.PI / 2, earth) + r.supportExtent(0, 1)};
  r.velocity = {x: earth.velocity.x, y: earth.velocity.y};
  r.angle = 0; r.landed = true; r.primaryBody = earth; r.body = earth;
  r.nextStage(); r.throttle = 1;
  const idle = {pressed: () => false};
  let upperBurning = false;
  for (let i = 0; i < 60 * 260; i++) {
    updateOrbits(bodies, 1 / 60); controlRocket(r, idle, 1 / 60); stepRocket(r, bodies, 1 / 60);
    if (r.stageNumber === 2 && r.actualThrust > 0) upperBurning = true;
    if (r.crashed) break;
  }
  ok(upperBurning, 'earthObservation ascent: vacuum upper stage ignites after booster burnout');
  eq(r.crashed, false, 'earthObservation ascent: no crash during the burn');
  near(r.fuel, 0, 1e-3, 'earthObservation ascent: upper-stage propellant fully used');
  ok(r.payloadAttached, 'earthObservation ascent: payload still attached at final cutoff');
}

/* ---- 5b. Manual mid-burn separation (Game.stage() path) is logged ------ */
{
  const bodies = createSolarSystem();
  const r = new Rocket(buildStack(CUSTOM.threeStage.top));
  placeInOrbit(r, bodies);
  r.nextStage(); r.throttle = 1;
  for (let i = 0; i < 120; i++) stepRocket(r, bodies, 1 / 60);
  const left = r.currentFuel;
  ok(left > 0, 'manual staging: booster still has propellant when the player separates');
  const from = r.stageNumber;
  ok(r.nextStage(), 'manual staging: separation allowed mid-burn');
  r.recordStageSeparation(from, 'MANUAL', 300000);       // exactly what Game.stage() does
  for (let i = 0; i < 120; i++) stepRocket(r, bodies, 1 / 60);
  const sep = r.flightEvents.filter(e => e.type === 'STAGE_SEPARATION');
  eq(sep.length, 1, 'manual staging: one separation event');
  eq(sep[0].fromStage, 1, 'manual staging: event from-stage');
  eq(sep[0].toStage, 2, 'manual staging: event to-stage');
  eq(sep[0].trigger, 'MANUAL', 'manual staging: event trigger');
  ok(r.flightEvents.some(e => e.type === 'NEXT_STAGE_IGNITION' && e.stage === 2), 'manual staging: stage 2 ignition logged');
  eq(r.activeEngine.thrust, D.vacuumEngine.thrust, 'manual staging: stage 2 engine lit');
  ok(r.actualThrust > 0, 'manual staging: stage 2 producing thrust');
  near(r.mass + 0, massOf(CUSTOM.threeStage.top.slice(0, 2)) - (D.mediumTank.fuelCapacity - r.currentFuel), 1e-6,
    'manual staging: unburned booster propellant leaves with the booster');
}

/* ---- 6. Save/load keeps the post-separation stage state ---------------- */
{
  const store = new Map();
  globalThis.localStorage = {setItem: (k, v) => store.set(k, v), getItem: k => store.get(k) || null};
  const parts = buildStack(CUSTOM.threeStage.top);
  const mk = () => ({bodies: [{id: 'earth'}], missions: {index: 0},
    editor: {budgetProfile: 'discovery', snapshot: () => parts.map(p => ({...p})), setBudgetProfile() {}, restore() {}},
    rocket: null,
    launch(b) { this.rocket = new Rocket(parts); this.rocket.body = b; this.rocket.primaryBody = b; this.rocket.refresh(); }});
  const g = mk(); g.launch({id: 'earth'});
  g.rocket.nextStage(); g.rocket.nextStage(); g.rocket.burn(1000);
  const fuel = g.rocket.fuel, mass = g.rocket.mass;
  SaveManager.save(g);
  const l = mk(); SaveManager.load(l);
  eq(l.rocket.stageNumber, 2, 'save/load: stage number survives');
  eq(l.rocket.totalStages, 3, 'save/load: total stages survive');
  near(l.rocket.fuel, fuel, 1e-6, 'save/load: per-stage fuel survives');
  near(l.rocket.mass, mass, 1e-6, 'save/load: mass after separation survives');
}

console.log(`${checks} checks passed: 2/3/4-stage and all mission-preset staging order, engine ignition, ` +
  'no stranded fuel, payload stays attached, mass after separation, sequential Δv, save/load stage state');
