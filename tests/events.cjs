const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const rootDir=path.join(__dirname,'../game');
const context=vm.createContext({window:{},Audio:class{constructor(){throw Error('Narration must not create an audio player')}}});
vm.runInContext(fs.readFileSync(path.join(rootDir,'js/events.js'),'utf8'),context);
const nodes={'.ev-timing span':{style:{}},'.ev-result':{hidden:true},'.ev-timing small':{textContent:''}};
const classes=new Set();const root={innerHTML:'',classList:{add:c=>classes.add(c)},querySelector:q=>nodes[q],setAttribute(){}};
const events=context.window.GameEvents.create(root);
const data=JSON.parse(fs.readFileSync(path.join(rootDir,'content.json')));
for(const situation of data.situations){
 assert(!('audio' in situation)&&!('audioDuration' in situation));
 events.show(situation);assert(root.innerHTML.includes('ev-scene'));events.update(.5,2.2);assert.equal(nodes['.ev-timing span'].style.transform,'scaleX(0.5)');assert.equal(nodes['.ev-timing small'].textContent,'Выбери действие · 3 с');
 events.update(1.5,-1);assert.equal(nodes['.ev-timing span'].style.transform,'scaleX(0)');assert.equal(nodes['.ev-timing small'].textContent,'Выбери действие · 0 с');events.resolve(true);assert(!nodes['.ev-result'].hidden);events.hide();
}
events.destroy();assert.equal(root.innerHTML,'');assert(!fs.existsSync(path.join(rootDir,'assets/audio')));
console.log('PASS: all event scenes work without audio; countdown and progress clamp; narration assets/data removed.');
