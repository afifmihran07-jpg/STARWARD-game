import assert from 'node:assert/strict';
import {SaveManager} from '../js/save/saveManager.js';
import {Rocket} from '../js/rocket/rocket.js';
const store=new Map();
globalThis.localStorage={setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k)||null};
const body={id:'earth'};
const parts=[{id:'tank',type:'wideTank',x:0,y:4},{id:'engine',type:'bigEngine',x:0,y:8}];
const makeGame=()=>({bodies:[body],missions:{index:0},editor:{budgetProfile:'discovery',snapshot:()=>parts.map(p=>({...p})),setBudgetProfile(id){this.budgetProfile=id;},restore:p=>{parts.splice(0,parts.length,...p.map(x=>({...x})));}},rocket:null,
 launch(b){this.rocket=new Rocket(parts);this.rocket.body=b||body;this.rocket.primaryBody=this.rocket.body;this.rocket.position={x:1,y:2};this.rocket.velocity={x:3,y:4};this.rocket.refresh();}});
const game=makeGame(); game.launch(body); game.rocket.stageIndex=0; game.rocket.refresh(); game.rocket.stageFuel[0]=1234; game.rocket.position={x:7_000_000,y:12}; game.rocket.velocity={x:4,y:7600}; game.rocket.angle=.2; game.rocket.throttle=.4;
SaveManager.save(game);
const loaded=makeGame(); assert.equal(SaveManager.load(loaded),true);
assert.deepEqual(loaded.rocket.position,{x:7_000_000,y:12}); assert.deepEqual(loaded.rocket.velocity,{x:4,y:7600});
assert.equal(loaded.rocket.stageFuel[0],1234); assert.equal(loaded.rocket.fuel,1234); assert.equal(loaded.rocket.stageIndex,0); assert.equal(loaded.rocket.throttle,.4);
// Older V6.3-style saves stored only a total fuel number; loading must not try
// to assign to Rocket.fuel, which is a getter over per-stage fuel.
store.set('starward-save',JSON.stringify({parts,budgetProfile:'discovery',mission:0,rocket:{position:{x:10,y:20},velocity:{x:1,y:2},fuel:2000}}));
const legacy=makeGame(); assert.equal(SaveManager.load(legacy),true); assert.equal(legacy.rocket.fuel,2000); assert.equal(legacy.rocket.position.x,10);
console.log('7 checks passed: current save restore, stage fuel/position/velocity/throttle, legacy fuel compatibility and read-only getter safety');
