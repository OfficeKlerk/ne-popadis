const assert = require('node:assert/strict');
const City = require('../game/js/city.js');
function view(width=480, height=720, scroll=0, reduced=false) {
  const playerY = height*.8, horizon = height*.33, origin = (horizon-.14*playerY)/.86;
  return {width,height,scroll,reduced,perspective:1/.14-1,roadWidth:width*.72,time:0,cheer:0,
    sxAt:(x,r)=>width/2+(x-width/2)*r,yOf:r=>origin+(playerY-origin)*r};
}
function atTravel(base, travel) {return {...base,scroll:travel*base.height*.8/.38};}
// Track the same real building across row recycling and the former p=1.055 cutoff.
for (const [w,h] of [[320,568],[390,640],[390,844],[480,720]]) {
  const base=view(w,h), id=88; // left house at p=1.03 when scroll=0
  let previous, last;
  for (let travel=0; travel<.4; travel+=.001) {
    const frame=atTravel(base,travel), building=City.buildings(frame).find(b=>b.id===id);
    if (!building) {
      assert(last, 'house was present before leaving the camera');
      const rear=City.project(base,[w/2-(base.roadWidth/2+29),0,last.p-.235]);
      assert(rear[0]<-w/2,'entire rear wall is already outside the screen when recycled');
      break;
    }
    assert.equal(building.side,-1);
    if (previous) assert(Math.abs(building.p-previous.p-.001)<1e-9,'world position must be continuous across recycled rows');
    if (building.p>1.055 && building.p<1.06) {
      const rear=City.project(base,[w/2-(base.roadWidth/2+29),0,building.p-.235]);
      assert(rear[0]>0,'rear wall still visible after the old cutoff');
    }
    previous=building;last=building;
  }
  assert(last.p>1.3,'building persists until it has fully passed the camera');
  for (const side of [-1,1]) {
    const inner=w/2+side*(base.roadWidth/2+29);
    let prev=City.project(base,[inner,0,.8]);
    for(let p=.81;p<1.1;p+=.01){
      const current=City.project(base,[inner,0,p]);
      assert(side*(current[0]-prev[0])>0,'wall moves outward as the player passes it');
      assert(current[1]>prev[1],'wall moves toward the bottom of the frame');
      prev=current;
    }
  }
}
const clipped=City.clipNear([[10,0,.9],[10,0,1.3],[10,100,1.3],[10,100,.9]],1.1);
assert.equal(clipped.length,4);
assert(clipped.every(p=>p[2]<=1.1));
assert.equal(clipped.filter(p=>p[2]===.9).length,2,'rear half survives camera clipping');
assert.equal(City.clipNear([[10,0,1.2],[10,0,1.3],[10,100,1.3]],1.1).length,0);
function record(frame) {
  const calls=[], methods=new Map(), clipStack=[]; let balance=0, clipDepth=0;
  const ctx=new Proxy({}, {
    get(_,key){
      if(!methods.has(key)) methods.set(key,(...args)=>{
        for(const value of args) if(typeof value==='number') assert(Number.isFinite(value),key+' must have finite coordinates');
        if(key==='save'){balance++;clipStack.push(clipDepth);}
        if(key==='restore'){balance--;clipDepth=clipStack.pop();}
        if(key==='clip')clipDepth++;
        assert(balance>=0);calls.push([key,...args]);
        if(key==='createLinearGradient'){
          assert(clipDepth>=2,'resident torso is clipped by its window, not only the viewport');
          return {addColorStop:(...stops)=>calls.push(['colorStop',...stops])};
        }
      });
      return methods.get(key);
    },
    set(_,key,value){calls.push([key,typeof value==='object'?'gradient':value]);return true;}
  });
  City.draw(ctx,frame);assert.equal(balance,0);return calls;
}
for(let scroll=0;scroll<10000;scroll+=137) record(view(320,568,scroll));
const still=view(390,640,180,true);
assert.deepEqual(record(still),record({...still,time:17,cheer:1}),'reduced motion freezes residents, bubbles, windows and kite');
assert.notDeepEqual(record({...still,reduced:false}),record({...still,reduced:false,time:.4}),'residents animate during normal play');
assert.equal(Array.from({length:300},(_,i)=>i-150).filter(City.hasResident).length,100,'residents exactly three times rarer');
assert.equal(new Set(Array.from({length:24},(_,i)=>City.residentKind(i*3))).size,8);
const reactionsSeen=new Set();
for(let scroll=0;scroll<15000;scroll+=167)for(const call of record(view(390,844,scroll)))if(call[0]==='fillText'&&City.reactions.includes(call[1]))reactionsSeen.add(call[1]);
assert.equal(reactionsSeen.size,8,'all eight reactions render in actual passing windows');
console.log('PASS: eight distinct reactions, one resident per three houses; buildings pass the camera without popping, stable identity, perspective movement, near-plane clipping, torsos masked by window openings, finite drawing, reduced motion at 320–480px.');
