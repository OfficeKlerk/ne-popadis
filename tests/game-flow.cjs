const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=require('node:path').join(__dirname,'../game/');
const gradient={addColorStop(){}};
const paintedText=[];
const canvas=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,fillText(text){paintedText.push(text)}},{get:(t,k)=>k in t?t[k]:()=>{}});
const nodes=new Map();
const reduced=process.env.REDUCED_MOTION==='1';
const html=fs.readFileSync(root+'index.html','utf8');
const ids=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
function node(id){if(nodes.has(id))return nodes.get(id);const classes=new Set();const el={id,clientWidth:390,clientHeight:780,style:{},dataset:{},textContent:'',innerHTML:'',offsetWidth:390,children:[],querySelectorAll:()=>[],listeners:{},classList:{add(...xs){xs.forEach(x=>classes.add(x))},remove(...xs){xs.forEach(x=>classes.delete(x))},toggle(k,on){if(on===undefined)on=!classes.has(k);on?classes.add(k):classes.delete(k);return on},contains:k=>classes.has(k)},addEventListener(k,f){this.listeners[k]=f},appendChild(c){this.children.push(c)},getContext:()=>canvas,attrs:{},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},getBoundingClientRect:()=>id==="coin-target"?({left:110,top:24,width:18,height:18}):({left:0,top:0,width:390,height:780}),setPointerCapture(){},focus(){doc.activeElement=this}};nodes.set(id,el);return el;}
const legend=[0,1,2].map(i=>{const e=node('lane'+i);e.dataset.lane=i;return e});
const docListeners={},windowListeners={};
const doc={hidden:false,getElementById:id=>{assert(ids.has(id), "Missing HTML element: "+id);return node(id)},createElement:id=>node('new'+nodes.size+id),querySelectorAll:()=>legend,addEventListener(k,f){docListeners[k]=f}};
let showing=false,shownCount=0,messages=[];
const data=JSON.parse(fs.readFileSync(root+'content.json'));
const window={devicePixelRatio:1,matchMedia:()=>({matches:reduced}),addEventListener(k,f){windowListeners[k]=f},postMessage:(m,target)=>{assert.equal(target,"*");assert(m.params&&typeof m.params==='object');assert.equal(m.payload,undefined);messages.push(m)},RunnerCourse:require('../game/js/runner.js'),GameEvents:{create:()=>({hide(){showing=false},show(){showing=true;shownCount++},resolve(){},update(){},setSound(){},setPaused(){}})}};window.parent={postMessage(){throw Error("Use the specified window.postMessage contract, not parent")}};
const context=vm.createContext({window,document:doc,fetch:()=>{throw Error("Network disabled in this test")},requestAnimationFrame(){},setTimeout,Math,console});
let source=fs.readFileSync(root+'js/game.js','utf8');
source=source.replace('  // ---------- Инициализация ----------','  window.test = {startRun,update,draw,move,jump,setPaused,endRun,exitGame,decisionSeconds,spawnSituation,frame,coinPosition, get snapshot(){return {state,phase,round,cards,course,player,lives,coins,decisionsTotal,decisionsOK,flashTimer,ending,meters,speed,roadCoins,coinFlights,stumbleT,shieldLossT,paused,tutorialOpen,runTime};}};\n  // ---------- Инициализация ----------');
vm.runInContext(fs.readFileSync(root+'js/content.js','utf8'),context);
vm.runInContext(fs.readFileSync(root+'js/platform.js','utf8'),context);
assert.equal(JSON.stringify(window.GAME_CONTENT),JSON.stringify(data));
vm.runInContext(fs.readFileSync(root+'js/city.js','utf8'),context);
vm.runInContext(fs.readFileSync(root+'js/rewards.js','utf8'),context);
vm.runInContext(fs.readFileSync(root+'js/reward-shop.js','utf8'),context);
vm.runInContext(source,context);
(async()=>{
 for(let i=0;i<8;i++)await Promise.resolve();
 const game=window.test;
 let activeGate=null,jumpedGate=null;
 function advance(sec,protect=false){for(let t=0;t<sec;t+=1/60){
  if(protect){
   const c=game.snapshot.course;
   if(activeGate&&activeGate.p>1.02)activeGate=null;
   const next=[...c.coins].filter(v=>v.p<=1.02&&(!v.airborne||c.obstacles.some(o=>o.row.id===v.barrierId&&o.row.requiresJump))).sort((a,b)=>b.p-a.p)[0];
   if(!activeGate&&next&&next.airborne){activeGate=c.obstacles.find(o=>o.row.id===next.barrierId&&o.type==='barrier');jumpedGate=null;}
   const obstacle=[...c.obstacles].filter(o=>!o.checked).sort((a,b)=>b.p-a.p)[0];
   const lane=activeGate?activeGate.lane:next?next.lane:obstacle?obstacle.row.safeLane:game.snapshot.player.lane;
   game.move(lane-game.snapshot.player.lane);
   if(activeGate&&jumpedGate!==activeGate&&activeGate.p>=.985-window.RunnerCourse.jumpTime/2/activeGate.travel){game.jump();jumpedGate=activeGate;}
  }
  game.update(1/60);game.draw();
 }}


 // Tutorial holds the start screen; close, button and Escape all start one clean run.
 for(const action of ['btn-tutorial-close','btn-tutorial-start','Escape']){
  node('btn-play').listeners.click();assert(game.snapshot.tutorialOpen);assert.equal(game.snapshot.state,'start');
  const before={meters:game.snapshot.meters,coins:game.snapshot.coins,time:game.snapshot.course.time};
  advance(7);game.move(1);game.jump();
  assert.equal(game.snapshot.state,'start');assert.equal(game.snapshot.meters,before.meters);assert.equal(game.snapshot.coins,before.coins);assert.equal(game.snapshot.course.time,before.time);
  assert.equal(node('screen-start').attrs['aria-hidden'],'true');assert.equal(doc.activeElement,node('btn-tutorial-start'));
  let trapped=false;node('tutorial-overlay').listeners.keydown({key:'Tab',preventDefault(){trapped=true}});assert(trapped);assert.equal(doc.activeElement,node('btn-tutorial-close'));
  node('tutorial-overlay').listeners.keydown({key:'Tab',shiftKey:true,preventDefault(){}});assert.equal(doc.activeElement,node('btn-tutorial-start'));
  if(action==='Escape')docListeners.keydown({key:'Escape',preventDefault(){}});else node(action).listeners.click();
  assert(!game.snapshot.tutorialOpen);assert.equal(game.snapshot.state,'run');assert.equal(game.snapshot.course.time,0);assert.equal(game.snapshot.coins,0);assert.equal(game.snapshot.lives,3);assert.equal(doc.activeElement,node('game'));
  assert(node('tutorial-overlay').classList.contains('hidden'));assert.equal(node('screen-start').attrs['aria-hidden'],undefined);
  advance(.5);const time=game.snapshot.course.time;node('btn-tutorial-start').listeners.click();assert.equal(game.snapshot.course.time,time,'stale second click cannot restart');
  game.exitGame();
 }
 messages=[];
 // Every card gets six seconds, starting with its first displayed frame, even at high speed.
 for(const distance of [0,200,400,1000,2000,10000])assert.equal(game.decisionSeconds(distance),6);
 for(const fps of [10,20,60,144]){
  game.startRun();game.spawnSituation();const card=game.snapshot.cards[0];game.move(card.answerLane-game.snapshot.player.lane);
  let ts=100000;game.frame(ts);assert.equal(card.age,0);
  for(let i=1;i<fps*6;i++){game.frame(ts+i*1000/fps);assert(!card.resolved,'never resolves before six active seconds');}
  game.frame(ts+6000);assert(card.resolved,'resolves at six seconds even below 20 fps');
 }
 game.startRun();advance(10.1,true);assert.equal(game.snapshot.cards[0].duration,6);
 const firstBudget=6;game.move(game.snapshot.cards[0].answerLane-game.snapshot.player.lane);advance(6.7);advance(10.1,true);assert.equal(game.snapshot.cards[0].duration,6);
 // One large X5 sits directly above its barrier, with readable text on its face.
 game.startRun();advance(.6);const bonuses=game.snapshot.course.coins.filter(c=>c.airborne);assert.equal(bonuses.length,1);
 const bonus=bonuses[0];assert.equal(bonus.value,5);
 const screen=game.coinPosition({...bonus,p:.8,lane:1});
 const ordinary=game.coinPosition({...bonus,p:.8,lane:1,value:1,height:30});
 assert.equal(screen.x,ordinary.x);assert(Math.abs(screen.scale/ordinary.scale-1.75/1.2)<1e-10);assert(screen.y+19*screen.scale<ordinary.y-47*(ordinary.scale/1.2));
 assert(paintedText.includes('X5'),'bonus label is drawn');
 assert.equal(game.coinPosition({...bonus,p:1,value:1}).scale,1.2);assert.equal(game.coinPosition({...bonus,p:1,value:5}).scale,1.75);
 showing=false;shownCount=0;
 // Pause freezes motion, pickups, timers and input, including an active jump.
 game.startRun();game.jump();advance(.2);game.setPaused(true);
 const frozen={meters:game.snapshot.meters,time:game.snapshot.course.time,runTime:game.snapshot.runTime,jump:game.snapshot.course.jumpTime,lane:game.snapshot.player.lane};
 assert.equal(node("hud").attrs["aria-hidden"],"true");assert(node("hud").classList.contains("input-blocked"));
 game.move(1);game.jump();advance(5);
 assert.equal(game.snapshot.meters,frozen.meters);assert.equal(game.snapshot.course.time,frozen.time);assert.equal(game.snapshot.runTime,frozen.runTime);assert.equal(game.snapshot.course.jumpTime,frozen.jump);assert.equal(game.snapshot.player.lane,frozen.lane);
 game.setPaused(false);advance(.1);assert(game.snapshot.meters>frozen.meters);assert(!node("hud").classList.contains("input-blocked"));assert.equal(node("hud").attrs["aria-hidden"],undefined);
 windowListeners.pagehide();assert(game.snapshot.paused,"pagehide suspends the WebView run");game.setPaused(false);
 // Real first barrier: one loss, visible feedback, movement still available, full recovery.
 game.startRun();advance(2.9);assert.equal(game.snapshot.lives,2);
 assert.equal(game.snapshot.stumbleT>0,!reduced);assert(game.snapshot.shieldLossT>0);
 assert(node('lives').classList.contains('hit'));assert(node('lives').innerHTML.includes('Щиты: 2 из 3'));
 game.move(1);advance(.15);assert.equal(game.snapshot.player.lane,2);assert.equal(game.snapshot.lives,2);
 advance(1.05);assert.equal(game.snapshot.stumbleT,0);assert.equal(game.snapshot.shieldLossT,0);assert(!node('lives').classList.contains('hit'));assert.equal(game.snapshot.lives,2);
 // A successful jump causes no loss animation; restarting mid-stumble clears feedback.
 game.startRun();advance(2.45);const beforeBonus=game.snapshot.coins;game.jump();advance(.8);assert.equal(game.snapshot.lives,3);assert.equal(game.snapshot.shieldLossT,0);
 assert.equal(game.snapshot.coins,beforeBonus+5);assert.equal(game.snapshot.roadCoins,beforeBonus+5);assert.equal(node('coins-n').textContent,beforeBonus+5);
 assert.equal(game.snapshot.coinFlights.some(f=>f.life>0&&f.value===5),!reduced);advance(.15);assert.equal(game.snapshot.coins,beforeBonus+5,'X5 credits exactly once');
 game.startRun();advance(2.9);game.startRun();assert.equal(game.snapshot.stumbleT,0);assert.equal(game.snapshot.shieldLossT,0);assert.equal(game.snapshot.lives,3);assert(!node('lives').classList.contains('hit'));
 game.startRun();advance(1.1);assert.equal(game.snapshot.coins,1);assert.equal(node('coins-n').textContent,1);
 assert.equal(game.snapshot.coinFlights.some(f=>f.life>0),!reduced);
 if(!reduced){const flight=game.snapshot.coinFlights.find(f=>f.life>0);assert.equal(flight.tx,119);assert.equal(flight.ty,33);}
 game.move(-1);advance(.8);assert.equal(game.snapshot.coins,1);assert(!game.snapshot.coinFlights.some(f=>f.life>0));assert(node('coins').classList.contains('pop'));
 game.startRun();advance(1.1);game.startRun();assert.equal(game.snapshot.coins,0);assert(!game.snapshot.coinFlights.some(f=>f.life>0));
 game.startRun();assert.equal(game.snapshot.phase,'road');advance(9.8,true);assert.equal(shownCount,0);advance(.3,true);assert.equal(game.snapshot.phase,'decision');assert.equal(game.snapshot.course.obstacles.length,0);assert.equal(game.snapshot.course.coins.length,0);assert.equal(game.snapshot.roadCoins,24);assert(showing);assert.equal(shownCount,1);
 game.setPaused(true);const age=game.snapshot.cards[0].age;advance(3);assert.equal(game.snapshot.cards[0].age,age);game.setPaused(false);
 const first=game.snapshot.cards[0];assert.notEqual(first.visual.type,'coin');game.move(first.answerLane-game.snapshot.player.lane);advance(first.duration+.7);assert.equal(game.snapshot.decisionsOK,1);assert.equal(game.snapshot.phase,'road');assert(!showing);assert.equal(game.snapshot.course.time<1,true);
 advance(10.2,true);assert.equal(game.snapshot.phase,'decision');const second=game.snapshot.cards[0];game.move((second.answerLane+1)%3-game.snapshot.player.lane);advance(second.duration+.6);assert.equal(game.snapshot.phase,'feedback');assert(game.snapshot.flashTimer>0);assert(!showing);assert.equal(game.snapshot.course.obstacles.length,0);advance(game.snapshot.flashTimer+.1);assert.equal(game.snapshot.phase,'road');
 game.jump();advance(.25);assert(game.snapshot.course.jumpHeight>50);game.startRun();assert.equal(game.snapshot.course.jumpHeight,0);assert.equal(game.snapshot.round,0);assert.equal(game.snapshot.decisionsTotal,0);assert.equal(game.snapshot.lives,3);assert.equal(game.snapshot.roadCoins,0);assert.equal(game.snapshot.course.coins.length,3);
 // Losing and stopping are finishes, not successful completion.
 for(let run=0;run<2;run++){game.startRun();for(let t=0;t<180&&game.snapshot.state!=='end';t+=.05)game.update(.05);assert.equal(game.snapshot.state,'end');}
 assert.equal(messages.filter(m=>m.type==='COMPLETED_EVENT').length,0);assert.equal(messages.filter(m=>m.type==='FINISH_EVENT').length,2);assert(node('run-complete').classList.contains('hidden'));assert(!node('end-title').classList.contains('hidden'));
 game.startRun();advance(1.1);game.setPaused(true);game.endRun();assert.equal(game.snapshot.state,'end');assert.equal(game.snapshot.paused,false);assert.equal(node('shop-balance').textContent,game.snapshot.coins);
 assert.equal(messages.filter(m=>m.type==='FINISH_EVENT').length,3);assert.equal(messages.filter(m=>m.type==='COMPLETED_EVENT').length,0);assert(node('run-complete').classList.contains('hidden'));assert.equal(messages.filter(m=>m.type==='FINISH_EVENT').at(-1).params.result,'stopped');
 game.startRun();advance(1.1);game.setPaused(true);game.exitGame();assert.equal(game.snapshot.state,'start');assert.equal(game.snapshot.coins,0);assert.equal(game.snapshot.paused,false);assert.equal(node('shop-balance').textContent,0);assert.equal(messages.filter(m=>m.type==='CLOSE_EVENT').length,1);
 // Four active minutes, independent of slow physics; pause excluded, no clipped final question.
 for(const fps of [10,30,144]){
  node('screen-end').scrollTop=999;game.startRun();assert.equal(game.snapshot.runTime,0);assert(node('run-complete').classList.contains('hidden'));
  const seen=new Set(),step=1/fps;
  for(let i=1;i<=240*fps;i++){
   game.snapshot.course.invulnerable=999;
   const card=game.snapshot.cards[0];if(card){seen.add(card);game.move(card.answerLane-game.snapshot.player.lane);}
   if(i===120*fps){const time=game.snapshot.runTime;game.setPaused(true);game.update(.05,60);assert.equal(game.snapshot.runTime,time);game.setPaused(false);}
   game.update(Math.min(.05,step),step);
   if(i<240*fps)assert.equal(game.snapshot.state,'run','never finish before 240 active seconds');
  }
  assert.equal(game.snapshot.state,'end');assert.equal(game.snapshot.runTime,240);assert(game.snapshot.lives>0);
  assert(!node('run-complete').classList.contains('hidden'));assert(node('end-title').classList.contains('hidden'));
  assert.equal(node('screen-end').attrs['aria-labelledby'],'complete-title');assert.equal(node('screen-end').scrollTop,0);assert(seen.size>0);assert([...seen].every(c=>c.resolved),'every displayed card gets its full answer window');
  assert.equal(messages.filter(m=>m.type==='COMPLETED_EVENT').length,1,'successful completion once per load, not on losses or repeats');
  const finish=messages.filter(m=>m.type==='FINISH_EVENT').at(-1);assert.equal(finish.params.result,'completed');assert.equal(finish.params.seconds,240);
  const count=messages.length;game.endRun(true);game.update(.05,10);assert.equal(messages.length,count);
 }
 // A delayed final frame must still score an answer whose full six seconds elapsed.
 game.startRun();game.update(.05,233.7);game.spawnSituation();game.update(0,0);
 const finalCard=game.snapshot.cards[0];game.move(finalCard.answerLane-game.snapshot.player.lane);
 game.update(.05,5.9);assert(!finalCard.resolved);game.update(.05,1);
 assert(finalCard.resolved);assert.equal(game.snapshot.decisionsOK,1);assert.equal(game.snapshot.runTime,240);assert.equal(game.snapshot.state,'end');
 // A manual end cannot claim a win by passing a click event or true before the deadline.
 game.startRun();game.endRun(true);assert(node('run-complete').classList.contains('hidden'));
 game.startRun();game.endRun({type:'click'});assert(node('run-complete').classList.contains('hidden'));
 console.log('PASS: 240-second active-time finish at 10/30/144 fps; pause excluded; full final answer window; success banner and completion only at a surviving finish.');
 console.log('PASS ('+(reduced?'reduced motion':'full motion')+'): pause freezes road/jump/decision, resume, finish into shop, exit/reset; stumble recovery, single shield loss, jump avoids hit, clean damage reset; pickup flight, counter arrival, clean restart, valid HTML bindings; full game flow, 10 s cadence, clear road during events, correct/wrong answers, feedback pause, road coin collection, city rendering, real jump, restart reset, finish/completion bridge.');
})().catch(e=>{console.error(e);process.exitCode=1});
