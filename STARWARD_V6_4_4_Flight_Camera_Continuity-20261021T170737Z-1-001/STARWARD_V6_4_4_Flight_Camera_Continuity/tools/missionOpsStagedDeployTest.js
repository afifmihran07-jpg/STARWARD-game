/* Regression test for audit findings B-2 / B-3 (mission operations, deployment
 * and debrief disconnected from the live game) and their interaction with
 * the Phase 1 staging fix.
 *
 * Drives the REAL Game methods — launch(), update() (the FLIGHT/MAP physics
 * substep loop), the DEPLOY / SCIENCE / DOWNLINK / EVALUATE handlers and
 * SaveManager — on a Game built from its prototype with a minimal DOM stub,
 * so the wiring in js/game.js itself is what is tested.
 *
 * Seeded orbits are a TEST FIXTURE ONLY, not evidence of launch-to-orbit. */
import assert from 'node:assert/strict';

/* ---------------- minimal DOM / browser stub (no layout, no rendering) ---- */
const elements = new Map();
const stubElement = id => ({
  id, textContent: '', innerHTML: '', hidden: false, disabled: false, value: '',
  dataset: {}, scrollTop: 0, scrollHeight: 500, onclick: null,
  style: {setProperty() {}},
  classList: {toggle() {}, add() {}, remove() {}, contains: () => false},
  setAttribute() {}, getAttribute: () => null, addEventListener() {}, focus() {},
  appendChild: n => n, append() {}, remove() {},
  querySelector: () => null, querySelectorAll: () => [],
  replaceChildren(...nodes) { this.textContent = nodes.map(n => typeof n === 'string' ? n : '\n').join(''); }
});
function element(id) {
  if (!elements.has(id)) elements.set(id, stubElement(id));
  return elements.get(id);
}
globalThis.document = {
  querySelector: sel => (/^#[\w-]+$/.test(sel) ? element(sel.slice(1)) : null),
  querySelectorAll: () => [],
  createElement: () => stubElement(null),
  body: {dataset: {}, classList: {toggle() {}, add() {}, remove() {}}},
  activeElement: null
};
globalThis.location = {search: ''};
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;
const store = new Map();
globalThis.localStorage = {setItem: (k, v) => store.set(k, v), getItem: k => store.get(k) || null};

const {Game} = await import('../js/game.js');
const {Editor} = await import('../js/construction/editor.js');
const {createSolarSystem} = await import('../js/celestial/solarSystem.js');
const {MissionManager} = await import('../js/missions/missionManager.js');
const {ManeuverNode} = await import('../js/trajectory/maneuverNode.js');
const {TrajectoryPredictor} = await import('../js/trajectory/trajectoryPredictor.js');
const {RocketPart} = await import('../js/rocket/rocketPart.js');
const {attachmentSlots} = await import('../js/rocket/attachmentSystem.js');
const {PART_DEFINITIONS: D} = await import('../js/rocket/partDefinitions.js');
const {setMissionProfile} = await import('../js/ui/buildUI.js');
const {orbitElements} = await import('../js/physics/orbitalMechanics.js');
const {SaveManager} = await import('../js/save/saveManager.js');

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); checks++; };

function makeGame() {
  const g = Object.create(Game.prototype);
  Object.assign(g, {
    canvas: {width: 1280, height: 720, style: {}, classList: {add() {}, remove() {}}},
    camera: {zoom: 1, x: 0, y: 0, limits() {}, setZoom(z) { this.zoom = z; }, focus() {}, update() {}},
    bodies: createSolarSystem(), editor: new Editor(),
    input: {pressed: () => false, pressedOnce: () => false, edges: new Set(), mouse: {x: 0, y: 0, down: false}},
    predictor: new TrajectoryPredictor(), node: new ManeuverNode(), missions: new MissionManager(),
    mode: 'BUILD', debug: false, paused: false, warp: 1, rocket: null, orbit: null, plannedPoints: [],
    flightZoomScale: 1.2, flightReveal: 0, launches: 0, physicsSteps: 0,
    missionOperations: null, deployedSpacecraft: null, spacecraftOrbit: null, missionLaunchRecord: null,
    opsAccum: 0, seededTestOrbit: false
  });
  g.selected = g.bodies[1];
  g.toasts = [];
  g.toast = msg => { g.toasts.push(msg); };
  return g;
}

