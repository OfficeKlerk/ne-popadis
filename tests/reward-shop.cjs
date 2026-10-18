const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'../game'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ids=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
for(const reduced of [false,true]){
 const nodes=new Map();let focused=null,wallet;
 function element(id){
  const classes=new Set(),el={id,style:{},dataset:{},children:[],listeners:{},offsetWidth:104,offsetLeft:0,textContent:'',disabled:false,
   classList:{add(...a){a.forEach(k=>classes.add(k))},remove(...a){a.forEach(k=>classes.delete(k))},contains:k=>classes.has(k),toggle(k,v){if(v===undefined)v=!classes.has(k);v?classes.add(k):classes.delete(k)}},
   attrs:{},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},addEventListener(k,f){this.listeners[k]=f},focus(){focused=id},closest(){return this},querySelector(selector){return this.children.find(b=>selector==='button'||selector.includes('"'+b.dataset.buy+'"'))||null}
  };
  let markup='';Object.defineProperty(el,'innerHTML',{get:()=>markup,set(value){markup=value;el.children=[];
   if(id==='reel-track')for(const m of value.matchAll(/class="reel-card" data-pet-id="([^"]+)"/g)){const child=element('reel-card');child.dataset.petId=m[1];child.offsetLeft=el.children.length*116;el.children.push(child);}
   if(id==='chest-list')for(const m of value.matchAll(/<button class="chest-choice" data-buy="([^"]+)"([^>]+)>/g)){const child=element('buy-'+m[1]);child.dataset.buy=m[1];child.disabled=m[2].includes('disabled');el.children.push(child);}
  }});return el;
 }
 const $=id=>{assert(ids.has(id),'missing HTML '+id);if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id)};
 const data={...require('../game/js/rewards.js')};const create=data.createWallet;data.createWallet=()=>{wallet=create();return wallet};
 const ctx=vm.createContext({window:{RunRewards:data},document:{getElementById:$},Math});vm.runInContext(fs.readFileSync(path.join(root,'js/platform.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/reward-shop.js'),'utf8'),ctx);
 const shop=ctx.window.RewardShop.create(reduced);
 const buy=id=>{const button=$('chest-list').children.find(b=>b.dataset.buy===id);$('chest-list').listeners.click({target:button});return button};
 shop.start(1500);
 for(const id of ['wood','silver','gold']){
  const before=wallet.balance,button=buy(id),expected=(wallet.pending?wallet.pending.pet:wallet.pets.at(-1));
  assert.equal(wallet.balance,before-data.chests.find(c=>c.id===id).price);assert.equal($('screen-end').attrs['aria-hidden'],'true');assert($('screen-end').classList.contains('input-blocked'));
  if(!reduced){
   $('chest-list').listeners.click({target:button});assert.equal(wallet.balance,before-data.chests.find(c=>c.id===id).price,'repeated stale click cannot double charge');
   $('reward-overlay').listeners.keydown({key:'Escape',preventDefault(){}});assert(shop.isOpen(),'cannot skip pending reveal');
   shop.update(.65);const cards=$('reel-track').children;assert.equal(cards.length,32);assert.equal(cards[28].dataset.petId,expected.id);
   const rarities=new Set(data.chests.find(c=>c.id===id).odds.map(o=>o.rarity));assert(cards.every(c=>rarities.has(data.pets.find(p=>p.id===c.dataset.petId).rarity)));
   shop.update(1);assert($('reward-reel').classList.contains('spinning'));assert(wallet.pending);
   shop.update(2.81);assert($('reel-track').children[28].classList.contains('winner'));assert.equal($('reel-track').style.transform,'translateX(-3300px)');assert(wallet.pending,'show the settled winner before reveal');
   shop.update(.51);assert(!wallet.pending);assert($('reward-dialog').classList.contains('celebrating'));assert($('reward-pet').innerHTML.includes('reward-burst'));
  }else{
   assert(!wallet.pending);assert.equal($('reel-track').children.length,0);assert(! $('reward-pet').innerHTML.includes('reward-burst'));
  }
  assert.equal($('reward-title').textContent,expected.name);assert.equal(focused,'btn-reward-done');const count=wallet.pets.length;shop.update(100);assert.equal(wallet.pets.length,count,'reveal occurs once');
  $('btn-reward-done').listeners.click();assert(!shop.isOpen());assert.equal($('screen-end').inert,false);
 }
 assert.equal(wallet.balance,0);assert.equal(wallet.pets.length,3);buy('wood');assert.equal(wallet.pets.length,3);
 shop.start(150);buy('wood');if(!reduced)shop.update(1);shop.reset();shop.update(20);assert.equal(wallet.balance,0);assert.equal(wallet.pets.length,0);assert(!shop.isOpen());assert.equal($('reel-track').children.length,0);
}
console.log('PASS: reel matches committed pet; exact centering, eligible filler cards, 3 chest prices, no duplicate charges/reveals, modal focus, reset cancels, reduced motion reveals immediately.');
