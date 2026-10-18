/* Result-screen shop. Gameplay coins are earned locally and reset with each run. */
(function () {
  "use strict";
  function create(reduced) {
    var data = window.RunRewards, wallet = data.createWallet();
    var active = false, returnTo = null, selected = null;
    var openingTime = 0, spinning = false, settled = false, reelStart = 0, reelEnd = 0;
    var WINNER = 28, OPEN_TIME = .65, SPIN_TIME = 3.8, SETTLE_TIME = .5;
    function resetAnimation() {
      openingTime = 0; spinning = false; settled = false;
      $("reward-opening").classList.add('hidden');
      $("reward-reel").classList.add('hidden');
      $("reward-reel").classList.remove('spinning', 'settled');
      $("reel-track").innerHTML = '';
      $("reel-track").style.transform = '';
      $("reward-dialog").classList.remove('celebrating');
    }
    function spinReel() {
      spinning = true;
      var track = $("reel-track"), purchase = wallet.pending;
      var markup = '';
      for (var i = 0; i < 32; i++) {
        // Как в update/new_finish: 32 карточки, выбранная зверушка в позиции 28.
        // Результат покупки фиксируется один раз; прокрутка его не меняет.
        var pet = i === WINNER ? purchase.pet : data.roll(purchase.chest);
        var rarity = data.rarities[pet.rarity];
        markup += '<div class="reel-card" data-pet-id="' + pet.id + '" style="--card-color:' + rarity.color + '">' + data.art(pet) + '<span class="reel-name">' + pet.name + '</span><span class="reel-rarity">' + rarity.name + '</span></div>';
      }
      track.innerHTML = markup;
      $("reward-opening").classList.add('hidden');
      $("reward-reel").classList.remove('hidden');
      $("reward-reel").classList.add('spinning');
      $("reel-label").textContent = 'Кто станет твоим другом?';
      reelStart = -track.children[0].offsetWidth / 2;
      var winner = track.children[WINNER];
      reelEnd = -(winner.offsetLeft + winner.offsetWidth / 2);
      track.style.transform = 'translateX(' + reelStart + 'px)';
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
    function $(id) { return document.getElementById(id); }
    function chestArt(id) {
      return '<span class="chest-art" data-chest="' + id + '" aria-hidden="true"><span class="chest-glow"></span><span class="chest-base"></span><span class="chest-lid"></span><span class="chest-lock"></span></span>';
    }
    function render() {
      $("shop-balance").textContent = wallet.balance;
      $("chest-list").innerHTML = data.chests.map(function (chest) {
        var missing = Math.max(0, chest.price - wallet.balance);
        return '<button class="chest-choice" data-buy="' + chest.id + '"' + (missing || wallet.pending ? ' disabled' : '') +
          ' aria-label="' + chest.name + ', ' + chest.price + ' монет' + (missing ? ', не хватает ' + missing : '') + '">' +
          chestArt(chest.id) + '<span class="chest-name">' + chest.name.replace(' сундук','') + '</span><span class="chest-price"><i class="coin-dot" aria-hidden="true"></i>' + chest.price + '</span><small>' + (missing ? 'Ещё ' + missing + ' монет' : 'Открыть') + '</small></button>';
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
      $("reward-title").textContent = 'Кто внутри?';
      $("reward-pet").classList.add('hidden');
      $("btn-reward-done").classList.add('hidden');
      $("reward-opening").innerHTML = chestArt(purchase.chest.id);
      $("reward-opening").classList.remove('hidden');
      showOverlay();
      if (reduced) reveal();
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
      update: function (dt) {
        if (!active || !wallet.pending) return;
        openingTime += dt;
        if (openingTime < OPEN_TIME) return;
        if (!spinning) spinReel();
        var progress = Math.min(1, (openingTime - OPEN_TIME) / SPIN_TIME);
        // Время идёт только вместе с игровым циклом: скрытая вкладка не завершает покупку.
        var eased = 1 - Math.pow(1 - progress, 4);
        $("reel-track").style.transform = 'translateX(' + (reelStart + (reelEnd - reelStart) * eased) + 'px)';
        if (progress === 1 && !settled) {
          settled = true;
          $("reward-reel").classList.remove('spinning');
          $("reward-reel").classList.add('settled');
          $("reel-track").children[WINNER].classList.add('winner');
          $("reel-label").textContent = 'Твоя зверушка — ' + wallet.pending.pet.name + '!';
        }
        if (openingTime >= OPEN_TIME + SPIN_TIME + SETTLE_TIME) reveal();
      },
      isOpen: function () { return !$("reward-overlay").classList.contains('hidden'); }
    };
  }
  window.RewardShop = { create: create };
})();