/** Advance the real game loop (update() runs the physics substeps). */
function run(g, seconds) { for (let i = 0; i < Math.round(seconds * 60); i++) g.update(1 / 60); }

/** Physical state snapshot, to prove UI/panel code does not mutate physics. */
const snap = v => v && JSON.stringify({p: v.position, v: v.velocity, a: v.angle, f: v.stageFuel, m: v.mass});

/* ---------------------------------------------------------------------- */
/* 1. 3-group preset staged down to its payload stack, seeded 500 km orbit  */
/* ---------------------------------------------------------------------- */
function stagedPreset(preset, altitudeKm) {
  const g = makeGame();
  g.debug = true;                                   // seed path is debug-only
  ok(g.seedOrbitForTesting(altitudeKm, preset), `${preset}: seeded test orbit`);
  const r = g.rocket;
  eq(g.mode, 'FLIGHT', `${preset}: in FLIGHT after launch`);
  ok(g.missionOperations && !g.missionOperations.deployed, `${preset}: fresh operations state at launch`);
  eq(r.stageNumber, 2, `${preset}: staged down to the upper stage`);
  eq(r.totalStages, 3, `${preset}: three stage groups as built`);
  ok(r.payloadAttached, `${preset}: payload still attached before DEPLOY`);
  run(g, 1);
  return g;
}

