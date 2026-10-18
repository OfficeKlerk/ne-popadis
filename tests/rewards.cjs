const assert = require('node:assert/strict');
const R = require('../game/js/rewards.js');

// 16 персонажей, по 4 на каждую редкость
assert.equal(R.pets.length, 16);
for (const rarity of ['uncommon', 'rare', 'super', 'mega']) assert.equal(R.pets.filter(p => p.rarity === rarity).length, 4, 'four pets per rarity');

// Цена зависит только от редкости; никакой случайности или ставок
assert.deepEqual(R.prices, { uncommon: 150, rare: 300, super: 600, mega: 900 });
for (const p of R.pets) assert.equal(R.priceOf(p), R.prices[p.rarity]);
assert.equal(R.roll, undefined, 'no gacha roll function');
assert.equal(R.chests, undefined, 'no chests');

const wallet = R.createWallet();
const uncommon = R.pets.find(p => p.rarity === 'uncommon');
const rare = R.pets.find(p => p.rarity === 'rare');
const mega = R.pets.find(p => p.rarity === 'mega');

// Не хватает монет / неизвестный id
wallet.begin(149); assert.equal(wallet.buy(uncommon.id), null); assert.equal(wallet.balance, 149);
wallet.begin(1000); assert.equal(wallet.buy('unknown'), null); assert.equal(wallet.balance, 1000);

// Покупка ровно выбранного персонажа, точное списание по цене редкости
const pending = wallet.buy(uncommon.id);
assert(pending && pending.pet.id === uncommon.id, 'buys exactly the chosen pet');
assert.equal(wallet.balance, 850, 'exact debit by rarity price');
assert.equal(wallet.buy(rare.id), null, 'cannot spend again while a reveal is pending');
assert.equal(wallet.reveal().id, uncommon.id);
assert.equal(wallet.reveal(), null);
assert.equal(wallet.pets.length, 1);
assert(wallet.owns(uncommon.id));
assert.equal(wallet.buy(uncommon.id), null, 'no duplicate purchase of an owned pet');

wallet.buy(rare.id); wallet.reveal(); assert.equal(wallet.balance, 550); assert.equal(wallet.pets.length, 2);
assert.equal(wallet.buy(mega.id), null, 'not enough coins for a mega');

// Полный сброс отменяет незавершённую покупку
wallet.begin(900); wallet.buy(mega.id); wallet.begin(0);
assert.equal(wallet.reveal(), null, 'begin cancels a pending reveal');
assert.deepEqual(wallet.pets, []); assert.equal(wallet.balance, 0);

console.log('PASS: 16 pets (4 per rarity), prices 150/300/600/900, deterministic purchase, exact debit, no duplicates, pending lock, insufficient funds, full reset.');
