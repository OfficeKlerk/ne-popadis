const assert = require('node:assert/strict');
const R = require('../game/js/rewards.js');
assert.deepEqual(R.chests.map(c=>c.price),[150,450,900]);
assert.deepEqual(R.chests.map(c=>c.odds),[
 [{rarity:'uncommon',chance:90},{rarity:'rare',chance:10}],
 [{rarity:'rare',chance:75},{rarity:'super',chance:25}],
 [{rarity:'super',chance:90},{rarity:'mega',chance:10}]
]);
for (const chest of R.chests) {
 const counts={};
 for(let i=0;i<10000;i++) {
  let draw=0;const pet=R.roll(chest,()=>draw++===0?(i+.5)/10000:.5);
  counts[pet.rarity]=(counts[pet.rarity]||0)+1;
 }
 for(const odd of chest.odds)assert.equal(counts[odd.rarity],odd.chance*100,'exact distribution across rarity range');
 for(const odd of chest.odds)assert.equal(R.pets.filter(p=>p.rarity===odd.rarity).length,4);
 for(const sample of [0,.2499,.25,.4999,.5,.7499,.75,.9999])assert(R.roll(chest,()=>sample));
}
const wallet=R.createWallet();
wallet.begin(149);assert.equal(wallet.buy('wood'),null);assert.equal(wallet.balance,149);
wallet.begin(1500);assert.equal(wallet.buy('unknown'),null);
assert(wallet.buy('gold',()=>.99));assert.equal(wallet.balance,600);
assert.equal(wallet.buy('wood'),null,'rapid second click cannot spend during opening');
assert.equal(wallet.reveal().rarity,'mega');assert.equal(wallet.reveal(),null);assert.equal(wallet.pets.length,1);
assert(wallet.buy('silver'));wallet.reveal();assert.equal(wallet.balance,150);
assert(wallet.buy('wood'));wallet.reveal();assert.equal(wallet.balance,0);assert.equal(wallet.pets.length,3);
assert.equal(wallet.buy('wood'),null);
wallet.begin(900);wallet.buy('gold');wallet.begin(0);assert.equal(wallet.reveal(),null);assert.deepEqual(wallet.pets,[]);assert.equal(wallet.balance,0);
console.log('PASS: branch odds, 16 pets, prices 150/450/900, exact debit, insufficient funds, double click lock, multiple purchases and full reset.');