{
  const g = stagedPreset('weather', 500);
  const r = g.rocket;
  // DEPLOY must be refused while the engine burns, enabled once cut off.
  r.throttle = 1; g.update(1 / 60); g.refreshMissionOpsPanel();
  eq(element('deploySpacecraft').disabled, true, 'weather: DEPLOY disabled with engine burning');
  r.throttle = 0; run(g, 2); g.refreshMissionOpsPanel();
  eq(element('deploySpacecraft').disabled, false, 'weather: DEPLOY enabled in verified orbit after cutoff');
  eq(element('missionDownlink').disabled, true, 'weather: DOWNLINK disabled before deployment');

  const carrierMassBefore = r.mass, upperFuel = r.currentFuel;
  const result = g.deployMission();
  ok(result.ok, 'weather: deployment succeeds: ' + result.message);
  const craft = g.deployedSpacecraft;
  ok(craft && craft !== r, 'weather: spacecraft is an independent vehicle');
  ok(g.missionOperations.deployed, 'weather: operations marked deployed');
  eq(r.stageNumber, 2, 'weather: carrier keeps its stage number after deployment');
  eq(r.totalStages, 3, 'weather: stage count is not renumbered by deployment');
  eq(r.currentFuel, upperFuel, 'weather: carrier upper-stage propellant untouched by deployment');
  ok(Math.abs(r.mass + craft.mass - carrierMassBefore) < 1e-6, 'weather: mass is conserved across deployment');
  ok(!craft.parts.some(p => D[p.type].thrust || D[p.type].fuelCapacity), 'weather: spacecraft has no engine or tank');
  eq(element('stageAction').textContent, 'SPACECRAFT DEPLOYED', 'weather: stage button reports SPACECRAFT DEPLOYED');
  eq(g.deployMission().ok, false, 'weather: second deployment refused');

  // Operations activate and the spacecraft is integrated by stepRocket.
  const craftStart = {...craft.position};
  run(g, 5);
  ok(g.missionOperations.active, 'weather: operations activate after deployment');
  ok(Math.hypot(craft.position.x - craftStart.x, craft.position.y - craftStart.y) > 1000, 'weather: spacecraft is stepped by stepRocket');
  ok(g.spacecraftOrbit && g.spacecraftOrbit.bound, 'weather: spacecraftOrbit tracked and bound');
  g.refreshMissionOpsPanel();
  eq(element('missionDownlink').disabled, false, 'weather: DOWNLINK enabled once operations are active');
  eq(element('missionInstrumentToggle').disabled, false, 'weather: SCIENCE enabled once operations are active');

  // SCIENCE: OFF stops data, ON accumulates it (instrument defaults to on).
  if (g.missionOperations.instrumentOn) g.toggleScienceInstrument();
  g.refreshMissionOpsPanel();
  eq(element('missionInstrumentToggle').textContent, 'SCIENCE: OFF', 'weather: science label OFF');
  const offData = g.missionOperations.dataStoredMB;
  run(g, 10);
  eq(g.missionOperations.dataStoredMB, offData, 'weather: no data with the instrument off');
  g.toggleScienceInstrument(); g.refreshMissionOpsPanel();
  eq(element('missionInstrumentToggle').textContent, 'SCIENCE: ON', 'weather: science label ON');
  run(g, 120);
  const stored = g.missionOperations.dataStoredMB;
  ok(stored > offData + 1, `weather: data accumulates with SCIENCE ON (${stored.toFixed(2)} MB)`);

  // The same clock runs in MAP mode.
  g.mode = 'MAP';
  run(g, 30);
  ok(g.missionOperations.dataStoredMB > stored, 'weather: operations keep running in MAP mode');
  g.mode = 'FLIGHT';

  // Panel/UI refreshes must not touch physical state.
  const before = [snap(r), snap(craft)];
  g.refreshMissionOpsPanel();
  eq(JSON.stringify([snap(r), snap(craft)]), JSON.stringify(before), 'weather: panel refresh does not change physics state');
  ok(element('opsData').textContent.endsWith('MB stored'), 'weather: data read-out populated');
  ok(element('opsEvents').textContent.includes('Spacecraft deployed'), 'weather: operations log shows deployment');
  eq(element('missionOpsPanel').scrollTop, element('missionOpsPanel').scrollHeight, 'weather: log scrolled to newest entry');

  // DOWNLINK moves data from stored to downlinked.
  const pre = g.missionOperations.dataStoredMB;
  const dl = g.downlinkMission();
  ok(dl.ok, 'weather: downlink succeeds: ' + (dl.message || dl.amount));
  ok(g.missionOperations.dataDownlinkedMB > 0 && g.missionOperations.dataStoredMB < pre, 'weather: downlink moves the data');

  // EVALUATE grades it and shows the debrief. 500 km misses the 700 km
  // weather target, so this is a partial success — graded honestly.
  const debrief = g.evaluateMission();
  eq(debrief.grade, 'PARTIAL SUCCESS', 'weather @500 km: graded partial (target 700 km)');
  eq(element('missionDebrief').hidden, false, 'weather: debrief panel unhidden');
  eq(element('debriefGrade').textContent, 'PARTIAL SUCCESS', 'weather: grade shown');
  ok(element('debriefSummary').textContent.startsWith('DEBUG SEEDED TEST ORBIT'), 'weather: seeded orbit labelled in debrief');
  ok(element('debriefIssues').textContent.includes('Target orbit not met'), 'weather: failures listed');
  eq(element('missionDebrief').dataset.grade, 'partial', 'weather: grade styling hook set');

  // Save/load: operations are dropped clearly, never resumed stale.
  SaveManager.save(g);
  g.toasts.length = 0;
  ok(SaveManager.load(g), 'weather: save loads');
  ok(g.toasts.some(t => /mission-operations progress are not saved/.test(t)), 'weather: load explains ops were dropped');
  eq(g.deployedSpacecraft, null, 'weather: no stale spacecraft after load');
  ok(g.missionOperations && !g.missionOperations.deployed && g.missionOperations.dataStoredMB === 0, 'weather: fresh operations after load');
  eq(g.seededTestOrbit, true, 'weather: seeded-test label survives load');

  // A new launch starts clean too.
  g.launch();
  eq(g.deployedSpacecraft, null, 'relaunch: no stale spacecraft');
  eq(g.missionOperations.dataDownlinkedMB, 0, 'relaunch: no stale data');
  eq(element('missionDebrief').hidden, true, 'relaunch: old debrief hidden');
  eq(g.seededTestOrbit, false, 'relaunch: test-orbit label cleared');
}

/* ---- 2. Same staged path at the profile's target altitude: complete ---- */
{
  const g = stagedPreset('weather', 700);
  g.rocket.throttle = 0; run(g, 2);
  ok(g.deployMission().ok, 'weather @700: deployment');
  run(g, 180);
  ok(g.downlinkMission().ok, 'weather @700: downlink');
  const d = g.evaluateMission();
  eq(d.grade, 'COMPLETE SUCCESS', 'weather @700 km: complete success: ' + d.failures.join(' | '));
}

