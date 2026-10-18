/* Предметные события. Локальные SVG и CSS-анимации; без зависимостей. */
(function () {
  "use strict";
  var icons = {
    person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    price: '<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.5"/><path d="m11 11 5 5M14 10l3 3"/>',
    phone: '<path d="M5 3l4 4-2 3a16 16 0 0 0 7 7l3-2 4 4-2 3C10 22 2 14 2 5z"/>',
    message: '<path d="M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4z"/><path d="M8 9h8M8 13h5"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
    card: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20M6 15h4"/>',
    gift: '<rect x="3" y="9" width="18" height="4" rx="1"/><path d="M5 13v8h14v-8M12 9v12M12 9C4 9 5 2 8 3c3 0 4 6 4 6zm0 0s1-6 4-6c4-1 4 6-4 6z"/>',
    transfer: '<path d="M3 7h17m-5-5 5 5-5 5M21 17H4m5-5-5 5 5 5"/>',
    globe: '<circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4" ry="10"/><path d="M2 12h20"/>',
    bell: '<path d="M5 9a7 7 0 0 1 14 0c0 6 2 6 2 8H3c0-2 2-2 2-8M9 21h6"/>',
    calendar: '<rect x="3" y="5" width="18" height="17" rx="3"/><path d="M7 2v6M17 2v6M3 11h18M8 16h2M14 16h2"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m3 6 9 7 9-7"/>',
    coin: '<circle cx="12" cy="12" r="10"/><path d="m12 5 2 4 4 1-3 3 1 5-4-2-4 2 1-5-3-3 4-1z"/>',
    camera: '<path d="M8 5l2-3h4l2 3h5v15H3V5z"/><circle cx="12" cy="12" r="4"/>',
    check: '<path d="m5 12 4 4L20 5"/>',
    sound: '<path d="M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/>'
  };
  var types = {
    call: { label: "Звонок", icon: "phone", motion: "Телефон покачивается, вокруг собеседника расходятся кольца." },
    purchase: { label: "Покупка", icon: "price", motion: "Ценник мягко покачивается над пакетиком покупки." },
    chat: { label: "Переписка", icon: "message", motion: "Появляется индикатор набора, затем выдвигается сообщение." },
    account: { label: "Аккаунт", icon: "lock", motion: "Открывается маленький ноутбук, последовательно появляются точки пароля." },
    card: { label: "Фото карты", icon: "card", motion: "Карта разворачивается в рамке камеры, по ней проходит свет." },
    gift: { label: "Подарок", icon: "gift", motion: "Коробка подпрыгивает и приоткрывает крышку." },
    transfer: { label: "Перевод", icon: "transfer", motion: "Между двумя кошельками появляется стрелка предложения." },
    browser: { label: "Ссылка или письмо", icon: "globe", motion: "Разворачивается маленькое окно браузера или письма; адрес виден рядом." },
    notification: { label: "Уведомление", icon: "bell", motion: "Покачивается значок колокольчика или календаря с точкой нового уведомления." },
    coin: { label: "Монетка", icon: "coin", motion: "Монетка поворачивается и ловит блик." }
  };

  function icon(name, cls) {
    return '<svg class="ev-icon ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[name] || icons.message) + '</svg>';
  }
  function escape(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function scene(s, type) {
    var v = s.visual || {}, art = "", label = types[type].label;
    if (type === "purchase") {
      art = '<span class="ev-shopping-bag"><i></i></span><span class="ev-price-tag">' + icon("price") + '</span>';
    } else if (type === "call") {
      label = "Входящий звонок";
      art = '<div class="ev-phone"><i class="ev-speaker"></i><span class="ev-avatar">' + icon("person") + '</span><span class="ev-receiver">' + icon("phone") + '</span></div><i class="ev-ring r1"></i><i class="ev-ring r2"></i>';
    } else if (type === "chat") {
      art = '<span class="ev-chat-back"></span><span class="ev-chat-front">' + icon("message") + '<i></i><i></i><i></i></span>';
    } else if (type === "account") {
      art = '<div class="ev-laptop">' + icon("lock") + '<span class="ev-dots"><i></i><i></i><i></i></span></div><i class="ev-laptop-base"></i>';
    } else if (type === "card") {
      label = "Просят фото карты";
      art = '<span class="ev-camera-frame"><span class="ev-bank-card">' + icon("card") + '<i></i></span></span>';
    } else if (type === "gift") {
      art = '<span class="ev-gift"><i class="ev-gift-lid"></i><i class="ev-bow"></i><b></b></span><span class="ev-spark">✦</span>';
    } else if (type === "transfer") {
      art = '<span class="ev-wallet from">₽</span><span class="ev-wallet to">₽</span><span class="ev-transfer">' + icon("transfer") + '</span>';
    } else if (type === "browser") {
      label = v.variant === "email" ? "Письмо со ссылкой" : "Прислали ссылку";
      art = '<span class="ev-window"><i></i>' + icon(v.variant === "email" ? "mail" : "globe") + '</span>';
    } else if (type === "notification") {
      label = "Уведомление";
      art = '<span class="ev-notice">' + icon(v.variant === "calendar" ? "calendar" : "bell") + '<i></i></span>';
    } else {
      label = "На твоём пути";
      art = '<span class="ev-big-coin">' + icon("coin") + '</span><i class="ev-coin-shadow"></i>';
    }
    label = v.label || label;
    var sender = v.sender || (type === "browser" ? v.address : "");
    return '<div class="ev-scene"><div class="ev-art" aria-hidden="true">' + art + '</div><div class="ev-copy"><div class="ev-eyebrow">' + escape(label) + '</div>' +
      (sender ? '<div class="ev-sender">' + escape(sender) + '</div>' : '') + '<p class="ev-words">' + escape(s.text) + '</p></div></div>';
  }

  function create(root, options) {
    options = options || {};
    var shown = false, fill = null, stamp = null, countdown = null, lastSecond = -1;
    function show(s) {
      shown = true; lastSecond = -1;
      var type = (s.visual || {}).type;
      if (!types[type]) type = "chat";
      root.className = "event-stage ev-type-" + type + (options.preview ? " event-preview" : "");
      root.innerHTML = '<div class="ev-shell">' + scene(s, type) + '<div class="ev-result" hidden></div></div><div class="ev-timing" aria-hidden="true"><div><span></span></div><small>Выбери действие на дорожке</small></div>';
      root.setAttribute("aria-label", types[type].label + ": " + s.text);
      fill = root.querySelector(".ev-timing span"); stamp = root.querySelector(".ev-result");
      countdown = root.querySelector(".ev-timing small");
    }
    function hide() { shown = false; root.classList.add("hidden"); }
    function resolve(correct) {
      if (!shown) return;
      root.classList.add(correct ? "ev-success" : "ev-miss");
      stamp.hidden = false;
      stamp.innerHTML = correct ? icon("check") + "Верное решение" : "Разберёмся вместе";
    }
    function update(progress, remaining) {
      if (fill) fill.style.transform = "scaleX(" + Math.max(0, Math.min(1, 1 - progress)) + ")";
      var second = Math.max(0, Math.ceil(remaining || 0));
      if (countdown && second !== lastSecond) {
        countdown.textContent = "Выбери действие · " + second + " с";
        lastSecond = second;
      }
    }
    return { show: show, hide: hide, resolve: resolve, update: update,
      destroy: function () { hide(); root.innerHTML = ""; fill = stamp = countdown = null; } };

  }
  window.GameEvents = { create: create, types: types, icon: icon };
})();
