import assert from 'node:assert/strict';
import {assessMission, MISSION_PROFILES} from '../js/construction/missionSystems.js';
const weak = assessMission([{type:'probeCore'}], {mass:120, engines:0, twr:0}, 'earthObservation');
assert.equal(weak.launchReady, false);
assert.equal(weak.scienceReady, false);
assert.ok(weak.warnings.length >= 3);
const capable = assessMission([
 {type:'probeCore'}, {type:'science'}, {type:'science'}, {type:'solarArray3'}, {type:'solarPanel'},
 {type:'antenna'}, {type:'highGainAntenna'}, {type:'reactionWheel'}
], {mass:1200, engines:1, twr:1.4}, 'earthObservation');
assert.equal(capable.launchReady, true);
assert.equal(capable.scienceReady, true);
assert.equal(capable.powerReady, true);
assert.equal(capable.commsReady, true);
assert.equal(capable.controlReady, true);
assert.equal(capable.score, 100);
assert.ok(MISSION_PROFILES.lunar.science > MISSION_PROFILES.technology.science);
const batteryOnly = assessMission([{type:'battery'}, {type:'probeCore'}], {mass:200, engines:1, twr:1.2}, 'technology');
assert.equal(batteryOnly.systems.draw, 2, 'no phantom base load; only configured component draw is counted');
assert.equal(batteryOnly.powerReady, false, 'battery storage cannot masquerade as continuous generation');
assert.ok(batteryOnly.warnings.some(w => w.includes('operating load')));
console.log('9 checks passed: mission science, power, comms, control and launch feasibility');