/* ---- 3. earthObservation as shipped: no antenna, so downlink is refused - */
{
  const g = stagedPreset('earthObservation', 500);
  g.rocket.throttle = 0; run(g, 2);
  ok(g.deployMission().ok, 'earthObservation: deployment');
  run(g, 120);
  ok(g.missionOperations.dataStoredMB > 0, 'earthObservation: science data accumulates');
  const dl = g.downlinkMission();
  eq(dl.ok, false, 'earthObservation: downlink refused (preset has no antenna)');
  ok(/communications capability 0\/1/.test(dl.message), 'earthObservation: refusal names the comms shortfall');
  eq(g.evaluateMission().grade, 'PARTIAL SUCCESS', 'earthObservation: partial until an antenna is fitted');
}

/* ---- 4. Un-staged carrier with a separator below the payload ----------- */
{
  const g = makeGame();
  const stack = ['noseCone', 'probeCore', 'science', 'battery', 'antenna', 'solarPanel', 'reactionWheel',
    'separator', 'mediumTank', 'vacuumEngine', 'decoupler', 'largeTank', 'largeTank', 'bigEngine'];
  const parts = []; let prev = null;
  for (const t of stack) {
    const s = prev ? attachmentSlots(t, prev, 0)[1] : {x: 0, y: 0};
    const p = new RocketPart(t, s.x, s.y); parts.push(p); prev = p;
  }
  g.editor.parts = parts;
  setMissionProfile('earthObservation');
  g.launch();
  const r = g.rocket;
  eq(r.stageIndex, -1, 'unstaged: never ignited');
  // Place the whole, un-staged stack in a 500 km circular orbit (fixture).
  const earth = r.body, R = earth.radius + 500000, v = Math.sqrt(earth.mu / R);
  r.position = {x: earth.position.x, y: earth.position.y + R};
  r.velocity = {x: earth.velocity.x - v, y: earth.velocity.y};
  r.landed = false; r.hasFlown = true; r.throttle = 0; r.spool = 0;
  run(g, 1);
  const fuelBefore = r.fuel, groupsBefore = r.groups.length;
  const res = g.deployMission();
  ok(res.ok, 'unstaged: deployment through the separator: ' + res.message);
  eq(r.groups.length, groupsBefore - 1, 'unstaged: only the payload group left the carrier');
  eq(r.fuel, fuelBefore, 'unstaged: carrier keeps all of its propellant');
  eq(r.totalStages, 3, 'unstaged: stage count unchanged by deployment');
  ok(g.deployedSpacecraft.parts.some(p => p.type === 'antenna'), 'unstaged: payload hardware on the spacecraft');
  run(g, 5);
  ok(g.missionOperations.active, 'unstaged: operations activate');
  run(g, 120);
  ok(g.missionOperations.dataStoredMB > 0, 'unstaged: data accumulates');
  ok(g.downlinkMission().ok, 'unstaged: downlink succeeds');
  const d = g.evaluateMission();
  eq(d.grade, 'COMPLETE SUCCESS', 'unstaged @500 km earthObservation profile: complete: ' + d.failures.join(' | '));
  eq(element('debriefGrade').textContent, 'COMPLETE SUCCESS', 'unstaged: grade shown');
  ok(!element('debriefSummary').textContent.includes('DEBUG'), 'unstaged: non-debug path is not labelled as a debug seed');
  ok(d.fuelUsed === 0 && d.fuelCapacity > 0, 'unstaged: debrief records launch propellant and zero burned');
}

/* ---- 5. Seed path is debug-only ----------------------------------------- */
{
  const g = makeGame();
  eq(g.seedOrbitForTesting(500, 'earthObservation'), false, 'seedOrbitForTesting refuses without debug=1');
  eq(g.rocket, null, 'no vehicle created without debug');
}

console.log(`${checks} checks passed: staged and un-staged deployment in a seeded orbit, operations in FLIGHT/MAP, ` +
  'science on/off, downlink, debrief grading, stage labels after deployment, no stale state on load/relaunch, ' +
  'UI does not change physics (seeded orbits are a test fixture, not launch evidence)');
