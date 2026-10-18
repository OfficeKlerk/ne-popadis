const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),game=path.join(root,'game');
const index=fs.readFileSync(path.join(game,'index.html'),'utf8'),standalone=fs.readFileSync(path.join(root,'play.html'),'utf8');
const scriptPaths=[...index.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);
const inline=[...standalone.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1].trim());
assert.equal(inline.length,scriptPaths.length);
assert(!/<script\s+src=|<link[^>]+rel="stylesheet"|<iframe|<form|<a\s/i.test(standalone));
for(const text of ['Собирай монеты, обходи ящики','Нажми на ответ · 6 секунд','Монеты и зверушки — до нового забега.'])assert(!index.includes(text)&&!standalone.includes(text),'removed caption must not ship');
for(const [i,ref] of scriptPaths.entries()){
 assert(!/^(?:[a-z]+:|\/)/i.test(ref),'relative script paths only');
 const source=fs.readFileSync(path.join(game,ref),'utf8').trim();
 assert.equal(inline[i],source.replace(/<\/script/gi,'<\\/script'),'single file must contain exact current scripts');new vm.Script(source);
 assert(!/\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts)\s*\(|navigator\.(?:sendBeacon|share|vibrate|bluetooth|geolocation)|\b(?:localStorage|sessionStorage)\b|window\.open\s*\(/.test(source),ref+' must be offline and use the host bridge');
}
for(const ref of [...index.matchAll(/<link[^>]+href="([^"]+)"/g)].map(m=>m[1]))if(!ref.startsWith('data:'))assert(fs.existsSync(path.join(game,ref)));
for(const css of [...standalone.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]))assert(!/@import|url\(/i.test(css),'no remote styles, fonts or image dependencies');
const forbidden=()=>{throw Error('Network/storage/audio APIs are unavailable in the offline test')};
const catalog=JSON.parse(fs.readFileSync(path.join(game,'content.json')));
function runPackage(scripts){
 const tags=new Map([...index.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)].map(m=>[m[1],m[0]]));
 const nodes=new Map(),messages=[];let frame=null,doc;
 const gradient={addColorStop(){}};const canvas=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(t,k)=>k in t?t[k]:()=>{}});
 function node(id){if(nodes.has(id))return nodes.get(id);const tag=tags.get(id)||'',classMatch=tag.match(/class="([^"]*)"/),classes=new Set(classMatch?classMatch[1].split(/\s+/):[]);
  const el={id,clientWidth:390,clientHeight:780,style:{},dataset:{},children:[],innerHTML:'',textContent:'',attrs:{},listeners:{},offsetWidth:390,
   classList:{add(...a){a.forEach(x=>classes.add(x))},remove(...a){a.forEach(x=>classes.delete(x))},contains:k=>classes.has(k),toggle(k,v){if(v===undefined)v=!classes.has(k);v?classes.add(k):classes.delete(k)}},
   setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},addEventListener(k,f){this.listeners[k]=f},focus(){doc.activeElement=this},getContext:()=>canvas,
   getBoundingClientRect:()=>({left:0,top:0,width:390,height:780}),querySelectorAll:()=>[],querySelector:q=>node(id+q),appendChild(c){this.children.push(c)},setPointerCapture(){}};
  nodes.set(id,el);return el;
 }
 doc={hidden:false,getElementById:id=>{assert(tags.has(id),'missing node '+id);return node(id)},createElement:tag=>node('new'+nodes.size+tag),querySelectorAll:()=>[],addEventListener(){}};
 const window={devicePixelRatio:1,matchMedia:()=>({matches:false}),addEventListener(){},postMessage:(data,origin)=>{assert.equal(origin,'*');messages.push(data)},AudioContext:class {constructor(){forbidden()}},localStorage:{getItem:forbidden,setItem:forbidden}};
 const ctx=vm.createContext({window,document:doc,fetch:forbidden,XMLHttpRequest:forbidden,WebSocket:forbidden,EventSource:forbidden,Audio:forbidden,navigator:{sendBeacon:forbidden},requestAnimationFrame:f=>{frame=f},setTimeout:()=>0,Math,console});
 for(const source of scripts)vm.runInContext(source,ctx);
 assert.equal(JSON.stringify(window.GAME_CONTENT),JSON.stringify(catalog));assert.equal(window.GAME_CONTENT.situations.length,42);assert.equal(window.GAME_CONTENT.situations.filter(s=>s.delivery!=='pickup').length,41);
 assert(node('screen-loading').classList.contains('hidden'));assert(!node('screen-start').classList.contains('hidden'));assert.equal(messages.length,0,'no app event or sound autoplay on startup');
 node('btn-play').listeners.click();assert(!node('tutorial-overlay').classList.contains('hidden'));assert(node('hud').classList.contains('hidden'));
 frame(1000);frame(8000);assert(node('hud').classList.contains('hidden'),'tutorial never starts the run on its own');
 node('btn-tutorial-start').listeners.click();assert(node('tutorial-overlay').classList.contains('hidden'));assert(!node('hud').classList.contains('hidden'));
 let t=0;for(let i=0;i<6000&&node('screen-end').classList.contains('hidden');i++){t+=1000/60;frame(t)}
 assert(!node('screen-end').classList.contains('hidden'),'offline game reaches its result');assert.equal(messages.filter(m=>m.type==='FINISH_EVENT').length,1);assert.equal(messages.filter(m=>m.type==='COMPLETED_EVENT').length,0);
 node('btn-again').listeners.click();assert.equal(node('shop-balance').textContent,0,'restart resets wallet');
 node('btn-pause').listeners.click();assert(!node('pause-overlay').classList.contains('hidden'));node('btn-exit').listeners.click();assert(!node('screen-start').classList.contains('hidden'));assert.equal(messages.filter(m=>m.type==='CLOSE_EVENT').length,1);
}
runPackage(scriptPaths.map(ref=>fs.readFileSync(path.join(game,ref),'utf8')));runPackage(inline);
assert(Buffer.byteLength(standalone)<5*1024*1024);
console.log('PASS: both packages boot with all 41 situations + pickup catalog, no network/storage/audio APIs; complete run, restart, pause/exit, host events; bundled sources match, zero external assets; play.html '+Buffer.byteLength(standalone)+' bytes. VM verification, not a phone WebView test.');
