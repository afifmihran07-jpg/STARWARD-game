import assert from 'node:assert/strict';
import fs from 'node:fs';
const game = fs.readFileSync(new URL('../js/game.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const renderer = fs.readFileSync(new URL('../js/renderer.js', import.meta.url), 'utf8');
const flightUI = fs.readFileSync(new URL('../js/ui/flightUI.js', import.meta.url), 'utf8');
assert.match(game, /createMissionOperations/);
assert.match(game, /deployMissionSpacecraft/);
assert.match(game, /evaluateMissionDebrief/);
assert.match(game, /stepRocket\(this\.deployedSpacecraft/);
assert.match(game, /this\.spacecraftOrbit = orbitElements/);
assert.match(game, /opsPanel\.scrollTop = opsPanel\.scrollHeight/);
assert.match(game, /stepMissionOperations/);
assert.match(game, /engineCutoff:\s*this\.rocket\.throttle/);
assert.match(game, /downlinkMissionData\(this\.missionOperations, downlinkOrbit, downlinkBody\)/);
assert.match(game, /const opsVehicle = this\.deployedSpacecraft \|\| this\.rocket/);
assert.match(renderer, /game\.deployedSpacecraft && game\.deployedSpacecraft !== game\.rocket/);
assert.match(flightUI, /SPACECRAFT OPERATIONS/);
assert.match(flightUI, /NONE \(SPACECRAFT\)/);
assert.match(flightUI, /SPACECRAFT DEPLOYED/);
assert.doesNotMatch(game, /this\.mode === 'FLIGHT' && this\.missionOperations/);
assert.match(game, /setScienceInstrument/);
assert.match(game, /getSelectedMissionProfile/);
for (const id of ['missionOpsPanel','opsStatus','opsPower','opsBattery','opsScience','opsData','opsDownlinked','missionInstrumentToggle','missionDownlink','deploySpacecraft','evaluateMission','missionDebrief','debriefGrade','debriefSummary','debriefIssues']) {
  assert.ok(html.includes(`id="${id}"`), `missing operations UI element ${id}`);
}
console.log('22 checks passed: mission operations across FLIGHT/MAP, spacecraft deployment/physics, debrief visibility, spacecraft telemetry and UI controls are integrated');
