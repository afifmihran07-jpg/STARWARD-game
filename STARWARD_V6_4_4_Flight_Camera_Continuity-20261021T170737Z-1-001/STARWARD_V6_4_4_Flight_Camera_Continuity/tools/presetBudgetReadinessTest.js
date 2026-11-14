/* A1: every mission preset is 100% ready for its profile, and loading any
 * preset funds it with the smallest budget class that covers its cost. */
import assert from 'node:assert/strict';
import {makeGame, element} from './_gameHarness.js';
import {Editor} from '../js/construction/editor.js';
import {Rocket} from '../js/rocket/rocket.js';
import {MISSION_PRESET_CONFIGS} from '../js/construction/missionPresets.js';
import {assessMission} from '../js/construction/missionSystems.js';
import {missionBreakdown, budgetLevel, BUDGET_PROFILES, smallestProfileFor, profileById} from '../js/construction/budget.js';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, m); checks++; };

/* smallestProfileFor: independent of any preset. */
const caps = BUDGET_PROFILES.map(p => p.budget).sort((a, b) => a - b);
eq(smallestProfileFor(1).budget, caps[0], 'tiny cost -> smallest class');
eq(smallestProfileFor(caps[0]).budget, caps[0], 'cost exactly at a cap fits that cap');
eq(smallestProfileFor(caps[0] + 1).budget, caps[1], 'one dollar over moves up a class');
eq(smallestProfileFor(caps[caps.length - 1] * 10).budget, caps[caps.length - 1], 'unaffordable -> largest class');

const MISSION_PRESETS = ['earthObservation', 'weather', 'communications', 'lunar', 'planetary', 'technology'];

for (const key of Object.keys(MISSION_PRESET_CONFIGS)) {
  const editor = new Editor(); editor.loadPreset(key);
  const stats = new Rocket(editor.parts).stats();
  const cost = missionBreakdown(editor.parts, stats).total;
  if (MISSION_PRESETS.includes(key)) {
    const a = assessMission(editor.parts, stats, MISSION_PRESET_CONFIGS[key].missionProfile);
    eq(a.score, 100, `${key}: 100% readiness (warnings: ${a.warnings.join('; ')})`);
    ok(a.commsReady, `${key}: communications requirement met`);
  }
  // The game's loader picks the class and the design is within it.
  const g = makeGame();
  g.loadPresetRocket(key);
  const profile = profileById(g.editor.budgetProfile);
  eq(profile.id, smallestProfileFor(cost).id, `${key}: smallest covering class selected`);
  ok(budgetLevel(cost, profile.budget).key !== 'over', `${key}: within its selected budget`);
  eq(element('launchButton').disabled, false, `${key}: LAUNCH enabled after loading`);
  ok(g.toasts.at(-1).includes(profile.name + '-class budget'), `${key}: toast names the budget class`);
}

for (const key of ['earthObservation', 'technology']) {
  const editor = new Editor(); editor.loadPreset(key);
  const core = editor.parts.find(p => p.type === 'probeCore');
  const antenna = editor.parts.filter(p => p.type === 'antenna');
  eq(antenna.length, 1, `${key}: exactly one Comms Antenna added`);
  ok(Math.abs(antenna[0].y - core.y) < 1e-9, `${key}: antenna mounted on the probe core`);
  const r = new Rocket(editor.parts);
  const payload = r.groups[r.groups.length - 1];
  ok(payload.some(p => p.type === 'antenna'), `${key}: antenna rides in the payload stage`);
}

console.log(`${checks} checks passed: mission presets 100% ready incl. comms, presets funded by the smallest covering budget class`);
