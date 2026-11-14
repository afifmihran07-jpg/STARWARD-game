import assert from 'node:assert/strict';
import {
  createMissionOperations, hasBoundOrbit, stepMissionOperations,
  downlinkMissionData, setScienceInstrument
} from '../js/missions/missionOperations.js';

const earth = {id:'earth', radius: 6_371_000};
const validOrbit = {r: 7_000_000, semiMajor: 7_000_000, eccentricity: 0.01,
  periapsis: 6_930_000, apoapsis: 7_070_000};
const suborbital = {...validOrbit, periapsis: 6_000_000};
assert.equal(hasBoundOrbit(validOrbit, earth), true);
assert.equal(hasBoundOrbit(suborbital, earth), false);
assert.equal(hasBoundOrbit({...validOrbit, eccentricity: 1.1}, earth), false);
assert.equal(hasBoundOrbit({...validOrbit, apoapsis:validOrbit.periapsis-1}, earth), false);
assert.equal(hasBoundOrbit({...validOrbit, r:NaN}, earth), false);

const parts = [
  {type:'science'}, {type:'science'}, {type:'solarArray3'}, {type:'battery'},
  {type:'highGainAntenna'}, {type:'probeCore'}, {type:'reactionWheel'}
];
const ops = createMissionOperations(parts, 'earthObservation');
assert.equal(ops.active, false);
stepMissionOperations(ops, 86400, suborbital, earth);
assert.equal(ops.active, false, 'suborbital flight must not unlock operations');
stepMissionOperations(ops, 86400, validOrbit, earth, {engineCutoff:false});
assert.equal(ops.active, false, 'a bound osculating trajectory while thrust is active must not unlock operations');
ops.deployed = true;
stepMissionOperations(ops, 86400, validOrbit, earth, {engineCutoff:true});
assert.equal(ops.active, true, 'bound orbit should unlock operations');
assert.ok(ops.dataStoredMB > 0, 'science operations should generate data');
const stored = ops.dataStoredMB;
setScienceInstrument(ops, false);
stepMissionOperations(ops, 86400, validOrbit, earth);
assert.equal(ops.dataStoredMB, stored, 'turning off the instrument stops data collection');
setScienceInstrument(ops, true);
const result = downlinkMissionData(ops, validOrbit, earth);
assert.equal(result.ok, true);
assert.ok(ops.dataDownlinkedMB > 0);
assert.ok(ops.dataStoredMB < stored, 'downlink reduces stored data');
const beforeInvalidOrbit = ops.dataStoredMB;
stepMissionOperations(ops, 60, suborbital, earth, {engineCutoff:true});
assert.equal(ops.dataStoredMB, beforeInvalidOrbit, 'science pauses if the spacecraft no longer has a valid orbit');
assert.match(ops.status, /paused/i);
const beforeBurnPause = ops.dataStoredMB;
stepMissionOperations(ops, 60, validOrbit, earth, {engineCutoff:false});
assert.equal(ops.dataStoredMB,beforeBurnPause,'operations pause during propulsion activity');
assert.match(ops.status,/propulsion active/i);
stepMissionOperations(ops, 60, validOrbit, earth, {engineCutoff:true});
assert.ok(ops.dataStoredMB > beforeBurnPause,'operations resume after cutoff and valid orbit return');
const mars = {id:'mars',radius:3_389_500};
const wrongBodyOps = createMissionOperations(parts, 'earthObservation'); wrongBodyOps.deployed=true;
stepMissionOperations(wrongBodyOps, 60, validOrbit, mars, {engineCutoff:true});
assert.equal(wrongBodyOps.active,false,'Earth-orbit profiles must not unlock around another body');
assert.match(wrongBodyOps.status,/requires Earth/i);

const weakComms = createMissionOperations(parts.filter(p => p.type !== 'highGainAntenna'), 'weather');
weakComms.deployed = true;
stepMissionOperations(weakComms, 1, validOrbit, earth, {engineCutoff:true});
assert.equal(downlinkMissionData(weakComms, validOrbit, earth).ok, false,
  'insufficient communications must prevent downlink');
