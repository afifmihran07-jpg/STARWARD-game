/* A3 / P0-6: an over-budget design cannot reach FLIGHT by any route. */
import assert from 'node:assert/strict';
import {makeGame} from './_gameHarness.js';
import {Rocket} from '../js/rocket/rocket.js';
import {missionBreakdown, profileById, budgetLevel} from '../js/construction/budget.js';
import {SaveManager} from '../js/save/saveManager.js';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.equal(a, b, m); checks++; };

/** A real preset, then funded with a class too small for it. */
function overBudgetGame() {
  const g = makeGame();
  g.loadPresetRocket('weather');                 // ~$578M
  g.editor.setBudgetProfile('smex');             // $150M cap
  const cost = missionBreakdown(g.editor.parts, new Rocket(g.editor.parts).stats()).total;
  assert.equal(budgetLevel(cost, profileById('smex').budget).key, 'over', 'fixture is over budget');
  g.toasts.length = 0;
  return g;
}
/** Press a one-shot key through the real Game.keys() handler. */
function press(g, code) {
  let pending = true;
  g.input.pressedOnce = k => { if (pending && k === code) { pending = false; return true; } return false; };
  g.keys();
  g.input.pressedOnce = () => false;
}

// Route 1: Game.launch() directly (LAUNCH button handler).
{
  const g = overBudgetGame();
  g.launch();
  eq(g.rocket, null, 'launch(): no vehicle created when over budget');
  ok(g.toasts.some(t => /^Over budget by/.test(t)), 'launch(): toast explains the budget block');
  ok(g.toasts.some(t => /SMALL EXPLORER cap/.test(t)), 'launch(): toast names the budget class');
}
// Route 2: FLIGHT tab -> setMode('FLIGHT').
{
  const g = overBudgetGame();
  g.setMode('FLIGHT');
  eq(g.rocket, null, 'FLIGHT tab: no vehicle');
  eq(g.mode, 'BUILD', 'FLIGHT tab: returned to BUILD');
}
// Route 3: M key from BUILD (to MAP), then M again (MAP -> FLIGHT).
{
  const g = overBudgetGame();
  press(g, 'KeyM');
  eq(g.mode, 'MAP', 'M from BUILD opens the map without launching');
  eq(g.rocket, null, 'M: no vehicle on the map');
  press(g, 'KeyM');
  eq(g.rocket, null, 'M again (MAP -> FLIGHT): still no vehicle');
  eq(g.mode, 'BUILD', 'M again: sent back to BUILD');
}
// Route 4: LAUNCH TO SELECTED on the map (#mapLaunch -> launch(selected)).
{
  const g = overBudgetGame();
  g.launch(g.bodies.find(b => b.id === 'mars'));
  eq(g.rocket, null, 'LAUNCH TO SELECTED: no vehicle');
}
// Route 5: loading a saved flight whose design is over the saved budget class.
{
  const g = makeGame();
  g.loadPresetRocket('weather');
  g.launch();
  assert.ok(g.rocket, 'fixture: flight to save');
  SaveManager.save(g);
  const saved = JSON.parse(localStorage.getItem('starward-save'));
  saved.budgetProfile = 'smex';                  // same design, smaller cap
  localStorage.setItem('starward-save', JSON.stringify(saved));
  const l = makeGame();
  SaveManager.load(l);
  eq(l.rocket, null, 'loading an over-budget flight save does not put it in flight');
  ok(l.toasts.some(t => /^Over budget by/.test(t)), 'load: budget block explained');
}
// Within budget, every route still works.
{
  const g = makeGame();
  g.loadPresetRocket('weather');                 // auto-funded New Frontiers
  g.launch();
  ok(g.rocket && g.mode === 'FLIGHT', 'within budget: launch() flies');
  const g2 = makeGame();
  g2.loadPresetRocket('earthObservation');
  g2.setMode('FLIGHT');
  ok(g2.rocket && g2.mode === 'FLIGHT', 'within budget: FLIGHT tab flies');
}
// Debug seeding uses auto-funded presets, so it is within budget and labelled.
{
  const g = makeGame({debug: true});
  ok(g.seedOrbitForTesting(500, 'weather'), 'debug seed works for a funded preset');
  ok(g.seededTestOrbit, 'debug seed stays labelled');
  ok(g.toasts.some(t => /DEBUG TEST ORBIT/.test(t)), 'debug seed toast is labelled');
}

console.log(`${checks} checks passed: budget enforced inside Game.launch() for LAUNCH, FLIGHT tab, M key, LAUNCH TO SELECTED and save load`);
