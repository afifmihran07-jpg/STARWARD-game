import assert from 'node:assert/strict';
import {Rocket} from '../js/rocket/rocket.js';
import {deploySpacecraft, hasBoundOrbit} from '../js/missions/missionOperations.js';
const body = {radius:6_371_000, position:{x:0,y:0}, velocity:{x:0,y:0}, atmosphere:{height:100_000}};
const orbit = {r:6_871_000, semiMajor:6_871_000, eccentricity:0.01, periapsis:6_802_290, apoapsis:6_939_710};
const parts = [
 {id:'engine',type:'bigEngine',x:0,y:10}, {id:'tank',type:'wideTank',x:0,y:8},
 {id:'joint',type:'decoupler',x:0,y:5}, {id:'core',type:'probeCore',x:0,y:3},
 {id:'science',type:'science',x:0,y:2}, {id:'solar',type:'solarPanel',x:1,y:1},
 {id:'battery',type:'battery',x:0,y:1}, {id:'antenna',type:'highGainAntenna',x:0,y:0}
];
const carrier = new Rocket(parts);
carrier.position={x:6_871_000,y:0}; carrier.velocity={x:0,y:7_600}; carrier.angle=0;
assert.equal(hasBoundOrbit(orbit, body), true);
assert.equal(deploySpacecraft(carrier, {...orbit, periapsis:body.radius-1}, body, {engineCutoff:true}).ok, false);
assert.equal(deploySpacecraft(carrier, orbit, body, {engineCutoff:false}).ok, false);
const result = deploySpacecraft(carrier, orbit, body, {engineCutoff:true});
assert.equal(result.ok, true, result.message);
assert.equal(result.spacecraft.parts.some(p=>p.type==='science'), true);
assert.equal(carrier.parts.some(p=>p.type==='science'), false);
assert.equal(carrier.parts.some(p=>p.type==='bigEngine'), true);
assert.ok(Math.hypot(result.spacecraft.position.x-carrier.position.x,result.spacecraft.position.y-carrier.position.y)>0);
assert.ok(Math.hypot(result.spacecraft.velocity.x-carrier.velocity.x,result.spacecraft.velocity.y-carrier.velocity.y)>0);
assert.equal(result.spacecraft.activeEngine, null, 'deployed spacecraft has no launch engine');
const noJoint = new Rocket(parts.filter(p=>p.type!=='decoupler'));
noJoint.position=carrier.position; noJoint.velocity=carrier.velocity;
assert.equal(deploySpacecraft(noJoint, orbit, body, {engineCutoff:true}).ok, false);
const alreadyStaged = new Rocket(parts.filter(p=>['probeCore','science','solarPanel','battery','highGainAntenna'].includes(p.type)));
alreadyStaged.position={x:6_871_000,y:0}; alreadyStaged.velocity={x:0,y:7_600}; alreadyStaged.body=body; alreadyStaged.primaryBody=body;
const adopted=deploySpacecraft(alreadyStaged, orbit, body, {engineCutoff:true});
assert.equal(adopted.ok,true,adopted.message); assert.equal(adopted.alreadySeparated,true);
assert.equal(adopted.spacecraft,alreadyStaged,'already-separated payload keeps its existing independent trajectory object');
console.log('11 checks passed: orbital/cutoff gates, physical part separation, independent position/velocity, already-staged payload adoption and compatibility gates');
