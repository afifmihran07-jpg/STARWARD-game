/* =========================================================================
   budgetTest.js — validates the NASA budget model outside the browser.

   Run with:  node tools/budgetTest.js   (or: npm test)
   Only DOM-free modules are imported, so this runs headless.
   ========================================================================= */
import assert from 'node:assert';
import {
  missionBreakdown, formatMoney, budgetLevel, partCost, launchServices,
  hardwareCost, BUDGET_PROFILES, profileById, DEFAULT_BUDGET,
  OPS_RATE, SEP_RATE, CONTINGENCY_RATE, RESERVE_RATE
} from '../js/construction/budget.js';
import {Editor, buildCost} from '../js/construction/editor.js';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log('  ok  ' + name);
};

check('money formatting matches NASA-style magnitudes', () => {
  assert.strictEqual(formatMoney(0), '$0');
  assert.strictEqual(formatMoney(61234), '$61.2k');
  assert.strictEqual(formatMoney(999500), '$1M');
  assert.strictEqual(formatMoney(67500000), '$67.5M');
  assert.strictEqual(formatMoney(466300000), '$466M');
  assert.strictEqual(formatMoney(850000000), '$850M');
  assert.strictEqual(formatMoney(2500000000), '$2.5B');
  assert.strictEqual(formatMoney(-1500000), '\u2212$1.5M');
});

check('part costs follow the documented $/kg relationships', () => {
  assert.strictEqual(partCost({category: 'COMMAND', mass: 900}), 54000000);
  assert.strictEqual(partCost({category: 'FUEL', mass: 1900}), 11400000);
  assert.strictEqual(partCost({category: 'ENGINE', mass: 1450}), 50750000);
  assert.strictEqual(partCost({category: 'UTILITY', mass: 110}), 13200000);
  assert.ok(partCost({category: 'STRUCTURAL', mass: 0}) >= 1500);
  assert.strictEqual(partCost(null), 0);
});

check('launch ladder uses real vehicle list prices', () => {
  assert.strictEqual(launchServices(0).cost, 0);
  assert.strictEqual(launchServices(5000).vehicle, 'Electron-class');
  assert.strictEqual(launchServices(5000).cost, 7.5e6);
  assert.strictEqual(launchServices(69100).cost, 97e6);    // starter stack
  assert.strictEqual(launchServices(400000).cost, 2.2e9);  // SLS class
  assert.strictEqual(launchServices(69100).vehicle, 'Falcon Heavy');
});

check('budget classes are the real NASA programme caps', () => {
  assert.strictEqual(BUDGET_PROFILES.length, 4);
  assert.strictEqual(profileById('smex').budget, 150e6);
  assert.strictEqual(profileById('discovery').budget, 500e6);
  assert.strictEqual(profileById('newFrontiers').budget, 850e6);
  assert.strictEqual(profileById('flagship').budget, 2.5e9);
  assert.strictEqual(profileById('not-a-profile').id, 'discovery');
  assert.strictEqual(DEFAULT_BUDGET, 500e6);
});

check('breakdown lines sum exactly to the mission total', () => {
  const editor = new Editor();
  editor.loadStarter();
  const bd = missionBreakdown(editor.parts);
  assert.strictEqual(bd.lines.length, 7);
  const sum = bd.lines.reduce((s, l) => s + l.value, 0);
  assert.strictEqual(sum, bd.total);
  // Every loading is computed the way the header comment promises.
  assert.strictEqual(bd.ops, Math.round(OPS_RATE * (bd.hardware + bd.propellant)));
  assert.strictEqual(bd.sep, Math.round(SEP_RATE *
    (bd.hardware + bd.propellant + bd.launch + bd.ops)));
  assert.strictEqual(bd.contingency, Math.round(CONTINGENCY_RATE *
    (bd.hardware + bd.propellant + bd.ops + bd.sep)));
  assert.strictEqual(bd.reserve, Math.round(RESERVE_RATE *
    (bd.hardware + bd.propellant + bd.launch + bd.ops + bd.sep + bd.contingency)));
  // The NASA insight: propellant is rounding error next to hardware.
  assert.ok(bd.propellant < bd.hardware * 0.01,
    'propellant ' + bd.propellant + ' should be <1% of hardware');
});

check('starter design fits the default Discovery budget', () => {
  const editor = new Editor();
  editor.loadStarter();
  const bd = missionBreakdown(editor.parts);
  assert.ok(bd.total > 200e6, 'starter total too low: ' + formatMoney(bd.total));
  assert.ok(bd.total < DEFAULT_BUDGET,
    'starter total ' + formatMoney(bd.total) + ' exceeds the $500M cap');
  assert.notStrictEqual(budgetLevel(bd.total, DEFAULT_BUDGET).key, 'over');
});

check('budget states transition ok → watch → critical → over', () => {
  assert.strictEqual(budgetLevel(100e6, 500e6).key, 'ok');
  assert.strictEqual(budgetLevel(400e6, 500e6).key, 'watch');
  assert.strictEqual(budgetLevel(470e6, 500e6).key, 'critical');
  assert.strictEqual(budgetLevel(510e6, 500e6).key, 'over');
  assert.ok(Math.abs(budgetLevel(250e6, 500e6).pct - 50) < 1e-9);
});

check('editor switches budget profiles and falls back safely', () => {
  const editor = new Editor();
  assert.strictEqual(editor.budget, 500e6);
  assert.strictEqual(editor.budgetProfile, 'discovery');
  editor.setBudgetProfile('flagship');
  assert.strictEqual(editor.budget, 2.5e9);
  editor.setBudgetProfile('nonsense');
  assert.strictEqual(editor.budgetProfile, 'discovery');
  assert.strictEqual(editor.budget, 500e6);
});

check('buildCost compatibility shim matches hardwareCost', () => {
  const editor = new Editor();
  assert.strictEqual(buildCost(editor.parts), hardwareCost(editor.parts));
  // Editing the design changes the bill.
  const before = buildCost(editor.parts);
  editor.parts = editor.parts.slice();
  editor.parts.push({type: 'probeCore', x: 0, y: 0});
  assert.ok(buildCost(editor.parts) > before);
});

console.log('\n' + passed + ' checks passed');