const unsupported = createMissionOperations(parts, 'lunar');
unsupported.deployed = true;
stepMissionOperations(unsupported, 86400, validOrbit, earth, {engineCutoff:true});
assert.equal(unsupported.active, false, 'lunar profile must not pretend an Earth orbit is lunar arrival');
assert.match(unsupported.status, /not implemented/i);

const noScience = createMissionOperations([{type:'battery'},{type:'highGainAntenna'}], 'technology');
noScience.deployed = true;
stepMissionOperations(noScience, 3600, validOrbit, earth, {engineCutoff:true});
assert.equal(noScience.dataStoredMB, 0, 'no instrument hardware must not create science data');
assert.equal(noScience.instrumentOn, false, 'instrument defaults off without science hardware');
const noPower = createMissionOperations([{type:'science'},{type:'highGainAntenna'}], 'earthObservation');
noPower.deployed = true; noPower.active = true; noPower.dataStoredMB = 12;
const dataBeforeFailure = noPower.dataStoredMB;
const failedTransfer = downlinkMissionData(noPower, validOrbit, earth);
assert.equal(failedTransfer.ok, false, 'a powerless spacecraft cannot downlink');
assert.equal(noPower.dataStoredMB, dataBeforeFailure, 'failed downlink must not remove stored data');
const beforeBadOrbitTransfer = noPower.dataStoredMB;
assert.equal(downlinkMissionData(noPower, suborbital, earth).ok,false,'suborbital trajectory cannot downlink');
assert.equal(noPower.dataStoredMB,beforeBadOrbitTransfer,'invalid-orbit downlink failure retains stored data');
const powered = createMissionOperations([{type:'science'},{type:'solarArray3'},{type:'battery'},{type:'highGainAntenna'}], 'earthObservation');
powered.deployed = true;
stepMissionOperations(powered, 3600, validOrbit, earth, {engineCutoff:true});
assert.ok(powered.powerGenerated > 0 && powered.energyConsumed > 0, 'generation and consumption are tracked');
assert.ok(powered.battery >= 0 && powered.battery <= powered.maxBattery, 'battery remains within capacity');
const commsOps = createMissionOperations([{type:'probeCore'},{type:'solarArray3'},{type:'battery'},{type:'highGainAntenna'}], 'communications');
commsOps.deployed = true;
stepMissionOperations(commsOps, 86400, validOrbit, earth, {engineCutoff:true});
assert.ok(commsOps.dataStoredMB > 0, 'communications profile accumulates command telemetry without science instruments');
assert.equal(downlinkMissionData(commsOps, validOrbit, earth).ok, true, 'communications telemetry can be downlinked');
const mixedCommsOps = createMissionOperations([{type:'probeCore'},{type:'science'},{type:'solarArray3'},{type:'battery'},{type:'highGainAntenna'}], 'communications');
mixedCommsOps.deployed = true;
stepMissionOperations(mixedCommsOps, 60, validOrbit, earth, {engineCutoff:true});
assert.ok(mixedCommsOps.dataStoredMB > commsOps.systems.telemetryRate, 'science and telemetry data both accumulate when both systems are fitted');
assert.match(mixedCommsOps.status, /Science and communications telemetry/);
const rtgOps = createMissionOperations([{type:'rtg'},{type:'science'},{type:'battery'},{type:'highGainAntenna'}], 'earthObservation');
rtgOps.deployed = true;
stepMissionOperations(rtgOps, 3600, validOrbit, earth, {engineCutoff:true});
const rtgGeneration = rtgOps.currentGeneration;
stepMissionOperations(rtgOps, 3600, validOrbit, earth, {engineCutoff:true});
assert.equal(rtgGeneration, 22, 'RTG output is not multiplied by sunlight factor');
assert.equal(rtgOps.currentGeneration, 22, 'RTG output remains constant across sunlight-cycle steps');
console.log('32 checks passed: finite bound-orbit and Earth-body gates, orbit-loss/propulsion pauses, science/telemetry data, RTG/solar distinction, no-instrument/power cases, energy bounds, instrument control, safe downlink and unsupported destination honesty');
