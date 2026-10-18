const assert = require('node:assert/strict');
const Runner = require('../game/js/runner.js');
function seeded(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function firstObstacle({jumpAt=null,dt=1/120,crate=false,lane=1}={}) {
 const c=Runner.create(()=>.5);c.begin(0,10,1.5);const events=[];let jumped=false;
 while(c.time<3.2){if(crate&&c.obstacles.length)c.obstacles[0].type='crate';if(jumpAt!==null&&!jumped&&c.time>=jumpAt){c.jump();jumped=true;}events.push(...c.update(dt,lane,.22));}return events;
}
assert.equal(firstObstacle().filter(e=>e.type==='hit').length,1);
assert.equal(firstObstacle({lane:2}).filter(e=>e.type==='hit').length,0);
assert.equal(firstObstacle({jumpAt:2.4}).filter(e=>e.type==='hit').length,0);
assert.equal(firstObstacle({jumpAt:1}).filter(e=>e.type==='hit').length,1);
assert.equal(firstObstacle({jumpAt:2.4,crate:true}).filter(e=>e.type==='hit').length,1);
const jump=Runner.create();jump.begin(0,10,1.5);assert(jump.jump());assert(!jump.jump());jump.update(.93,0,.2);assert.equal(jump.jumpHeight,0);assert(jump.jump());jump.begin(1,10,1.5);assert.equal(jump.jumpTime,-1);
let simulations=0;
for(const dt of [1/20,1/30,1/60,1/144])for(let seed=1;seed<=30;seed++)for(const round of [0,1,2,3,15])for(const allBonuses of [false,true]){
 const c=Runner.create(seeded(seed));c.begin(round,10,1.5);let x=1,active=null,ground=0;const rows=new Map(),bonuses=new Map(),collected=new Set(),jumped=new Set();
 while(!c.ready&&c.time<11){
  for(const o of c.obstacles){
   if(!rows.has(o.row.id))rows.set(o.row.id,{row:o.row,obstacles:new Map()});rows.get(o.row.id).obstacles.set(o.lane,o);
  }
  for(const coin of c.coins.filter(v=>v.airborne)){
   const row=rows.get(coin.barrierId),barrier=row.obstacles.get(coin.lane);assert.equal(barrier.type,'barrier');
   assert(coin.height>77,'standing hero cannot collect the bonus');
   if(!bonuses.has(coin.barrierId))bonuses.set(coin.barrierId,new Map());bonuses.get(coin.barrierId).set(coin.id,coin);
  }
  if(active&&active.p>1.02)active=null;
  const chosen=[...c.coins].filter(v=>v.p<1.02&&(!v.airborne ? !(allBonuses&&bonuses.has(v.rowId)) : allBonuses||rows.get(v.barrierId).row.requiresJump)).sort((a,b)=>b.p-a.p)[0];
  if(!active&&chosen&&chosen.airborne)active=rows.get(chosen.barrierId).obstacles.get(chosen.lane);
  const fallback=c.obstacles.filter(o=>!o.checked).sort((a,b)=>b.p-a.p)[0];
  const lane=active?active.lane:chosen?chosen.lane:fallback?fallback.row.safeLane:Math.round(x);
  x+=(lane-x)*Math.min(1,dt*14);
  if(active&&!jumped.has(active.row.id)&&active.p>=.985-Runner.jumpTime/2/active.travel){assert(c.jump(),'enough recovery between jumps');jumped.add(active.row.id);}
  for(const e of c.update(dt,x,21/(320*.72/3))){
   assert.notEqual(e.type,'hit',`route must be passable: seed ${seed} round ${round} dt ${dt} allBonuses ${allBonuses} row ${e.obstacle?.row.id}`);
   if(e.type==='coin'){assert(!collected.has(e.coin.id));collected.add(e.coin.id);if(!e.coin.airborne)ground++;}
  }
 }
 const mandatory=[...rows.values()].filter(r=>r.row.requiresJump);
 assert.equal(mandatory.length,round===0?1:round<3?3:4);
 for(const {row,obstacles} of rows.values()){
  assert(Math.abs(row.safeLane-(rows.get(row.id-1)?.row.safeLane??1))<=1);
  if(row.requiresJump){assert.equal(obstacles.size,3);assert.equal([...obstacles.values()].filter(o=>o.type==='crate').length,2);assert.equal(obstacles.get(row.safeLane).type,'barrier');assert(jumped.has(row.id));}
  else {assert.equal(obstacles.size,2);assert(!obstacles.has(row.safeLane));}
 }
 for(const [id,coins] of bonuses){
  assert.equal(coins.size,1);const bonus=[...coins.values()][0];
  assert.equal(bonus.value,5);assert.equal(bonus.height,34+Runner.jumpHeight);
  assert.equal(bonus.arcOffset,undefined);assert.equal(bonus.arcSide,undefined);
  if(allBonuses||rows.get(id).row.requiresJump)assert(collected.has(bonus.id),`bonus collected: seed ${seed} round ${round} dt ${dt} allBonuses ${allBonuses} row ${id}`);
 }
 if(!allBonuses)assert.equal(ground,3+((round===0?5:round<3?7:8)-mandatory.length)*4,'all ordinary ground coins remain reachable');
 assert.equal(c.rowsSpawned,round===0?5:round<3?7:8);assert.equal(c.objectsSpawned,round===0?11:round<3?17:20);
 assert(c.ready&&c.time>=10&&c.time<10.1,'road clears before decision');simulations++;
}
// A gate cannot be bypassed on any lane; the low barrier is the sole jump route.
for(const lane of [0,1,2])for(const jumping of [false,true]){
 const c=Runner.create(seeded(4));c.begin(0,10,1.5);while(!c.obstacles.some(o=>o.row.requiresJump))c.update(1/120,0,.2);
 const gate=c.obstacles.find(o=>o.row.requiresJump);c.obstacles=c.obstacles.filter(o=>o.row===gate.row);c.coins=[];c.invulnerable=0;
 let jumped=false,hits=0;
 while(gate.p<1.03){if(jumping&&!jumped&&gate.p>=.985-Runner.jumpTime/2/gate.travel){c.jump();jumped=true;}hits+=c.update(1/120,lane,.2).filter(e=>e.type==='hit'&&e.obstacle.row===gate.row).length;}
 assert.equal(hits,jumping&&lane===gate.row.safeLane?0:1);
}
assert.equal(firstObstacle().filter(e=>e.type==='coin'&&e.coin.airborne).length,0);
const bonusPickups=firstObstacle({jumpAt:2.4}).filter(e=>e.type==='coin'&&e.coin.airborne);
assert.equal(bonusPickups.length,1);assert.equal(bonusPickups[0].coin.value,5);
assert(firstObstacle().filter(e=>e.type==='coin').every(e=>e.coin.value===1));
assert.equal(firstObstacle({jumpAt:2.4,lane:0}).filter(e=>e.type==='coin'&&e.coin.airborne).length,0);
const normal=Runner.create(()=>.5),fast=Runner.create(()=>.5);normal.begin(0,10,1);fast.begin(0,10,1.5);for(let n=0;n<120;n++){normal.update(1/120,0,.2);fast.update(1/120,0,.2);}assert(Math.abs(fast.obstacles[0].p/normal.obstacles[0].p-1.5)<1e-10);
console.log(`PASS: ${simulations} courses, 20/30/60/144 fps, smooth moves on 320px; mandatory gates only pass by jumping the barrier; single X5 bonuses collectible (+5 each), no duplicates; ground routes and 1.5x speed preserved.`);
