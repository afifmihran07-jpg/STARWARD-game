/* =========================================================================
   costReport.js — prints the NASA-style estimate for the starter build.
   Run with:  node tools/costReport.js
   ========================================================================= */
import {missionBreakdown, formatMoney, profileById} from '../js/construction/budget.js';
import {Editor} from '../js/construction/editor.js';

const editor = new Editor();
const bd = missionBreakdown(editor.parts);
const profile = profileById(editor.budgetProfile);
const pct = (bd.total / profile.budget) * 100;

console.log('Starter build — budget class: ' + profile.name +
  ' (' + formatMoney(profile.budget) + ')');
console.log('');
for (const l of bd.lines) {
  console.log('  ' + (l.label + ' ').padEnd(38, '.') + ' ' + formatMoney(l.value).padStart(9));
}
console.log('  ' + ('TOTAL MISSION COST ').padEnd(38, '.') + ' ' +
  formatMoney(bd.total).padStart(9) + '   ' + pct.toFixed(1) + '% of cap');
console.log('');
console.log('  launch: ' + bd.launchVehicle + ' — ' + bd.launchSource);
console.log('  hardware by subsystem:');
for (const [cat, v] of Object.entries(bd.hardwareByCategory).sort((a, b) => b[1] - a[1])) {
  console.log('    ' + cat.padEnd(14) + formatMoney(v));
}
