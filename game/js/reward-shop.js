/* Result-screen shop. Gameplay coins are earned locally and reset with each run.
   Витрина выбора: ребёнок сам выбирает персонажа и покупает его за монеты.
   Никакой случайности, барабанов или ставок — получаешь ровно того, кого выбрал. */
(function () {
  "use strict";
  function create(reduced) {
    var data = window.RunRewards, wallet = data.createWallet();
    var active = false, returnTo = null, selected = null;
    function $(id) { return document.getElementById(id); }
    function resetAnimation() {
      $("reward-opening").classList.add('hidden');
      $("reward-reel").classList.add('hidden');
      $("reward-reel").classList.remove('spinning', 'settled');
      $("reel-track").innerHTML = '';
      $("reel-track").style.transform = '';
      $("reward-dialog").classList.remove('celebrating');
    }
    function celebration() {
      var markup = '<span class="pet-aura" aria-hidden="true"></span><span class="reward-burst" aria-hidden="true">';
      var colors = ['#ffd23f', '#9875ff', '#6bdab7', '#ffa2c3'];
      for (var i = 0; i < 16; i++) {
        var angle = i * Math.PI * 2 / 16;
        markup += '<i style="--dx:' + (Math.cos(angle) * (100 + i % 3 * 12)).toFixed(1) + 'px;--dy:' + (Math.sin(angle) * 87 - 15).toFixed(1) + 'px;--turn:' + (i * 71) + 'deg;--delay:' + (i % 4 * .035) + 's;--confetti:' + colors[i % 4] + '">' + (i % 3 === 0 ? '✦' : '') + '</i>';
      }
      return markup + '</span>';
    }
    function render() {
      $("shop-balance").textContent = wallet.balance;
      // Витрина: все персонажи с ценой. Купленных нельзя купить снова; не хватает монет — видно сколько.
      $("chest-list").innerHTML = data.pets.map(function (pet) {
        var rarity = data.rarities[pet.rarity], price = data.priceOf(pet);
        var owned = wallet.owns(pet.id), missing = Math.max(0, price - wallet.balance);
        var disabled = owned || missing > 0 || wallet.pending;
        var status = owned ? '✓ Уже твой' : missing ? 'Ещё ' + missing : 'Купить';
        var label = pet.name + ', ' + rarity.name + (owned ? ', уже твой' : ', ' + price + ' монет' + (missing ? ', не хватает ' + missing : ''));
        return '<button class="pet-buy' + (owned ? ' owned' : '') + '" data-buy="' + pet.id + '"' + (disabled ? ' disabled' : '') +
          ' style="--pet-color:' + rarity.color + '" aria-label="' + label + '">' +
          '<span class="pet-thumb">' + data.art(pet) + '</span>' +
          '<span class="pet-buy-name">' + pet.name + '</span>' +
          '<span class="pet-buy-price"><i class="coin-dot" aria-hidden="true"></i>' + price + '</span>' +
          '<small>' + status + '</small></button>';
      }).join('');
      $("run-pets").innerHTML = wallet.pets.map(function (pet, index) {
        return '<button class="owned-pet" data-pet="' + index + '" aria-label="' + pet.name + ', ' + data.rarities[pet.rarity].name + '">' + data.art(pet) + '</button>';
      }).join('');
      $("collection-heading").textContent = 'Зверушки забега · ' + wallet.pets.length;
      $("run-collection").classList.toggle('hidden', wallet.pets.length === 0);
    }
    function showPet(pet, fresh) {
      var rarity = data.rarities[pet.rarity];
      $("reward-opening").classList.add('hidden');
      $("reward-reel").classList.add('hidden');
      $("reward-reel").classList.remove('spinning');
      $("reward-dialog").classList.toggle('celebrating', !!fresh && !reduced);
      $("reward-title").textContent = pet.name;
      $("reward-pet").innerHTML = '<div class="pet-reveal" style="--pet-color:' + rarity.color + '">' + (fresh && !reduced ? celebration() : '') + '<div class="pet-art">' + data.art(pet) + '</div></div><span class="pet-rarity" style="--pet-color:' + rarity.color + '">' + rarity.name + '</span><p class="pet-bio">' + pet.bio + '</p><div class="pet-lesson"><strong>' + pet.skill + '</strong><p>' + pet.tip + '</p></div>';
      $("reward-pet").classList.remove('hidden');
      $("btn-reward-done").classList.remove('hidden');
      $("btn-reward-done").focus();
    }
    function reveal() {
      var pet = wallet.reveal();
      if (pet) { selected = pet; render(); showPet(pet, true); }
    }
    function close() {
      if (wallet.pending) return;
      resetAnimation();
      $("reward-overlay").classList.add('hidden');
      window.GamePlatform.block($("screen-end"), false);
      if (returnTo) {
        var target = returnTo === 'pet' ? $("run-pets").querySelector('button') : $("chest-list").querySelector('[data-buy="' + returnTo + '"]');
        if (!target || target.disabled) target = $("btn-again");
        target.focus();
      }
    }
    function showOverlay() {
      $("reward-overlay").classList.remove('hidden');
      window.GamePlatform.block($("screen-end"), true);
      $("reward-dialog").focus();
    }
    $("chest-list").addEventListener('click', function (event) {
      var button = event.target.closest('[data-buy]');
      if (!active || !button || button.disabled) return;
      var purchase = wallet.buy(button.dataset.buy);
      if (!purchase) return;
      returnTo = button.dataset.buy; selected = null; resetAnimation(); render();
      showOverlay();
      // Детерминированно и сразу: показываем ровно выбранного персонажа (без прокрутки).
      reveal();
    });
    $("run-pets").addEventListener('click', function (event) {
      var button = event.target.closest('[data-pet]');
      if (!active || !button || wallet.pending) return;
      selected = wallet.pets[Number(button.dataset.pet)];
      if (!selected) return;
      returnTo = 'pet'; showOverlay(); showPet(selected);
    });
    $("btn-reward-done").addEventListener('click', close);
    $("reward-overlay").addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !wallet.pending) { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        event.preventDefault();
        (wallet.pending ? $("reward-dialog") : $("btn-reward-done")).focus();
      }
    });
    return {
      start: function (coins) { active = true; wallet.begin(coins); resetAnimation(); selected = null; $("screen-end").scrollTop = 0; render(); },
      reset: function () { active = false; wallet.begin(0); resetAnimation(); selected = null; returnTo = null; close(); render(); },
      update: function () { /* Покупка мгновенная — покадровая анимация не нужна. */ },
      isOpen: function () { return !$("reward-overlay").classList.contains('hidden'); }
    };
  }
  window.RewardShop = { create: create };
})();
