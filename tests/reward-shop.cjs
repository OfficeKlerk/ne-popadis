const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
const root = path.join(__dirname, '../game'), html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

for (const reduced of [false, true]) {
  const nodes = new Map(); let focused = null, wallet;
  function element(id) {
    const classes = new Set(), el = {
      id, style: {}, dataset: {}, children: [], listeners: {}, offsetWidth: 104, offsetLeft: 0, textContent: '', disabled: false, inert: false,
      classList: { add(...a) { a.forEach(k => classes.add(k)); }, remove(...a) { a.forEach(k => classes.delete(k)); }, contains: k => classes.has(k), toggle(k, v) { if (v === undefined) v = !classes.has(k); v ? classes.add(k) : classes.delete(k); } },
      attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, addEventListener(k, f) { this.listeners[k] = f; }, focus() { focused = id; }, closest() { return this; },
      querySelector(selector) { return this.children.find(b => selector === 'button' || selector.includes('"' + b.dataset.buy + '"')) || null; }
    };
    let markup = ''; Object.defineProperty(el, 'innerHTML', { get: () => markup, set(value) {
      markup = value; el.children = [];
      if (id === 'chest-list') for (const m of value.matchAll(/<button class="pet-buy[^"]*" data-buy="([^"]+)"([^>]*)>/g)) { const child = element('buy-' + m[1]); child.dataset.buy = m[1]; child.disabled = m[2].includes('disabled'); el.children.push(child); }
    } });
    return el;
  }
  const $ = id => { assert(ids.has(id), 'missing HTML ' + id); if (!nodes.has(id)) nodes.set(id, element(id)); return nodes.get(id); };
  const data = { ...require('../game/js/rewards.js') }; const create = data.createWallet; data.createWallet = () => { wallet = create(); return wallet; };
  const ctx = vm.createContext({ window: { RunRewards: data }, document: { getElementById: $ }, Math });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/platform.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/reward-shop.js'), 'utf8'), ctx);
  const shop = ctx.window.RewardShop.create(reduced);
  const findBtn = id => $('chest-list').children.find(b => b.dataset.buy === id);
  const buy = id => { $('chest-list').listeners.click({ target: findBtn(id) }); };

  const uncommon = data.pets.find(p => p.rarity === 'uncommon');
  const rare = data.pets.find(p => p.rarity === 'rare');

  shop.start(200);
  // Доступную зверушку можно купить, слишком дорогую — нет
  assert(!findBtn(uncommon.id).disabled, 'affordable pet is buyable');
  assert(findBtn(rare.id).disabled, 'too-expensive pet is disabled');

  // Покупка конкретного персонажа — мгновенно и детерминированно, без прокрутки
  buy(uncommon.id);
  assert.equal(wallet.balance, 200 - data.priceOf(uncommon), 'exact debit');
  assert(wallet.owns(uncommon.id), 'exactly the chosen pet is owned');
  assert.equal($('screen-end').attrs['aria-hidden'], 'true');
  assert($('screen-end').classList.contains('input-blocked'));
  assert.equal($('reward-title').textContent, uncommon.name, 'reveals the chosen pet by name');
  assert(!wallet.pending, 'purchase settles at once, no spinning reel');
  assert.equal($('reel-track').children.length, 0, 'no reel cards');
  if (!reduced) { assert($('reward-dialog').classList.contains('celebrating')); assert($('reward-pet').innerHTML.includes('reward-burst')); }
  else { assert(!$('reward-pet').innerHTML.includes('reward-burst')); }
  assert.equal(focused, 'btn-reward-done');
  const count = wallet.pets.length; shop.update(100); assert.equal(wallet.pets.length, count, 'reveal occurs once');

  // Купленного нельзя купить повторно (нет двойного списания)
  const balAfter = wallet.balance; $('chest-list').listeners.click({ target: findBtn(uncommon.id) });
  assert.equal(wallet.balance, balAfter, 'owned pet cannot be bought again');
  assert(findBtn(uncommon.id).disabled, 'owned pet becomes disabled');

  $('btn-reward-done').listeners.click(); assert(!shop.isOpen()); assert.equal($('screen-end').inert, false);

  // Сброс отменяет всё
  shop.start(150); buy(uncommon.id); shop.reset(); shop.update(20);
  assert.equal(wallet.balance, 0); assert.equal(wallet.pets.length, 0); assert(!shop.isOpen());
}
console.log('PASS: deterministic pick-shop — chosen pet revealed immediately, exact debit, no reel, affordability gating, no duplicate charges, modal focus, reset cancels, reduced motion reveals without confetti.');
