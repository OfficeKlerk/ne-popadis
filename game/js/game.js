/* «Не попадись!» — игровая логика. Чистый JS + Canvas 2D. Без внешних зависимостей. */
(function () {
  "use strict";

  // ---------- Мост с приложением (postMessage) ----------
  var Bridge = {
    completedSent: false,
    send: function (type, payload) {
      var msg = { type: type, payload: payload || {} };
      try { window.parent && window.parent.postMessage(msg, "*"); } catch (e) {}
      try { if (window.parent !== window) window.postMessage(msg, "*"); } catch (e) {}
    },
    vibrate: function (ms) { this.send("VIBRATION_EVENT", { duration: ms || 30 }); },
    finish: function (data) { this.send("FINISH_EVENT", data); },
    completed: function (data) { if (!this.completedSent) { this.completedSent = true; this.send("COMPLETED_EVENT", data); } },
    share: function (data) { this.send("SHARING_EVENT", data); },
    close: function () { this.send("CLOSE_EVENT", {}); }
  };

  // ---------- Звук (WebAudio, по умолчанию выключен) ----------
  var Sound = {
    ctx: null, on: false,
    ensure: function () { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } },
    blip: function (freq, dur, type) {
      if (!this.on || !this.ctx || paused || document.hidden) return;
      var t = this.ctx.currentTime;
      var o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.12));
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + (dur || 0.12) + 0.02);
    },
    good: function () { this.blip(660, 0.1, "sine"); var s = this; setTimeout(function () { s.blip(880, 0.1, "sine"); }, 70); },
    bad: function () { this.blip(180, 0.22, "square"); },
    coin: function () { this.blip(990, 0.08, "triangle"); },
    combo: function () { var s = this; [660, 880, 1100, 1320].forEach(function (f, i) { setTimeout(function () { s.blip(f, 0.12, "triangle"); }, i * 70); }); },
    swish: function () { this.blip(420, 0.05, "sine"); }
  };

  // ---------- Утилиты ----------
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function easeOutBack(t) { var c = 1.9; t = t - 1; return 1 + (c + 1) * t * t * t + c * t * t; }

  // ---------- Состояние ----------
  var cv = $("game"), ctx = cv.getContext("2d");
  var eventView = window.GameEvents.create($("event-stage"));
  var DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  var W = 0, H = 0;               // логические размеры (CSS px)
  var LANES = 3;
  var content = null, diff = null;
  var actionLaneById = {}, actionById = {};        // id действия -> индекс дорожки

  var state = "loading";          // loading | start | run | end
  var paused = false;
  var player = { lane: 1, x: 0, targetX: 0, bob: 0 };
  var cards = [];
  var speed = 0, elapsed = 0, roadScroll = 0;
  var course = window.RunnerCourse.create();
  var phase = "road", round = 0, obstaclesCleared = 0, obstacleHits = 0;
  var cityCheer = 0, roadCoins = 0, roadObjects = [];
  var meters = 0, coins = 0, combo = 0, bestCombo = 0, lives = 3;
  var trapsTotal = 0, trapsOK = 0, decisionsTotal = 0, decisionsOK = 0;
  var lastSituation = null;
  var flashTimer = 0;
  var ending = false, endTimer = 0;
  var attractT = 1, tAnim = 0;

  // «Сочность»
  var REDUCED = false;
  try { REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var rewardShop = window.RewardShop.create(REDUCED);
  var shakeT = 0, shakeMag = 0;
  var vignetteT = 0;              // красная вспышка по краям при ошибке
  var squashT = 0;                // деформация героя
  var hopT = 0, hurtT = 0;        // прыжок радости / «ой»
  var STUMBLE_TIME = .88, stumbleT = 0, stumbleDir = 1, shieldLossT = 0;
  var feverGlow = 0;              // плавная подсветка серии
  var laneFlash = [0, 0, 0];      // вспышка дорожки при решении
  var laneHint = [0, 0, 0];       // подсказка «верная дорожка» после ошибки
  var LANE_COLORS = ["#ff4d6d", "#7350ff", "#22c37a"]; // отказать / проверить / можно
  var LANE_RGB = ["255,77,109", "115,80,255", "34,195,122"];
  var EVENT_SYMBOLS = { call: "📞", chat: "💬", account: "🔐", card: "💳", gift: "🎁", transfer: "↔", browser: "✉", notification: "🔔", coin: "🪙" };
  var FONT = "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif";

  // ---------- Геометрия псевдо-перспективы ----------
  // Глубина p: 0 — горизонт, 1 — линия решения (позиция героя). Масштаб r(p) = 1 / (1 + (1-p)K).
  var RT = 0.14;                  // масштаб дороги на горизонте
  var KP = 1 / RT - 1;
  var hy = 0, y0 = 0, pY = 0, rB = 1;
  var roadWidth = 0, roadLeft = 0, roadRight = 0, laneWidth = 0;
  var skyGrad, groundGrad, roadGrad;
  var glowSun, glowGold, glowGreen;
  var townFar, townNear, cloudImg, clouds = [];
  var streakAng = [];
  for (var sa = 0; sa < 12; sa++) streakAng.push(0.12 * Math.PI + (sa / 11) * 0.76 * Math.PI);

  function laneX(i) { return roadLeft + laneWidth * (i + 0.5); }
  function playerY() { return pY; }
  function rOf(p) { return 1 / Math.max(0.22, 1 + (1 - p) * KP); }
  function yOf(r) { return y0 + (pY - y0) * r; }

  function makeGlow(rgb, size) {
    var c = document.createElement("canvas"); c.width = c.height = size;
    var g = c.getContext("2d"), rg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    rg.addColorStop(0, "rgba(" + rgb + ",0.95)"); rg.addColorStop(0.35, "rgba(" + rgb + ",0.35)"); rg.addColorStop(1, "rgba(" + rgb + ",0)");
    g.fillStyle = rg; g.fillRect(0, 0, size, size);
    return c;
  }

  function makeTown(w, h, seed, blur, scale) {
    var c = document.createElement("canvas"); c.width = Math.round(w * DPR); c.height = Math.round(h * DPR);
    var g = c.getContext("2d"); g.scale(DPR, DPR);
    var s = seed;
    function rnd() { s = (s * 16807) % 2147483647; return s / 2147483647; }
    var WALLS = ["#ffffff", "#fff3d6", "#e8f0ff", "#ffe3ea", "#e6fff2"];
    var ROOFS = ["#ff7a92", "#7350ff", "#ffb020", "#22c37a", "#5aa9ff"];
    var x = -6;
    while (x < w) {
      if (rnd() < 0.3) {
        // дерево-шарик
        var tr = (9 + rnd() * 7) * scale, tx = x + tr;
        g.fillStyle = "#b07a4f"; g.fillRect(tx - 2 * scale, h - 10 * scale, 4 * scale, 10 * scale);
        var tg = g.createRadialGradient(tx - tr * 0.35, h - 10 * scale - tr * 1.3, 1, tx, h - 10 * scale - tr, tr * 1.1);
        tg.addColorStop(0, "#9ef07f"); tg.addColorStop(1, "#45b13c");
        g.fillStyle = tg; g.beginPath(); g.arc(tx, h - 10 * scale - tr, tr, 0, 6.2832); g.fill();
        x += tr * 2 + 3;
        continue;
      }
      var bw = (22 + rnd() * 26) * scale, bh = (18 + rnd() * 26) * scale, roofH = (8 + rnd() * 10) * scale;
      var wall = WALLS[(rnd() * WALLS.length) | 0], roof = ROOFS[(rnd() * ROOFS.length) | 0];
      // стена + боковая тень
      g.fillStyle = wall; g.fillRect(x, h - bh, bw, bh);
      g.fillStyle = "rgba(35,36,106,0.08)"; g.fillRect(x + bw * 0.72, h - bh, bw * 0.28, bh);
      // крыша
      g.fillStyle = roof; g.beginPath(); g.moveTo(x - 3, h - bh); g.lineTo(x + bw / 2, h - bh - roofH); g.lineTo(x + bw + 3, h - bh); g.closePath(); g.fill();
      // окна
      g.fillStyle = "#9fd3ff";
      for (var wy = h - bh + 5 * scale; wy < h - 9 * scale; wy += 10 * scale)
        for (var wx = x + 4 * scale; wx < x + bw - 7 * scale; wx += 9 * scale) g.fillRect(wx, wy, 4.5 * scale, 5 * scale);
      x += bw + 2 + rnd() * 6;
    }
    if (!blur) return c;
    // tilt-shift: копия с размытием (если ctx.filter не поддерживается — остаётся чёткой)
    var b = document.createElement("canvas"); b.width = c.width; b.height = c.height;
    var bg = b.getContext("2d");
    try { bg.filter = "blur(" + Math.round(blur * DPR) + "px)"; } catch (e) {}
    bg.drawImage(c, 0, 0);
    return b;
  }

  function makeCloud() {
    var c = document.createElement("canvas"), w = 150, h = 60;
    c.width = w * DPR; c.height = h * DPR;
    var g = c.getContext("2d"); g.scale(DPR, DPR);
    g.fillStyle = "rgba(160,190,235,0.35)";
    g.beginPath(); g.ellipse(76, 48, 66, 9, 0, 0, 6.2832); g.fill();
    g.fillStyle = "#ffffff";
    [[34, 38, 20], [62, 28, 26], [94, 32, 22], [118, 40, 16], [76, 42, 28]].forEach(function (b) { g.beginPath(); g.arc(b[0], b[1], b[2], 0, 6.2832); g.fill(); });
    g.fillRect(30, 38, 92, 16);
    return c;
  }

  // ---------- Размеры ----------
  function resize() {
    var app = $("app");
    W = app.clientWidth; H = app.clientHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layout();
    // Прогресс событий хранится во времени, поэтому поворот/resize не меняет ответ.
    player.x = laneX(player.lane); player.targetX = player.x;
  }

  function layout() {
    pY = Math.min(H * 0.80, H - 145); hy = H * 0.33;
    roadWidth = W * 0.72; laneWidth = roadWidth / LANES;
    roadLeft = (W - roadWidth) / 2; roadRight = roadLeft + roadWidth;
    y0 = (hy - RT * pY) / (1 - RT);
    rB = (H - y0) / (pY - y0);
    skyGrad = ctx.createLinearGradient(0, 0, 0, hy);
    skyGrad.addColorStop(0, "#6ec1ff"); skyGrad.addColorStop(0.6, "#a9dcff"); skyGrad.addColorStop(1, "#e4f5ff");
    groundGrad = ctx.createLinearGradient(0, hy, 0, H);
    groundGrad.addColorStop(0, "#a6eb8c"); groundGrad.addColorStop(1, "#5cc24a");
    roadGrad = ctx.createLinearGradient(0, hy, 0, H);
    roadGrad.addColorStop(0, "#eef2ff"); roadGrad.addColorStop(1, "#ffffff");
    glowSun = makeGlow("255,248,214", 128); glowGold = makeGlow("255,210,63", 64); glowGreen = makeGlow("34,195,122", 96);
    townFar = makeTown(W * 1.3, hy * 0.42, 7, 1.6, 0.7);
    townNear = makeTown(W * 1.3, hy * 0.36, 29, 0.8, 0.95);
    cloudImg = makeCloud();
    clouds = [];
    var s = 11;
    for (var i = 0; i < 5; i++) {
      s = (s * 16807) % 2147483647; var a = s / 2147483647; s = (s * 16807) % 2147483647; var b = s / 2147483647;
      clouds.push({ x: a * W * 1.2 - W * 0.1, y: 8 + b * hy * 0.45, k: 0.45 + b * 0.5, v: 4 + a * 6 });
    }
  }

  // ---------- Загрузка контента ----------
  function loadContent() {
    fetch("content.json", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        content = data;
        diff = data.difficulty;
        (data.actions || []).forEach(function (a) { actionLaneById[a.id] = a.lane; actionById[a.id] = a; });
        showScreen("start");
      })
      .catch(function () {
        // Фолбэк, если fetch недоступен (file://): минимальный контент
        content = FALLBACK; diff = FALLBACK.difficulty;
        FALLBACK.actions.forEach(function (a) { actionLaneById[a.id] = a.lane; actionById[a.id] = a; });
        showScreen("start");
      });
  }

  // ---------- Экраны ----------
  function showScreen(s) {
    state = s;
    if (s !== "run") eventView.hide();
    $("screen-loading").classList.toggle("hidden", s !== "loading");
    $("screen-start").classList.toggle("hidden", s !== "start");
    $("screen-end").classList.toggle("hidden", s !== "end");
    $("hud").classList.toggle("hidden", s !== "run");
    syncPhaseUI();
    if (s !== "run") { $("flash").classList.add("hidden"); }
  }

  function setPaused(value, restoreFocus) {
    if (value && state !== "run") return;
    paused = !!value;
    $("pause-overlay").classList.toggle("hidden", !paused);
    $("app").classList.toggle("is-paused", paused);
    ["hud", "event-stage", "lane-legend"].forEach(function (id) { $(id).inert = paused; });
    if (Sound.ctx) {
      var pending = paused ? Sound.ctx.suspend() : Sound.ctx.resume();
      if (pending && pending.catch) pending.catch(function () {});
    }
    if (paused) $("btn-resume").focus();
    else if (restoreFocus && state === "run") $("btn-pause").focus();
  }
  function exitGame() {
    setPaused(false); eventView.hide(); rewardShop.reset();
    clearFx(); cards = []; counters = []; coins = 0; course.jumpHeight = 0;
    ending = false; showScreen("start"); $("btn-play").focus(); Bridge.close();
  }

  // ---------- Старт забега ----------
  function startRun() {
    setPaused(false); rewardShop.reset(); counters = [];
    eventView.hide();
    player.lane = 1; player.x = laneX(1); player.targetX = player.x; player.bob = 0;
    cards = []; speed = diff.startSpeed; elapsed = 0;
    phase = "road"; round = 0; obstaclesCleared = 0; obstacleHits = 0; roadCoins = 0; cityCheer = 0; roadScroll = 0;
    course.begin(round, diff.runSeconds || 10, diff.runSpeedMultiplier || 1.5);
    meters = 0; coins = 0; combo = 0; bestCombo = 0; lives = diff.lives;
    trapsTotal = 0; trapsOK = 0; decisionsTotal = 0; decisionsOK = 0;
    lastSituation = null; flashTimer = 0; ending = false; endTimer = 0;
    clearFx(); shakeT = 0; vignetteT = 0; squashT = 0; hopT = 0; hurtT = 0; feverGlow = 0;
    laneFlash[0] = laneFlash[1] = laneFlash[2] = 0; laneHint[0] = laneHint[1] = laneHint[2] = 0;
    lastDist = -1; lastCoins = -1;
    renderLives(-1);
    updateCombo(false);
    syncLegend();
    showScreen("run");
    addFloat(W / 2, H * 0.42, "Поехали!", "#ffffff", 30);
    Sound.swish();
  }

  function lifeIcon(className) {
    return '<svg class="' + className + '" viewBox="0 0 28 32" aria-hidden="true"><path d="M14 2L25 6V16Q24 25 14 30Q4 25 3 16V6Z" fill="#22c37a" stroke="#5432e6" stroke-width="2.2" stroke-linejoin="round"/><path d="M8 15l4 4 8-9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function renderLives(lostIdx) {
    var el = $("lives"), s = "";
    for (var i = 0; i < diff.lives; i++) {
      s += '<span aria-hidden="true" class="life' + (i >= lives ? " lost" : "") + (i === lostIdx ? " pop" : "") + '">' + lifeIcon("life-icon");
      if (i === lostIdx && !REDUCED) {
        for (var part = 0; part < 4; part++) s += lifeIcon("life-shard shard-" + part);
      }
      s += '</span>';
    }
    el.innerHTML = s + '<span class="sr-only">Щиты: ' + lives + ' из ' + diff.lives + '</span>';
    el.classList.remove("hit");
    if (lostIdx >= 0) { shieldLossT = 1.15; void el.offsetWidth; el.classList.add("hit"); }
  }

  // ---------- Спавн ситуаций ----------
  function decisionSeconds(distance) {
    // Плавное ускорение: 7 секунд в начале, минус 0,5 с за каждые 200 м, минимум 2 с.
    var initial = Math.max(2, diff.eventReadSeconds || 7);
    return Math.max(2, initial - Math.max(0, distance) / (diff.eventRampMeters || 400));
  }
  function spawnSituation() {
    // Монетка из прежнего каталога теперь собирается на дороге и не требует решения.
    var situations = content.situations.filter(function (s) { return s.delivery !== "pickup"; });
    if (!situations.length) situations = FALLBACK.situations;
    var s = pick(situations);
    var guard = 0;
    while (s === lastSituation && guard++ < 5) s = pick(situations);
    lastSituation = s;
    var lane = actionLaneById[s.answer];
    var duration = decisionSeconds(meters);
    cards.push({
      icon: s.icon, text: s.text, why: s.why, answer: s.answer, visual: s.visual,
      answerLane: lane, isTrap: s.answer !== "ok",
      x: laneX(player.lane), y: -cardH(), resolved: false, result: null, flashT: 0, removeTimer: 0, age: 0, duration: duration
    });
    phase = "decision"; syncPhaseUI();
    eventView.show(s); eventView.update(0, duration);
  }
  function cardH() { return 108; }

  // ---------- Ввод ----------
  function move(dir) {
    if (state !== "run" || paused || ending) return;
    var prev = player.lane;
    player.lane = clamp(player.lane + dir, 0, LANES - 1);
    player.targetX = laneX(player.lane);
    if (player.lane !== prev) { squashT = 0.2; spawnDust(); syncLegend(); Sound.swish(); }
  }
  function syncLegend() {
    var items = document.querySelectorAll("#lane-legend .legend-item");
    for (var i = 0; i < items.length; i++) items[i].classList.toggle("active", i === player.lane);
  }
  function syncPhaseUI() {
    var running = state === "run", choosing = phase !== "road";
    $("app").dataset.phase = phase;
    $("lane-legend").classList.toggle("hidden", !running || !choosing || ending);
  }
  function beginRoad() {
    phase = "road"; round++;
    course.begin(round, diff.runSeconds || 10, diff.runSpeedMultiplier || 1.5);
    syncPhaseUI();
  }
  function jump() {
    if (state !== "run" || paused || phase !== "road" || ending) return;
    if (course.jump()) { Sound.swish(); spawnDust(); }
  }
  function setupInput() {
    document.addEventListener("keydown", function (e) {
      if (state !== "run") return;
      var key = e.key.toLowerCase();
      if (key === "escape" || key === "p" || key === "з") { e.preventDefault(); if (!e.repeat) setPaused(!paused, true); return; }
      if (paused) return;
      if (["arrowleft", "arrowright", "arrowup", "a", "d", "w", " "].indexOf(key) < 0) return;
      // Space на кнопке звука должен работать как обычная активация этой кнопки.
      if (key === " " && (e.target.id === "sound-run" || e.target.id === "btn-pause")) return;
      e.preventDefault();
      if (e.repeat) return;
      if (key === "arrowleft" || key === "a") move(-1);
      else if (key === "arrowright" || key === "d") move(1);
      else jump();
    });
    var sx = 0, sy = 0, pointer = null;
    cv.addEventListener("pointerdown", function (e) {
      if (pointer !== null || !e.isPrimary || e.button !== 0) return;
      sx = e.clientX; sy = e.clientY; pointer = e.pointerId;
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointerup", function (e) {
      if (pointer !== e.pointerId) return;
      pointer = null;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (dy < -24 && Math.abs(dy) > Math.abs(dx)) jump();
      else if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
      else if (Math.abs(dx) < 16 && Math.abs(dy) < 16) move(e.clientX - cv.getBoundingClientRect().left < W / 2 ? -1 : 1);
    });
    cv.addEventListener("pointercancel", function () { pointer = null; });
    document.querySelectorAll("#lane-legend .legend-item").forEach(function (el) {
      el.addEventListener("click", function () { move(Number(el.dataset.lane) - player.lane); });
    });
  }

  // ---------- Пулы эффектов (без аллокаций в кадре) ----------
  var PMAX = 220, particles = [], rings = [], floats = [], coinFlights = [];
  var i0;
  for (i0 = 0; i0 < PMAX; i0++) particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 3, color: "#fff", grav: 0, shape: 0, rot: 0, vr: 0 });
  for (i0 = 0; i0 < 6; i0++) rings.push({ x: 0, y: 0, life: 0, max: 1, r0: 10, r1: 60, color: "255,255,255" });
  for (i0 = 0; i0 < 6; i0++) floats.push({ x: 0, y: 0, life: 0, max: 1, text: "", color: "#fff", size: 20, vy: -50 });
  for (i0 = 0; i0 < 12; i0++) coinFlights.push({ life: 0, max: .68, x: 0, y: 0, cx: 0, cy: 0, tx: 0, ty: 0, scale: 1 });
  var pCursor = 0, rCursor = 0, fCursor = 0;

  function clearFx() {
    for (var i = 0; i < PMAX; i++) particles[i].life = 0;
    for (i = 0; i < rings.length; i++) rings[i].life = 0;
    for (i = 0; i < floats.length; i++) floats[i].life = 0;
    for (i = 0; i < coinFlights.length; i++) coinFlights[i].life = 0;
    $("coins").classList.remove("pop");
    stumbleT = 0; shieldLossT = 0; $("lives").classList.remove("hit");
  }
  function pulseCoinCounter() {
    var badge = $("coins");
    badge.classList.remove("pop"); void badge.offsetWidth; badge.classList.add("pop");
  }
  function collectCoin(c) {
    if (REDUCED) return;
    var r = rOf(c.p), x = sxAt(laneX(c.lane), r), y = yOf(r) + (36 - c.height) * r;
    addRing(x, y, 8, 34, "255,205,63", .28);
    for (var n = 0; n < 5; n++) {
      var a = n * Math.PI * 2 / 5;
      addParticle(x, y, Math.cos(a) * 65, Math.sin(a) * 65 - 25, .28, 3, "#ffd23f", 0);
    }
    for (var i = 0; i < coinFlights.length; i++) {
      var f = coinFlights[i]; if (f.life > 0) continue;
      // DOM geometry is read once at pickup, never during a frame's rendering.
      var target = $("coin-target").getBoundingClientRect(), field = cv.getBoundingClientRect();
      f.x = x; f.y = y; f.scale = r;
      f.tx = (target.left + target.width / 2 - field.left) * W / field.width;
      f.ty = (target.top + target.height / 2 - field.top) * H / field.height;
      f.cx = clamp(x + (x < W / 2 ? 55 : -55), 24, W - 24); f.cy = y - 135;
      f.life = f.max;
      break;
    }
  }
  function drawCoinFlights() {
    for (var i = 0; i < coinFlights.length; i++) {
      var f = coinFlights[i]; if (f.life <= 0) continue;
      var age = 1 - f.life / f.max;
      // A short pickup pop, then an accelerating arc into the coin counter.
      var t = clamp((age - .12) / .88, 0, 1); t *= t;
      var u = 1 - t, x = u*u*f.x + 2*u*t*f.cx + t*t*f.tx, y = u*u*f.y + 2*u*t*f.cy + t*t*f.ty;
      var scale = lerp(f.scale, .46, t) * (1 + .22 * Math.sin(Math.min(1, age / .24) * Math.PI));
      ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
      ctx.globalAlpha = .45; ctx.drawImage(glowGold, -31, -31, 62, 62); ctx.globalAlpha = 1;
      ctx.rotate(Math.sin(age * Math.PI) * .3);
      drawCoinFace(.85 + .15 * Math.cos(age * 10));
      ctx.restore();
    }
  }
  function addParticle(x, y, vx, vy, life, size, color, grav, shape) {
    var p = null, i;
    for (i = 0; i < PMAX; i++) { var q = particles[(pCursor + i) % PMAX]; if (q.life <= 0) { p = q; pCursor = (pCursor + i + 1) % PMAX; break; } }
    if (!p) return;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.color = color; p.grav = grav || 0;
    p.shape = shape || 0; p.rot = Math.random() * 6; p.vr = (Math.random() - 0.5) * 14;
  }
  function addRing(x, y, r0, r1, rgb, life) {
    var r = rings[rCursor]; rCursor = (rCursor + 1) % rings.length;
    r.x = x; r.y = y; r.r0 = r0; r.r1 = r1; r.color = rgb; r.life = life; r.max = life;
  }
  function addFloat(x, y, text, color, size) {
    var f = floats[fCursor]; fCursor = (fCursor + 1) % floats.length;
    f.x = x; f.y = y; f.text = text; f.color = color; f.size = size; f.life = 0.9; f.max = 0.9; f.vy = -60;
  }
  function spawnBurst(x, y, color) {
    if (REDUCED) { addParticle(x, y, 0, -40, 0.4, 6, color, 0); return; }
    var n = 14;
    for (var i = 0; i < n; i++) {
      var a = (Math.PI * 2 * i) / n + Math.random() * 0.4, s = 120 + Math.random() * 160;
      addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s - 60, 0.5 + Math.random() * 0.3, 4 + Math.random() * 4, color, 420);
    }
  }
  function spawnCoins(x, y) {
    if (REDUCED) return;
    for (var i = 0; i < 6; i++) {
      addParticle(x + (Math.random() - 0.5) * 30, y, (Math.random() - 0.5) * 120, -220 - Math.random() * 120, 0.65, 7, "#ffc24b", 650);
    }
  }
  var CONFETTI = ["#21a038", "#00c1a0", "#ffc24b", "#3e9bff", "#ff5a5f", "#ffffff"];
  function spawnConfetti(x, y, n, up) {
    if (REDUCED) return;
    for (var i = 0; i < n; i++) {
      var a = up ? -Math.PI / 2 + (Math.random() - 0.5) * 2.2 : Math.PI / 2 + (Math.random() - 0.5) * 0.6;
      var s = up ? 220 + Math.random() * 300 : 60 + Math.random() * 120;
      addParticle(x + (up ? 0 : (Math.random() - 0.5) * W), y, Math.cos(a) * s, Math.sin(a) * s, 1.1 + Math.random() * (up ? 0.6 : 1.4), 5 + Math.random() * 3, CONFETTI[i % CONFETTI.length], up ? 520 : 140, 1);
    }
  }
  function spawnDust() {
    if (REDUCED) return;
    var y = playerY() + 34;
    for (var i = 0; i < 5; i++) addParticle(player.x, y, (Math.random() - 0.5) * 90, -Math.random() * 40, 0.35, 3 + Math.random() * 3, "rgba(255,255,255,0.5)", 120);
  }
  function updateFx(dt) {
    var i, p;
    for (i = 0; i < PMAX; i++) {
      p = particles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    for (i = 0; i < rings.length; i++) if (rings[i].life > 0) rings[i].life -= dt;
    for (i = 0; i < floats.length; i++) { var f = floats[i]; if (f.life > 0) { f.life -= dt; f.y += f.vy * dt; } }
    for (i = 0; i < coinFlights.length; i++) {
      var coin = coinFlights[i]; if (coin.life <= 0) continue;
      coin.life = Math.max(0, coin.life - dt);
      if (coin.life === 0 && state === "run") pulseCoinCounter();
    }
  }
  function drawFx() {
    var i, p, a;
    for (i = 0; i < PMAX; i++) {
      p = particles[i];
      if (p.life <= 0) continue;
      a = p.life / p.max; if (a > 1) a = 1;
      ctx.globalAlpha = a; ctx.fillStyle = p.color;
      if (p.shape === 1) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size * 0.5, -p.size * 0.3, p.size, p.size * 0.6); ctx.restore();
      } else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a + 1, 0, 6.2832); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < rings.length; i++) {
      var r = rings[i]; if (r.life <= 0) continue;
      var t = 1 - r.life / r.max;
      ctx.strokeStyle = "rgba(" + r.color + "," + (1 - t) * 0.8 + ")"; ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, lerp(r.r0, r.r1, t), lerp(r.r0, r.r1, t) * 0.55, 0, 0, 6.2832); ctx.stroke();
    }
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (i = 0; i < floats.length; i++) {
      var f = floats[i]; if (f.life <= 0) continue;
      var k = 1 - f.life / f.max, sc = k < 0.15 ? easeOutBack(k / 0.15) : 1;
      ctx.globalAlpha = f.life / f.max > 0.35 ? 1 : f.life / f.max / 0.35;
      ctx.font = "900 " + Math.round(f.size * sc) + "px " + FONT;
      ctx.lineWidth = 5; ctx.strokeStyle = "rgba(8,18,28,0.75)"; ctx.lineJoin = "round";
      ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
  function shake(mag) { if (REDUCED) return; shakeT = 0.3; shakeMag = mag; }

  // ---------- Разрешение карточки ----------
  var PRAISE = { refuse: ["Отказ!", "Не дался!", "Стоп!"], check: ["Проверил!", "Умно!", "Сверил!"], ok: ["Верно!", "Можно!", "Точно!"] };
  function resolveCard(c) {
    c.resolved = true;
    phase = "feedback"; syncPhaseUI();
    decisionsTotal++;
    if (c.isTrap) trapsTotal++;
    var correct = player.lane === c.answerLane;
    eventView.resolve(correct);
    c.result = correct ? "ok" : "bad";
    c.flashT = 0.5;
    c.removeTimer = 0.5;
    var hy2 = playerY();
    if (correct) {
      decisionsOK++;
      if (c.isTrap) trapsOK++;
      combo++; bestCombo = Math.max(bestCombo, combo);
      var gain = 1 + Math.floor(combo / 3);
      coins += gain;
      Bridge.vibrate(25); Sound.good();
      spawnBurst(player.x, hy2, LANE_COLORS[c.answerLane]);
      spawnBurst(player.x, hy2 - 10, "#ffffff");
      spawnCoins(player.x, hy2);
      addRing(player.x, hy2 + 30, 14, 90, LANE_RGB[c.answerLane], 0.5);
      laneFlash[c.answerLane] = 0.5;
      addFloat(player.x, hy2 - 62, pick(PRAISE[c.answer] || PRAISE.ok), "#ffffff", 22);
      addFloat(player.x + 34, hy2 - 30, "+" + gain, "#ffc24b", 20);
      squashT = 0.16; hopT = 0.36;
      if (combo === 3 || (combo > 3 && combo % 4 === 0)) {
        spawnConfetti(player.x, hy2 - 10, 26, true);
        addFloat(W / 2, H * 0.4, "Комбо x" + (1 + Math.floor(combo / 3)) + "!", "#ffc24b", 36);
        addRing(player.x, hy2 + 30, 20, 190, "255,194,75", 0.65);
        Sound.combo();
      }
      updateCombo(true);
    } else {
      var hadCombo = combo > 0;
      combo = 0; updateCombo(false);
      lives--; renderLives(lives);
      Bridge.vibrate(70); Sound.bad();
      shake(10); vignetteT = 0.5; squashT = 0.22; hurtT = 0.55;
      laneHint[c.answerLane] = 1.6;
      spawnBurst(player.x, hy2 - 30, "#ff5a5f"); spawnBurst(player.x, hy2, "#ff8a8e");
      addFloat(player.x, hy2 - 62, hadCombo ? "Серия прервана" : "Ой!", "#ff8a8e", 22);
      showFlash(c);
      eventView.hide();
      if (lives <= 0) { ending = true; endTimer = Math.max(2, flashTimer); syncPhaseUI(); }
    }
  }

  function updateCourse(dt) {
    var events = course.update(dt, (player.x - roadLeft) / laneWidth - 0.5, 21 / laneWidth);
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.type === "land") { squashT = 0.17; spawnDust(); }
      if (e.type === "clear" && !ending) {
        obstaclesCleared++;
        if (e.jumped) addFloat(player.x, playerY() - 70, "Прыжок!", "#ffc24b", 19);
        if (e.jumped) addRing(player.x, playerY() + 34, 12, 55, "255,194,75", .4);
      }
      if (e.type === "coin" && !ending) {
        coins++; roadCoins++; cityCheer = 1.5; Sound.coin();
        collectCoin(e.coin);
      }
      if (e.type === "hit" && !ending) {
        obstacleHits++; lives--; renderLives(lives); combo = 0; updateCombo(false);
        stumbleT = REDUCED ? 0 : STUMBLE_TIME;
        stumbleDir = player.x < laneX(e.obstacle.lane) ? -1 : 1;
        shake(3); vignetteT = REDUCED ? 0 : .22; hurtT = STUMBLE_TIME; Bridge.vibrate(50); Sound.bad();
        if (!REDUCED) {
          spawnDust(); addRing(player.x, playerY() + 30, 10, 46, "255,133,162", .35);
        }
        if (lives <= 0) { ending = true; endTimer = 1.4; syncPhaseUI(); }
      }
    }

    if (course.ready && !ending) spawnSituation();
  }

  function updateCombo(pop) {
    var el = $("combo");
    if (combo >= 2) {
      el.textContent = "🔥 x" + (1 + Math.floor(combo / 3));
      el.classList.remove("hidden");
      if (pop) { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
    } else el.classList.add("hidden");
  }

  function showFlash(c) {
    var el = $("flash");
    var a = actionById[c.answer] || {};
    el.innerHTML = '<span class="flash-icon">' + c.icon + "</span>" + escapeHtml(c.why) +
      '<div class="flash-ans">Верно: ' + (a.emoji || "") + " " + escapeHtml(a.label || "") + "</div>";
    el.classList.remove("hidden");
    el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
    flashTimer = Math.max(3.2, c.why.split(/\s+/).length * 0.22);
  }

  // ---------- Конец забега ----------
  var counters = [];
  function countTo(id, to, suffix, delay) { counters.push({ el: $(id), to: to, t: -delay, suf: suffix || "" }); $(id).textContent = "0" + (suffix || ""); }

  function endRun() {
    if (state !== "run") return;
    setPaused(false);
    showScreen("end");
    cards = []; course.obstacles.length = 0; course.coins.length = 0; course.jumpHeight = 0; clearFx();
    counters = [];
    countTo("end-distance", Math.round(meters), "", 0.1);
    countTo("end-coins", coins, "", 0.2);
    countTo("end-recognized", trapsOK, "", 0.3);
    var pct = decisionsTotal ? decisionsOK / decisionsTotal : 0;
    var verdict = !decisionsTotal ? "Каждый забег — новая попытка. У тебя получится!" :
      pct >= .9 ? "Отличная внимательность! Продолжай в том же духе." :
      pct >= .6 ? "Хороший забег! Продолжай замечать ловушки." :
      "С каждым забегом ты внимательнее. Попробуй ещё!";
    $("end-verdict").textContent = verdict;
    rewardShop.start(coins);

    Bridge.finish({ meters: Math.round(meters), coins: coins, trapsOK: trapsOK, trapsTotal: trapsTotal, bestCombo: bestCombo });
    Bridge.completed({ meters: Math.round(meters), trapsOK: trapsOK, trapsTotal: trapsTotal });
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  // ---------- Обновление ----------
  var lastDist = -1, lastCoins = -1;
  function update(dt) {
    if (paused) return;
    rewardShop.update(dt);
    tAnim += dt;
    cityCheer = Math.max(0, cityCheer - dt);
    var i;
    // общие эффекты
    updateFx(dt);
    if (shakeT > 0) shakeT -= dt;
    if (vignetteT > 0) vignetteT -= dt;
    if (squashT > 0) squashT -= dt;
    if (hopT > 0) hopT -= dt;
    if (hurtT > 0) hurtT -= dt;
    if (stumbleT > 0) stumbleT = Math.max(0, stumbleT - dt);
    if (shieldLossT > 0) {
      shieldLossT = Math.max(0, shieldLossT - dt);
      if (shieldLossT === 0) renderLives(-1);
    }
    for (i = 0; i < 3; i++) { if (laneFlash[i] > 0) laneFlash[i] -= dt; if (laneHint[i] > 0) laneHint[i] -= dt; }
    feverGlow = lerp(feverGlow, state === "run" && combo >= 3 ? 1 : 0, Math.min(1, dt * 5));
    for (i = 0; i < counters.length; i++) {
      var ct = counters[i]; ct.t += dt;
      if (ct.t < 0) continue;
      var k = Math.min(1, ct.t / 0.8); k = 1 - (1 - k) * (1 - k);
      ct.el.textContent = Math.round(ct.to * k) + ct.suf;
    }

    if (state !== "run") {
      // «витрина» на старте/финише: дорога едет, герой сам перебегает дорожки
      roadScroll += 150 * dt;
      player.bob += dt * 12;
      player.x = lerp(player.x, player.targetX, Math.min(1, dt * 8));
      attractT -= dt;
      if (attractT <= 0 && (state === "start" || state === "end")) {
        attractT = 1.1 + Math.random() * 0.8;
        var nl = (player.lane + (Math.random() < 0.5 ? -1 : 1) + LANES) % LANES;
        player.lane = nl; player.targetX = laneX(nl); squashT = 0.2;
      }
      return;
    }

    elapsed += dt;
    speed = Math.min(diff.maxSpeed, diff.startSpeed + elapsed * diff.speedRampPerSec) * (0.68 + 0.32 * Math.min(1, elapsed / 20)) * (diff.runSpeedMultiplier || 1.5);
    meters += speed * dt * 0.09;
    roadScroll += speed * dt;
    player.x = lerp(player.x, player.targetX, Math.min(1, dt * 14));
    player.bob += dt * (11 + speed / 90);

    if (phase === "road" && !ending) updateCourse(dt);
    if (phase === "feedback" && cards.length === 0 && flashTimer <= 0 && !ending) {
      beginRoad();
    }

    // движение карточек
    var pYY = playerY();
    for (var j = cards.length - 1; j >= 0; j--) {
      var c = cards[j];
      c.age += dt;
      if (!c.resolved) {
        c.y = lerp(-cardH(), pYY - cardH(), clamp(c.age / c.duration, 0, 1));
        eventView.update(c.age / c.duration, c.duration - c.age);
        // карточка «едет» за героем на выбранную дорожку — связь выбора и действия
        c.x = lerp(c.x, laneX(player.lane), Math.min(1, dt * 10));
        if (c.age >= c.duration) resolveCard(c);
      } else {
        c.removeTimer -= dt;
      }
      if (c.flashT > 0) c.flashT -= dt;
      if (c.resolved && c.removeTimer <= 0) { cards.splice(j, 1); eventView.hide(); }
    }

    if (ending) { endTimer -= dt; if (endTimer <= 0) { ending = false; endRun(); return; } }

    // таймер вспышки
    if (flashTimer > 0) { flashTimer -= dt; if (flashTimer <= 0) $("flash").classList.add("hidden"); }

    // HUD (DOM трогаем только при изменении)
    var dm = Math.round(meters);
    if (dm !== lastDist) { lastDist = dm; $("distance").textContent = dm + " м"; }
    if (coins !== lastCoins) {
      $("coins-n").textContent = coins;
      if (lastCoins >= 0 && !coinFlights.some(function (f) { return f.life > 0; })) pulseCoinCounter();
      lastCoins = coins;
    }
  }

  // ---------- Рендер ----------
  var ghostX = [0, 0, 0, 0];
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shakeT > 0) {
      var m = shakeMag * (shakeT / 0.3);
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    drawRoad();
    window.GameCity.draw(ctx, { width: W, height: H, roadWidth: roadWidth, time: tAnim, scroll: roadScroll, cheer: cityCheer, reduced: REDUCED, perspective: KP, yOf: yOf, sxAt: sxAt });
    roadObjects.length = 0;
    if (state === "run" && phase === "road") {
      Array.prototype.push.apply(roadObjects, course.obstacles);
      Array.prototype.push.apply(roadObjects, course.coins);
      roadObjects.sort(function (a, b) { return a.p - b.p; });
    }
    drawRoadObjects(false);
    for (var i = 0; i < cards.length; i++) drawCard(cards[i]);
    drawPlayer();
    drawRoadObjects(true);
    drawFx();
    ctx.restore();
    drawVignette();
    drawCoinFlights();
    drawShieldLoss();
  }

  function drawShieldLoss() {
    if (shieldLossT <= 0 || state !== "run") return;
    var t = 1 - shieldLossT / 1.15;
    var x = clamp(player.x, 52, W - 52), y = playerY() - course.jumpHeight - 75 - (REDUCED ? 0 : t * 18);
    ctx.save(); ctx.globalAlpha = t < .78 ? 1 : (1 - t) / .22;
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#ff85a2"; ctx.lineWidth = 2;
    roundRect(x - 44, y - 15, 88, 30, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#b32a50"; ctx.font = "900 16px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("−1 щит", x, y); ctx.restore();
  }

  function drawVignette() {
    if (vignetteT <= 0) return;
    var a = Math.min(0.55, vignetteT);
    var g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.72);
    g.addColorStop(0, "rgba(255,70,70,0)");
    g.addColorStop(1, "rgba(255,40,40," + a + ")");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // X на экране для «нижней» координаты xb на глубине-масштабе r
  function sxAt(xb, r) {
    var follow = REDUCED ? 0 : (player.x - W / 2) * .075;
    return W / 2 + (xb - W / 2) * r - follow * (1 - r);
  }

  function drawRoad() {
    var i, j, r, y, N, ph, fl, u = roadScroll / pY;

    // небо, солнце, облака
    ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, hy + 1);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(glowSun, W * 0.55, -W * 0.3, W * 0.8, W * 0.8);
    ctx.globalAlpha = 1;
    for (i = 0; i < clouds.length; i++) {
      var cl = clouds[i], cw = 150 * cl.k, chh = 60 * cl.k;
      var cx = ((cl.x + (REDUCED ? 0 : tAnim * cl.v)) % (W + cw * 2)) - cw;
      ctx.drawImage(cloudImg, cx, cl.y, cw, chh);
    }
    // городок с параллаксом (реагирует на положение героя)
    var off = REDUCED ? 0 : (player.x - W / 2);
    var fw = W * 1.3, farH = hy * 0.42, nearH = hy * 0.36;
    // Keep the vanishing point clear: no background tree or house blocks the street.
    var horizonLeft = sxAt(roadLeft, RT) - 9, horizonRight = sxAt(roadRight, RT) + 9;
    ctx.save(); ctx.beginPath();
    ctx.rect(0, 0, horizonLeft, hy + 4); ctx.rect(horizonRight, 0, W - horizonRight, hy + 4); ctx.clip();
    ctx.drawImage(townFar, -W * 0.15 - off * 0.05, hy - farH + 2, fw, farH);
    ctx.drawImage(townNear, -W * 0.15 - off * 0.12, hy - nearH + 3, fw, nearH);
    ctx.restore();

    // земля + дорога
    ctx.fillStyle = groundGrad; ctx.fillRect(0, hy, W, H - hy);
    var tl = sxAt(roadLeft, RT), tr = sxAt(roadRight, RT), bl = sxAt(roadLeft, rB), br = sxAt(roadRight, rB);
    // Тротуары отделяют дорогу от домов; камера смотрит вдоль улицы с меньшей высоты.
    for (var side = -1; side <= 1; side += 2) {
      var edge = side < 0 ? roadLeft : roadRight, outer = edge + side * W * .22;
      ctx.fillStyle = "#d4ddf2"; ctx.beginPath();
      ctx.moveTo(sxAt(edge,RT),hy); ctx.lineTo(sxAt(outer,RT),hy); ctx.lineTo(sxAt(outer,rB),H); ctx.lineTo(sxAt(edge,rB),H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle="#a4b4d866"; ctx.lineWidth=2;
      for(var tile=0;tile<15;tile++){
        var depth=(tile+(u*6)%1)/12, sc=rOf(depth), yy=yOf(sc);if(yy>H)break;
        ctx.beginPath();ctx.moveTo(sxAt(edge,sc),yy);ctx.lineTo(sxAt(outer,sc),yy);ctx.stroke();
      }
    }
    ctx.fillStyle = roadGrad;
    ctx.beginPath(); ctx.moveTo(tl, hy); ctx.lineTo(tr, hy); ctx.lineTo(br, H); ctx.lineTo(bl, H); ctx.closePath(); ctx.fill();

    ctx.save(); ctx.clip();
    // полосы-«шпалы» в перспективе — главный источник ощущения скорости
    N = 8; ph = (u * N) % 1; fl = Math.floor(u * N);
    ctx.fillStyle = "rgba(115,80,255,0.045)";
    for (i = 0; i <= N; i++) {
      if (((i - fl) & 1) === 0) continue;
      var pa = clamp((i - 1 + ph) / N, 0, 1.3), pb = clamp((i + ph) / N, 0, 1.3);
      var ya = yOf(rOf(pa)), yb = yOf(rOf(pb));
      if (yb > ya && ya < H) ctx.fillRect(0, ya, W, Math.min(yb, H) - ya + 1);
    }

    // дорожки: подсветка цветом действия (активная ярче) + вспышки
    for (i = 0; i < LANES; i++) {
      var active = i === player.lane && state === "run";
      var choosing = state === "run" && phase !== "road";
      var a = choosing ? (active ? 0.17 : 0.06) : (active ? 0.06 : 0.015);
      if (laneFlash[i] > 0) a += laneFlash[i] * 0.5;
      if (laneHint[i] > 0) a += (0.18 + 0.18 * Math.sin(tAnim * 18)) * Math.min(1, laneHint[i]);
      var x0 = roadLeft + laneWidth * i, x1 = x0 + laneWidth;
      ctx.fillStyle = "rgba(" + (choosing ? LANE_RGB[i] : "115,80,255") + "," + a + ")";
      ctx.beginPath();
      ctx.moveTo(sxAt(x0, RT) + 2, hy); ctx.lineTo(sxAt(x1, RT) - 2, hy);
      ctx.lineTo(sxAt(x1, rB) - 2, H); ctx.lineTo(sxAt(x0, rB) + 2, H); ctx.closePath(); ctx.fill();
    }

    // неоновые края дороги (золотые при серии)
    var edgeCol = feverGlow > 0.02 ? "rgba(255,194,75," + (0.55 + feverGlow * 0.4) + ")" : "rgba(255,255,255,.95)";
    ctx.strokeStyle = edgeCol; ctx.lineWidth = 3 + feverGlow * 2;
    ctx.beginPath(); ctx.moveTo(tl, hy); ctx.lineTo(bl, H); ctx.moveTo(tr, hy); ctx.lineTo(br, H); ctx.stroke();
    if (feverGlow > 0.05) {
      ctx.strokeStyle = "rgba(255,194,75," + feverGlow * 0.16 + ")"; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(tl, hy); ctx.lineTo(bl, H); ctx.moveTo(tr, hy); ctx.lineTo(br, H); ctx.stroke();
    }

    // разделители-пунктир: трапеции, сходящиеся к горизонту
    N = 9; ph = (u * N) % 1;
    ctx.fillStyle = "rgba(115,80,255,0.28)";
    ctx.beginPath();
    for (i = 0; i <= N + 3; i++) {
      var pd = (i - 1 + ph) / N, pe = pd + 0.5 / N;
      if (pe <= 0) continue; if (pd >= 1.3) break;
      pd = Math.max(0, pd); pe = Math.min(1.3, pe);
      var ra = rOf(pd), rb = rOf(pe), ya2 = yOf(ra), yb2 = yOf(rb);
      if (ya2 >= H) break;
      for (j = 1; j < LANES; j++) {
        var xb = roadLeft + laneWidth * j, wa = 1.6 * ra, wb = 1.6 * rb;
        ctx.moveTo(sxAt(xb, ra) - wa, ya2); ctx.lineTo(sxAt(xb, ra) + wa, ya2);
        ctx.lineTo(sxAt(xb, rb) + wb, yb2); ctx.lineTo(sxAt(xb, rb) - wb, yb2); ctx.closePath();
      }
    }
    ctx.fill();

    // стрелки-шевроны в цвет дорожек (бегут к герою, ярче в нижней трети)
    N = 5; ph = (u * N + 0.5) % 1;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (j = 0; j < LANES; j++) {
      ctx.strokeStyle = "rgba(" + (phase === "road" ? "115,80,255,0.17" : LANE_RGB[j] + ",0.5") + ")";
      ctx.beginPath();
      var cxb = laneX(j);
      for (i = 0; i <= N + 1; i++) {
        var pc = (i - 1 + ph) / N; if (pc < 0.05) continue; if (pc > 1.22) break;
        var rc = rOf(pc), yc = yOf(rc), sz = 15 * rc, cx2 = sxAt(cxb, rc);
        if (yc > H - 4) break;
        ctx.moveTo(cx2 - sz, yc + sz * 0.5); ctx.lineTo(cx2, yc - sz * 0.5); ctx.lineTo(cx2 + sz, yc + sz * 0.5);
      }
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }

    // линия решения — «сканер» на уровне героя
    ctx.fillStyle = "rgba(255,255,255," + (0.07 + 0.05 * Math.sin(tAnim * 5)) + ")";
    if (phase !== "road") ctx.fillRect(roadLeft, pY + 31, roadWidth, 3);
    ctx.restore();

    // Две линии бордюра и фонари подчёркивают глубину улицы.
    for (var curb = -1; curb <= 1; curb += 2) {
      var rx = W / 2 + curb * (roadWidth / 2 + 7);
      ctx.strokeStyle = "#ffffffcc"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sxAt(rx,RT),hy); ctx.lineTo(sxAt(rx,rB),H); ctx.stroke();
    }

    // скоростные линии, разлетающиеся от горизонта
    if (state === "run" && !REDUCED) {
      var spd = clamp((speed / (diff.runSpeedMultiplier || 1.5) - diff.startSpeed) / (diff.maxSpeed - diff.startSpeed), 0, 1);
      ctx.strokeStyle = "rgba(255,255,255," + (0.04 + spd * 0.09) + ")";
      ctx.lineWidth = 2;
      ctx.beginPath();
      var cnt = 9 + Math.round(spd * 3), L = H * 1.1, vy = hy - 4;
      for (i = 0; i < cnt; i++) {
        var t = (i * 0.0833 + u * 2.4) % 1, d1 = t * t * L, d2 = d1 + 10 + t * (50 + spd * 80);
        var ca = Math.cos(streakAng[i]), sa2 = Math.sin(streakAng[i]);
        ctx.moveTo(W / 2 + ca * d1 * 1.2, vy + sa2 * d1); ctx.lineTo(W / 2 + ca * d2 * 1.2, vy + sa2 * d2);
      }
      ctx.stroke();
    }
  }

  function drawRoadObjects(foreground) {
    for (var i = 0; i < roadObjects.length; i++) {
      var o = roadObjects[i];
      if (o.p < 0 || (o.p > 1.012) !== foreground) continue;
      if (o.type === "coin") drawCoin(o); else drawObstacle(o);
    }
  }
  function drawCoin(c) {
    var r = rOf(c.p), x = sxAt(laneX(c.lane), r), ground = yOf(r) + 36 * r;
    if (ground - c.height * r > H + 60) return;
    ctx.save(); ctx.translate(x, ground); ctx.scale(r,r);
    ctx.fillStyle="rgba(0,10,18,.3)";ctx.beginPath();ctx.ellipse(0,2,15,4,0,0,Math.PI*2);ctx.fill();
    ctx.translate(0,-c.height);
    ctx.globalAlpha=.35;ctx.drawImage(glowGold,-29,-29,58,58);ctx.globalAlpha=1;
    var turn = REDUCED ? .95 : .72 + .28 * Math.sin(tAnim * 3 + c.id * .4);
    drawCoinFace(turn); ctx.restore();
  }
  function drawCoinFace(turn) {
    ctx.save(); ctx.scale(turn,1);
    ctx.fillStyle="#b07d28";ctx.beginPath();ctx.ellipse(3,0,15,19,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#ffc64b";ctx.beginPath();ctx.ellipse(0,0,15,19,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#fff1a3";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,12,16,0,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle="#ba8124";ctx.beginPath();
    for(var i=0;i<10;i++){var a=-Math.PI/2+i*Math.PI/5,sz=i%2?4:9;var px=Math.cos(a)*sz,py=Math.sin(a)*sz*1.18;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}
    ctx.closePath();ctx.fill();ctx.restore();
  }
  function drawObstacle(o) {
      var r = rOf(o.p), x = sxAt(laneX(o.lane), r), y = yOf(r) + 36 * r;
      var w = laneWidth * .58;
      ctx.save(); ctx.translate(x, y); ctx.scale(r, r);
      if (o.hit) ctx.globalAlpha = .42;
      ctx.fillStyle = "rgba(71,50,128,.18)";
      ctx.beginPath(); ctx.ellipse(0, 3, w * .66, 9, 0, 0, Math.PI * 2); ctx.fill();
      if (o.type === "barrier") {
        // Низкая перекладина: золотая верхняя грань, диагональные сигнальные полосы.
        ctx.fillStyle = "#8d81bd";
        roundRect(-w / 2 + 4, -38, 8, 38, 3); ctx.fill();
        roundRect(w / 2 - 12, -38, 8, 38, 3); ctx.fill();
        ctx.fillStyle = "#ffd23f"; roundRect(-w / 2, -47, w, 25, 4); ctx.fill();
        ctx.save(); roundRect(-w / 2, -47, w, 25, 4); ctx.clip();
        ctx.strokeStyle = "#b38332"; ctx.lineWidth = 9;
        for (var j = -w; j < w; j += 24) { ctx.beginPath(); ctx.moveTo(j, -22); ctx.lineTo(j + 20, -47); ctx.stroke(); }
        ctx.restore();
        ctx.strokeStyle = "#ffe2a2"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-w / 2 + 4, -46); ctx.lineTo(w / 2 - 4, -46); ctx.stroke();
        // Рисованная стрелка вверх обозначает доступный прыжок.
        ctx.fillStyle = "#7350ff"; roundRect(-13, -43, 26, 19, 5); ctx.fill();
        ctx.strokeStyle = "#ffe4a1"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0,-28); ctx.lineTo(0,-39); ctx.moveTo(-5,-34); ctx.lineTo(0,-39); ctx.lineTo(5,-34); ctx.stroke();
      } else {
        // Два высоких грузовых ящика: их высота явно больше высоты прыжка.
        var bw = w * .88;
        ctx.fillStyle = "#aa91e6"; roundRect(-bw / 2, -132, bw, 132, 5); ctx.fill();
        ctx.fillStyle = "#dbc9ff";
        ctx.beginPath(); ctx.moveTo(-bw / 2,-132); ctx.lineTo(-bw / 2 + 10,-141); ctx.lineTo(bw / 2 + 10,-141); ctx.lineTo(bw / 2,-132); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#8161bd";
        ctx.beginPath(); ctx.moveTo(bw / 2,-132); ctx.lineTo(bw / 2+10,-141); ctx.lineTo(bw / 2+10,-10); ctx.lineTo(bw / 2,0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#eee6ff"; ctx.lineWidth = 3;
        for (var k = 0; k < 2; k++) {
          var top = -128 + k * 66;
          ctx.strokeRect(-bw / 2 + 5,top,bw - 10,57);
          ctx.beginPath(); ctx.moveTo(-bw / 2 + 7,top + 4); ctx.lineTo(bw / 2 - 7,top + 53); ctx.moveTo(bw / 2 - 7,top + 4); ctx.lineTo(-bw / 2 + 7,top + 53); ctx.stroke();
        }
        ctx.fillStyle = "#f2c66a"; roundRect(-19,-86,38,24,5); ctx.fill();
        ctx.strokeStyle = "#593a97"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-12,-74); ctx.lineTo(12,-74); ctx.moveTo(-7,-79); ctx.lineTo(-12,-74); ctx.lineTo(-7,-69); ctx.moveTo(7,-79); ctx.lineTo(12,-74); ctx.lineTo(7,-69); ctx.stroke();
      }
      ctx.restore();
  }

  // На дороге движется компактный маркер события; вся реплика видна в предметной сцене.
  function drawCard(c) {
    var p = clamp((c.y + cardH()) / pY, 0, 1), r = rOf(p);
    var sx = sxAt(c.x, r), sy = yOf(r) - 24;
    var scale = 0.65 + p * 0.35;
    var alpha = clamp(c.age / 0.22, 0, 1);
    if (c.resolved) { alpha *= c.removeTimer / 0.5; scale *= 1 + (0.5 - c.removeTimer) * 0.45; }
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(sx, sy); ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(0, 30, 24, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.resolved ? (c.result === "ok" ? "#d9f8e2" : "#fff0ce") : "#ffffff";
    roundRect(-25, -25, 50, 50, 15); ctx.fill();
    ctx.strokeStyle = "#b5a2f0"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#223c56"; ctx.font = "25px " + FONT;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(c.resolved ? (c.result === "ok" ? "✓" : "!") : (EVENT_SYMBOLS[(c.visual || {}).type] || c.icon), 0, 1);
    ctx.restore();
  }

  function shieldPath() {
    ctx.beginPath();
    ctx.moveTo(-22, -18);
    ctx.quadraticCurveTo(0, -31, 22, -18);
    ctx.lineTo(22, 4);
    ctx.quadraticCurveTo(20, 20, 0, 29);
    ctx.quadraticCurveTo(-20, 20, -22, 4);
    ctx.closePath();
  }

  function drawPlayer() {
    if (state !== "run" && state !== "start") return;
    var trip = 0, tripLean = 0, tripDip = 0;
    if (stumbleT > 0) {
      var st = 1 - stumbleT / STUMBLE_TIME, k;
      // Catch a foot, tip forward, overcorrect, then settle back into the run.
      if (st < .18) { k = st / .18; tripLean = lerp(0, .64, k*k*(3-2*k)); }
      else if (st < .52) { k = (st-.18)/.34; tripLean = lerp(.64, -.2, k*k*(3-2*k)); }
      else { k = (st-.52)/.48; tripLean = lerp(-.2, 0, k*k*(3-2*k)); }
      tripLean *= stumbleDir;
      trip = Math.min(1, st / .12) * (1 - clamp((st - .4) / .6, 0, 1));
      tripDip = Math.sin(Math.PI * Math.min(1, st / .72)) * 13;
    }
    var x = player.x;
    var bounce = -Math.abs(Math.sin(player.bob)) * 3.5 * (1 - trip);
    var hop = hopT > 0 ? -Math.sin(Math.PI * (1 - hopT / 0.36)) * 20 : 0;
    var y = (state === "start" ? H*.52 : playerY()) + bounce + hop - course.jumpHeight + tripDip;
    var sq = squashT > 0 ? squashT / 0.22 : 0;
    var dx = player.targetX - player.x;
    var lean = clamp(dx / 70, -0.38, 0.38);
    var sx = 1 + sq * 0.2 + Math.abs(lean) * 0.1, sy = 1 - sq * 0.18;
    if (hopT > 0) { sy += 0.12 * Math.sin(Math.PI * (1 - hopT / 0.36)); sx -= 0.06; }
    var wob = tripLean;
    sx += trip * .08; sy -= trip * .14;
    var air = Math.max(hop < -2 ? clamp(-hop / 20, 0, 1) : 0, course.jumpHeight / window.RunnerCourse.jumpHeight);

    // кольцо под ногами цвета текущей дорожки + тень
    var gy = (state === "start" ? H*.52 : playerY()) + 36;
    ctx.fillStyle = "rgba(" + (phase === "road" ? "0,193,160" : LANE_RGB[player.lane]) + "," + (0.28 + 0.1 * Math.sin(tAnim * 6)) + ")";
    ctx.beginPath(); ctx.ellipse(x, gy, 34 - air * 8, 11 - air * 3, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0," + (0.35 - air * 0.15) + ")";
    ctx.beginPath(); ctx.ellipse(x, gy, 22 - air * 6 + sq * 4, 7 - air * 2, 0, 0, 6.2832); ctx.fill();

    // шлейф-призраки при смене дорожки
    var moving = Math.abs(dx) > 8;
    if (moving && !REDUCED) {
      for (var gI = 0; gI < 3; gI++) {
        ctx.save(); ctx.translate(ghostX[gI], y); ctx.globalAlpha = 0.22 - gI * 0.06; shieldPath();
        ctx.fillStyle = "#00c1a0"; ctx.fill(); ctx.restore();
      }
    }
    ghostX[2] = ghostX[1]; ghostX[1] = ghostX[0]; ghostX[0] = x;

    // аура
    ctx.globalAlpha = 0.18 + 0.4 * feverGlow;
    var ag = 58 + feverGlow * 10;
    ctx.drawImage(feverGlow > 0.5 ? glowGold : glowGreen, x - ag, y - ag, ag * 2, ag * 2);
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(x, y); ctx.rotate(lean + wob); ctx.scale(sx, sy);
    var sw = Math.sin(player.bob) * (1 - trip);
    // ноги
    ctx.lineCap = "round";
    for (var lg = -1; lg <= 1; lg += 2) {
      var ph2 = lg === -1 ? sw : -sw, ly = 31 + ph2 * 4.5 - air * 4 - (lg === stumbleDir ? 9 : -3) * trip;
      var footX = lg * 10.5 + stumbleDir * (lg === stumbleDir ? 13 : -10) * trip;
      ctx.strokeStyle = "#23246a"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(lg * 9, 22); ctx.lineTo(lg * 9 + stumbleDir * 7 * trip, 27); ctx.lineTo(footX, ly); ctx.stroke();
      ctx.fillStyle = "#ffc24b";
      ctx.beginPath(); ctx.ellipse(footX, ly + 3, 7.5, 4.6, -tripLean * .4, 0, 6.2832); ctx.fill();
    }
    // шарф сзади (машет вниз)
    var wave = Math.sin(player.bob * 1.3);
    ctx.fillStyle = "#ffc24b";
    for (var sd = -1; sd <= 1; sd += 2) {
      ctx.beginPath();
      ctx.moveTo(sd * 19, -12);
      ctx.quadraticCurveTo(sd * (30 + wave * 3), 4, sd * (27 + wave * 5), 20 + wave * 2);
      ctx.quadraticCurveTo(sd * 20, 8, sd * 15, 4);
      ctx.closePath(); ctx.fill();
    }
    // руки (взмах в противофазе с ногами)
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4;
    for (var arm = -1; arm <= 1; arm += 2) {
      var handX = arm * (26 + trip * 9), handY = 4 - arm * sw * 5 - air * 8 - trip * (arm === stumbleDir ? 32 : 20);
      ctx.beginPath(); ctx.moveTo(arm * 18, 0); ctx.lineTo(arm * (25 + trip * 6), handY + trip * 7); ctx.lineTo(handX, handY); ctx.stroke();
      ctx.beginPath(); ctx.arc(handX, handY, 5, 0, 6.2832); ctx.fill();
    }

    // тело-щит: фирменный зелёный градиент
    var gr = ctx.createLinearGradient(-22, -28, 22, 28);
    gr.addColorStop(0, "#2bbf4a"); gr.addColorStop(0.55, "#21a038"); gr.addColorStop(1, "#00b49a");
    shieldPath(); ctx.lineWidth = 7; ctx.strokeStyle = "#23246a"; ctx.lineJoin = "round"; ctx.stroke(); ctx.fillStyle = gr; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "#eafff0"; ctx.stroke();
    // блик
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath(); ctx.ellipse(-9, -16, 8, 4, -0.5, 0, 6.2832); ctx.fill();

    // глаза (моргают), смотрят вперёд и в сторону движения
    var blink = (tAnim % 3.2) < 0.12 ? 0.15 : 1;
    var lx = clamp(dx / 40, -1, 1) * 1.6;
    for (var e = -1; e <= 1; e += 2) {
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(e * 8, -10, 5.4, 6 * blink, 0, 0, 6.2832); ctx.fill();
      ctx.fillStyle = "#0e1a12";
      if (hurtT > 0) { ctx.fillRect(e * 8 - 3, -11, 6, 2); }
      else { ctx.beginPath(); ctx.arc(e * 8 + lx, -12 + (blink < 1 ? 2 : 0), 2.7, 0, 6.2832); ctx.fill(); }
    }
    // рот
    ctx.strokeStyle = "#0e1a12"; ctx.lineWidth = 2;
    ctx.beginPath();
    if (hurtT > 0) ctx.arc(0, 2, 3, Math.PI, 0); else ctx.arc(0, -1, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    // эмблема-галочка
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath(); ctx.arc(0, 14, 7.5, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = "#21a038"; ctx.lineWidth = 2.6; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(-3.5, 14); ctx.lineTo(-0.8, 17); ctx.lineTo(4, 11); ctx.stroke();
    ctx.restore();
  }

  // ---------- Canvas-помощники ----------
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- Главный цикл ----------
  var last = 0;
  function frame(ts) {
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    if (!document.hidden && !paused) { update(dt); draw(); }
    requestAnimationFrame(frame);
  }

  // ---------- Кнопки / UI ----------
  function setupUI() {
    $("btn-play").addEventListener("click", function () { Sound.ensure(); startRun(); });
    $("btn-again").addEventListener("click", function () { startRun(); });
    $("btn-pause").addEventListener("click", function () { setPaused(true); });
    $("btn-resume").addEventListener("click", function () { setPaused(false, true); });
    $("btn-finish-run").addEventListener("click", endRun);
    $("btn-exit").addEventListener("click", exitGame);
    $("pause-overlay").addEventListener("keydown", function (event) {
      if (event.key !== "Tab") return;
      var first = $("btn-resume"), lastButton = $("btn-exit");
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); lastButton.focus(); }
      else if (!event.shiftKey && document.activeElement === lastButton) { event.preventDefault(); first.focus(); }
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden && state === "run" && !paused) setPaused(true); });

    var tgl = $("sound-toggle");
    tgl.addEventListener("change", function () { Sound.on = tgl.checked; Sound.ensure(); syncSoundBtn(); });
    $("sound-run").addEventListener("click", function () { Sound.on = !Sound.on; tgl.checked = Sound.on; Sound.ensure(); syncSoundBtn(); });
    syncSoundBtn();
  }
  function syncSoundBtn() {
    $("sound-run").innerHTML = '<svg viewBox="0 0 28 26" aria-hidden="true"><rect x="2" y="9" width="5" height="9" rx="1.8"/><path d="M9 8L17 2.5Q18 2 18 3.5V23Q18 24 17 23.5L9 18Z"/>' +
      (Sound.on ? '<path d="M21 9q4 4.5 0 9M24 5q7 8.5 0 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' : '<path d="M21 10l5 7m0-7l-5 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>') + '</svg>';
    $("sound-run").setAttribute("aria-label", Sound.on ? "Выключить звук" : "Включить звук");
    $("sound-run").setAttribute("aria-pressed", String(Sound.on));
  }

  // ---------- Фолбэк-контент (если fetch не сработал) ----------
  var FALLBACK = {
    actions: [{ id: "refuse", lane: 0, emoji: "🛑", label: "Отказать" }, { id: "check", lane: 1, emoji: "🔎", label: "Проверить" }, { id: "ok", lane: 2, emoji: "✅", label: "Можно" }],
    difficulty: { startSpeed: 105, maxSpeed: 300, speedRampPerSec: 1.6, spawnGapStart: 2.4, spawnGapMin: 1.5, spawnGapRampPerSec: 0.008, lives: 3, runSpeedMultiplier: 1.5 },
    situations: [
      { icon: "🔢", text: "Назови код из СМС", answer: "refuse", why: "Код из СМС — секрет, его нельзя говорить никому.", visual: { type: "call", sender: "Номер не сохранён" } },
      { icon: "🎁", text: "Ты выиграл приз!", answer: "refuse", why: "Приз, который ты не выигрывал, — ловушка.", visual: { type: "gift" } },
      { icon: "🔗", text: "Перейди: sber-priz.xyz", answer: "check", why: "Странная ссылка — лучше проверить.", visual: { type: "browser", address: "sber-priz.xyz" } },
      { icon: "🍽️", text: "Мама зовёт ужинать", answer: "ok", why: "Обычная просьба близкого — всё хорошо.", visual: { type: "call", sender: "Мама" } }
    ]
  };

  // ---------- Инициализация ----------
  window.addEventListener("resize", resize);
  resize();
  setupInput();
  setupUI();
  loadContent();
  requestAnimationFrame(frame);
})();
