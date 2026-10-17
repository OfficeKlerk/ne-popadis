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
      if (!this.on || !this.ctx) return;
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
    swish: function () { this.blip(420, 0.05, "sine"); },
    bonk: function () { this.blip(140, 0.16, "triangle"); var s = this; setTimeout(function () { s.blip(90, 0.2, "square"); }, 60); },
    laugh: function () { var s = this; [520, 460, 520, 460].forEach(function (f, i) { setTimeout(function () { s.blip(f, 0.07, "square"); }, i * 90); }); },
    drama: function () { var s = this; [220, 208, 185].forEach(function (f, i) { setTimeout(function () { s.blip(f, i === 2 ? 0.5 : 0.22, "sawtooth"); }, i * 260); }); },
    fanfare: function () { var s = this; [784, 988, 1175, 1568].forEach(function (f, i) { setTimeout(function () { s.blip(f, 0.1, "triangle"); }, i * 80); }); }
  };

  // ---------- Утилиты ----------
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  // Детерминированный ГСЧ: один и тот же код забега = одна и та же последовательность карточек
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function newRunCode() { return 1000 + ((Math.random() * 9000) | 0); }
  function easeOutBack(t) { var c = 1.9; t = t - 1; return 1 + (c + 1) * t * t * t + c * t * t; }

  // ---------- Состояние ----------
  var cv = $("game"), ctx = cv.getContext("2d");
  var DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  var W = 0, H = 0;               // логические размеры (CSS px)
  var LANES = 3;
  var content = null, diff = null;
  var actionLaneById = {}, actionById = {};        // id действия -> индекс дорожки
  var patternById = {};                            // id приёма -> злодей {name, emoji, tip}
  var rng = Math.random, runCode = 0, friendRun = false;
  var history = [];               // true/false по каждому решению — для «начало → конец»
  var patStats = {};              // id приёма -> {ok, bad}

  var state = "loading";          // loading | start | run | end
  var player = { lane: 1, x: 0, targetX: 0, bob: 0 };
  var cards = [];
  var speed = 0, elapsed = 0, spawnTimer = 0, roadScroll = 0;
  var meters = 0, coins = 0, combo = 0, bestCombo = 0, lives = 3;
  // Раннер-слой: монеты и препятствия между решениями
  var items = [], itemTimer = 0, coinLine = 0, coinLane = 1, itemRng = Math.random;
  // Замедление на решении: мир идёт медленнее, пока ребёнок читает карточку
  var timeScale = 1, slowVis = 0, slowHintShown = false;
  // Погоня: 1 — жулик далеко, 0 — догнал
  var chase = 1, chaseVis = 1, villainX = 0, villainKnock = 0, caught = false, lastChaseKey = -1, chasePat = "codethief";
  // Персонажи-жулики, реплики, ачивки, драматичный зум, босс
  var actors = [], pops = [], whineIdx = {};
  var achById = {}, achEarned = [], achQueue = [], toastT = 0, dodged = 0;
  var dramaT = 0;
  var cardsSpawned = 0, bossPhase = 0, bossIdx = 0, bossHits = 0, bossT = 0, bossHitT = 0, bossGone = false, finished = false;
  var BUB_H = 108, PH_H = 46;
  // Обучение внутри игры: первые карточки ждут, пока ребёнок нажмёт верную кнопку
  var tutIdx = 0, tutDone = false, tutShownKey = "";
  var trapsTotal = 0, trapsOK = 0, decisionsTotal = 0, decisionsOK = 0;
  var misses = [];                // {icon,text,why}
  var lastSituation = null;
  var flashTimer = 0;
  var ending = false, endTimer = 0;
  var attractT = 1, tAnim = 0;

  // «Сочность»
  var REDUCED = false;
  try { REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var shakeT = 0, shakeMag = 0;
  var vignetteT = 0;              // красная вспышка по краям при ошибке
  var squashT = 0;                // деформация героя
  var hopT = 0, hurtT = 0;        // прыжок радости / «ой»
  var feverGlow = 0;              // плавная подсветка серии
  var laneFlash = [0, 0, 0];      // вспышка дорожки при решении
  var laneHint = [0, 0, 0];       // подсказка «верная дорожка» после ошибки
  var LANE_COLORS = ["#ff4d6d", "#7350ff", "#22c37a"]; // отказать / проверить / можно
  var LANE_RGB = ["255,77,109", "115,80,255", "34,195,122"];
  var INK = "#23246a";
  var FONT = "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif";

  // ---------- Геометрия псевдо-перспективы ----------
  // Глубина p: 0 — горизонт, 1 — линия решения (позиция героя). Масштаб r(p) = 1 / (1 + (1-p)K).
  // Камера низко за спиной героя: сильная перспектива, герой крупный и у нижнего края
  var RT = 0.22;                  // масштаб дороги на горизонте (меньше — сильнее перспектива)
  var HS = 1.45;                  // масштаб героя («камера ближе к спине»)
  var DMAX = 1 + 0.6 / (1 / RT - 1); // предел глубины за линией героя (иначе перспектива «выворачивается»)
  var KP = 1 / RT - 1;
  var hy = 0, y0 = 0, pY = 0, rB = 1;
  var skyGrad, groundGrad, roadGrad;
  var glowSun, glowGold, glowGreen;
  var townFar, townNear, cloudImg, clouds = [];
  var streakAng = [];
  for (var sa = 0; sa < 12; sa++) streakAng.push(0.12 * Math.PI + (sa / 11) * 0.76 * Math.PI);

  function laneX(i) { return W * (i + 0.5) / LANES; }
  function playerY() { return pY; }
  function rOf(p) { return 1 / (1 + (1 - p) * KP); }
  function yOf(r) { return y0 + (pY - y0) * r; }

  function makeGlow(rgb, size) {
    var c = document.createElement("canvas"); c.width = c.height = size;
    var g = c.getContext("2d"), rg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    rg.addColorStop(0, "rgba(" + rgb + ",0.95)"); rg.addColorStop(0.35, "rgba(" + rgb + ",0.35)"); rg.addColorStop(1, "rgba(" + rgb + ",0)");
    g.fillStyle = rg; g.fillRect(0, 0, size, size);
    return c;
  }

  // Игрушечный городок на горизонте (пастельные домики, деревья-шарики).
  // Рисуется один раз и размывается — эффект tilt-shift, как у макета-диорамы.
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
    player.x = laneX(player.lane); player.targetX = player.x;
  }

  function layout() {
    pY = Math.min(H * 0.82, H - 182); hy = H * 0.19;
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
    var req = location.protocol === "file:" ? Promise.reject(new Error("file://")) : fetch("content.json", { cache: "no-store" });
    req
      .then(function (r) { return r.json(); })
      .then(function (data) {
        content = data;
        diff = data.difficulty;
        applyContent(data);
        showScreen("start");
      })
      .catch(function () {
        // fetch недоступен (file://) — берём полную копию из content.js, в крайнем случае минимальный FALLBACK
        var data = window.GAME_CONTENT && window.GAME_CONTENT.situations ? window.GAME_CONTENT : FALLBACK;
        content = data; diff = data.difficulty;
        applyContent(data);
        showScreen("start");
      });
  }
  function D(key, def) { return diff && diff[key] != null ? diff[key] : def; }
  function applyContent(data) {
    (data.actions || []).forEach(function (a) { actionLaneById[a.id] = a.lane; actionById[a.id] = a; });
    (data.patterns || []).forEach(function (p) { patternById[p.id] = p; });
    if (data.boss) patternById.boss = data.boss;
    (data.achievements || []).forEach(function (a) { achById[a.id] = a; });
  }

  // ---------- Экраны ----------
  function showScreen(s) {
    state = s;
    $("screen-loading").classList.toggle("hidden", s !== "loading");
    $("screen-start").classList.toggle("hidden", s !== "start");
    $("screen-end").classList.toggle("hidden", s !== "end");
    $("hud").classList.toggle("hidden", s !== "run");
    $("lane-legend").classList.toggle("hidden", s !== "run");
    if (s !== "run") { $("flash").classList.add("hidden"); }
  }

  // ---------- Старт забега ----------
  function startRun(code) {
    friendRun = !!code;
    runCode = code || newRunCode();
    rng = mulberry32(runCode * 2654435761);
    history = []; patStats = {};
    player.lane = 1; player.x = laneX(1); player.targetX = player.x; player.bob = 0;
    cards = []; speed = diff.startSpeed; elapsed = 0; spawnTimer = 0.9;
    meters = 0; coins = 0; combo = 0; bestCombo = 0; lives = 0;
    trapsTotal = 0; trapsOK = 0; decisionsTotal = 0; decisionsOK = 0;
    misses = []; lastSituation = null; flashTimer = 0; ending = false; endTimer = 0;
    clearFx(); shakeT = 0; vignetteT = 0; squashT = 0; hopT = 0; hurtT = 0; feverGlow = 0;
    laneFlash[0] = laneFlash[1] = laneFlash[2] = 0; laneHint[0] = laneHint[1] = laneHint[2] = 0;
    lastDist = -1; lastCoins = -1;
    items = []; itemTimer = 1.2; coinLine = 0; itemRng = mulberry32(runCode * 7 + 13);
    timeScale = 1; slowVis = 0; slowHintShown = false;
    chase = 1; chaseVis = 1; villainX = laneX(1); villainKnock = 0; caught = false; lastChaseKey = -1; chasePat = "codethief";
    actors = []; pops = []; whineIdx = {}; achEarned = []; achQueue = []; toastT = 0; dodged = 0; dramaT = 0;
    cardsSpawned = 0; bossPhase = 0; bossIdx = 0; bossHits = 0; bossT = 0; bossHitT = 0; bossGone = false; finished = false;
    $("toast").classList.add("hidden");
    tutIdx = tutDone || !content.tutorial ? 99 : 0; tutShownKey = ""; showTut(null);
    renderChase(false);
    updateCombo(false);
    syncLegend();
    showScreen("run");
    addFloat(W / 2, H * 0.42, "Поехали!", "#ffffff", 30);
    Sound.swish();
  }

  // Полоска погони в HUD: жулик едет по ней к герою
  function renderChase(hit) {
    var el = $("chase"); if (!el) return;
    el.style.setProperty("--c", chaseVis.toFixed(3));
    el.classList.toggle("danger", chase < 0.4);
    if (hit) { el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit"); }
  }
  function chaseHit(amount) {
    chase = Math.max(0, chase - amount);
    renderChase(true);
    if (chase <= 0.001 && !ending) {
      caught = true; ending = true; endTimer = 2.0;
      addFloat(W / 2, H * 0.36, "Жулик догнал!", "#ff7a92", 30);
    }
  }

  // ---------- Спавн ситуаций ----------
  function spawnSituation() {
    var list = content.situations;
    var s = list[(rng() * list.length) | 0];
    var guard = 0;
    // не повторяем ту же карточку и тот же приём подряд (кроме «безопасных»)
    while ((s === lastSituation || (lastSituation && s.pattern !== "safe" && s.pattern === lastSituation.pattern)) && guard++ < 8) s = list[(rng() * list.length) | 0];
    lastSituation = s;
    cardsSpawned++;
    spawnCard(s, false);
  }
  function spawnCard(s, isBoss) {
    var lane = actionLaneById[s.answer];
    ctx.font = "800 15.5px " + FONT;
    cards.push({
      icon: s.icon, text: s.text, why: s.why, hint: s.hint, answer: s.answer, pattern: isBoss ? "boss" : s.pattern, lines: wrapLines(s.text, cardW() - 16),
      answerLane: lane, isTrap: s.answer !== "ok", drama: !!s.drama, boss: isBoss, ph: Math.random() * 6,
      x: laneX(1), y: -cardH(), resolved: false, result: null, flashT: 0, removeTimer: 0, removeMax: 0.5, age: 0
    });
  }
  function cardW() { return Math.min(W * 0.46, 178); }
  function cardH() { return BUB_H + PH_H; }   // пузырь-сообщение + телефон на ножках под ним

  // ---------- Ввод ----------
  function move(dir) { setLane(player.lane + dir); }
  function setLane(n) {
    if (state !== "run") return;
    var prev = player.lane;
    player.lane = clamp(n, 0, LANES - 1);
    player.targetX = laneX(player.lane);
    if (player.lane !== prev) { squashT = 0.2; spawnDust(); syncLegend(); Sound.swish(); }
  }
  function syncLegend() {
    var items = document.querySelectorAll("#lane-legend .legend-item");
    for (var i = 0; i < items.length; i++) items[i].classList.toggle("active", i === player.lane);
  }
  function setupInput() {
    document.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft" || e.key === "a") move(-1);
      else if (e.key === "ArrowRight" || e.key === "d") move(1);
    });
    // кнопки внизу: тап = сразу на эту дорожку
    var lbs = document.querySelectorAll("#lane-legend .lane-btn");
    for (var li = 0; li < lbs.length; li++) (function (n) {
      lbs[n].addEventListener("pointerdown", function (e) { e.preventDefault(); setLane(n); });
    })(li);
    var sx = 0, sy = 0, swiping = false, lastTouch = 0;
    cv.addEventListener("touchstart", function (e) {
      var t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; swiping = true;
    }, { passive: true });
    cv.addEventListener("touchend", function (e) {
      if (!swiping) return; swiping = false; lastTouch = Date.now();
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) { move(dx > 0 ? 1 : -1); }
      else if (Math.abs(dx) < 16 && Math.abs(dy) < 16) { move(t.clientX < W / 2 ? -1 : 1); } // тап по стороне
    }, { passive: true });
    // мышь — для теста в браузере
    cv.addEventListener("mousedown", function (e) {
      // после тапа браузер шлёт эмулированный mousedown — без этой проверки тап сдвигал героя на 2 дорожки
      if (Date.now() - lastTouch < 700) return;
      if (state === "run") move(e.clientX < W / 2 ? -1 : 1);
    });
  }

  // ---------- Пулы эффектов (без аллокаций в кадре) ----------
  var PMAX = 220, particles = [], rings = [], floats = [];
  var i0;
  for (i0 = 0; i0 < PMAX; i0++) particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 3, color: "#fff", grav: 0, shape: 0, rot: 0, vr: 0 });
  for (i0 = 0; i0 < 6; i0++) rings.push({ x: 0, y: 0, life: 0, max: 1, r0: 10, r1: 60, color: "255,255,255" });
  for (i0 = 0; i0 < 6; i0++) floats.push({ x: 0, y: 0, life: 0, max: 1, text: "", color: "#fff", size: 20, vy: -50 });
  var pCursor = 0, rCursor = 0, fCursor = 0;

  function clearFx() {
    for (var i = 0; i < PMAX; i++) particles[i].life = 0;
    for (i = 0; i < rings.length; i++) rings[i].life = 0;
    for (i = 0; i < floats.length; i++) floats[i].life = 0;
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
    var y = playerY() + 34 * HS;
    for (var i = 0; i < 5; i++) addParticle(player.x, y, (Math.random() - 0.5) * 90, -Math.random() * 40, 0.35, 3 + Math.random() * 3, "rgba(35,36,106,0.22)", 120);
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
      ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.lineJoin = "round";
      var hw = ctx.measureText(f.text).width / 2 + 8, fx = clamp(f.x, hw, W - hw);   // не обрезаем у края экрана
      ctx.strokeText(f.text, fx, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, fx, f.y);
    }
    ctx.globalAlpha = 1;
  }
  function shake(mag) { if (REDUCED) return; shakeT = 0.3; shakeMag = mag; }

  // ---------- Разрешение карточки ----------
  function cardScreenPos(c) {
    var p = clamp((c.y + cardH()) / pY, 0, DMAX), r = rOf(p);
    return { x: clamp(sxAt(c.x, r), 60, W - 60), y: yOf(r) };
  }
  function nextWhine(pat) {
    var v = patternById[pat]; if (!v || !v.whines) return "Ой-ой!";
    var i = whineIdx[pat] || 0; whineIdx[pat] = Math.min(i + 1, v.whines.length - 1);
    return v.whines[i];   // с каждой встречей жулик ноет всё отчаяннее — а ты всё равно не ведёшься
  }
  function resolveCard(c) {
    c.resolved = true;
    var correct = player.lane === c.answerLane;
    c.result = correct ? "ok" : "bad";
    if (c.tut) {                               // обучающая карточка: только награда, без статистики
      if (c.isTrap) { var tp = cardScreenPos(c); addActor("ko", c.pattern, tp.x, tp.y, 1); addPop("speech", tp.x, tp.y - 150, nextWhine(c.pattern), 1.6); }
      else addFloat(W / 2, H * 0.36, "Верно!", "#ffffff", 24);
      Sound.good(); spawnBurst(player.x, playerY(), LANE_COLORS[c.answerLane]); hopT = 0.36;
      c.flashT = 0.5; c.removeTimer = c.removeMax = 0.6;
      if (tutIdx >= content.tutorial.length) { tutDone = true; addFloat(W / 2, H * 0.24, "Теперь сам! 💪", "#ffd23f", 30); }
      return;
    }
    decisionsTotal++;
    if (c.isTrap) trapsTotal++;
    history.push(correct);
    if (c.pattern) { var ps = patStats[c.pattern] || (patStats[c.pattern] = { ok: 0, bad: 0 }); ps[correct ? "ok" : "bad"]++; }
    c.flashT = 0.5;
    c.removeTimer = c.removeMax = correct && c.isTrap ? 0.6 : 0.5;
    var hy2 = playerY(), pos = cardScreenPos(c);
    if (correct) {
      decisionsOK++;
      if (c.isTrap) trapsOK++;
      combo++; bestCombo = Math.max(bestCombo, combo);
      coins += 1 + Math.floor(combo / 3);
      Bridge.vibrate(25); Sound.good();
      spawnBurst(player.x, hy2, LANE_COLORS[c.answerLane]);
      laneFlash[c.answerLane] = 0.5;
      squashT = 0.16; hopT = 0.36;
      chase = Math.min(1, chase + D("chaseRecover", 0.12)); villainKnock = 0.6; renderChase(false);
      if (c.boss) {
        bossHits++; bossHitT = 0.5;
        addPop("boom", W * 0.72, hy + 60, "БАМ!", 0.9);
        addPop("speech", W * 0.55, hy + 150, (content.boss.whines || [])[Math.min(bossHits - 1, 2)] || "Ой!", 1.6);
        Sound.bonk(); shake(6);
      } else if (c.isTrap) {
        addActor("ko", c.pattern, pos.x, pos.y, 1);
        addPop("speech", pos.x, pos.y - 150, nextWhine(c.pattern), 1.9);
        if (c.pattern === "prize") unlock("prize");
        if (c.pattern === "codethief") unlock("code");
        var caughtAll = (content.patterns || []).every(function (pt) { return patStats[pt.id] && patStats[pt.id].ok > 0; });
        if (caughtAll) unlock("all7");
      } else {
        addFloat(W / 2, H * 0.36, c.drama ? "Всё честно 👌" : "Верно!", "#ffffff", 24);
        if (c.drama) unlock("honest");
      }
      if (combo === 3 || (combo > 3 && combo % 4 === 0)) { spawnConfetti(player.x, hy2 - 10, 26, true); Sound.combo(); }
      if (combo >= 5) unlock("combo5");
      if (coins >= 30) unlock("coins30");
      updateCombo(true);
    } else {
      combo = 0; updateCombo(false);
      chaseHit(D("chaseWrong", 0.34));
      misses.push({ icon: c.icon, text: c.text, why: c.why, isTrap: c.isTrap, answer: c.answer, pattern: c.pattern });
      Bridge.vibrate(70); Sound.bad();
      shake(10); vignetteT = 0.5; squashT = 0.22; hurtT = 0.55;
      laneHint[c.answerLane] = 1.6;
      if (c.boss) {
        addPop("speech", W * 0.55, hy + 150, content.boss.laugh || "Ха-ха!", 1.6); Sound.laugh();
      } else if (c.isTrap) {
        var stolen = Math.min(3, coins); coins -= stolen; chasePat = c.pattern;
        addActor("steal", c.pattern, pos.x, pos.y, 1);
        addPop("speech", pos.x, pos.y - 150, stolen ? "Хе-хе! −" + stolen + " 🪙" : "Хе-хе!", 1.5);
        Sound.laugh();
      }
      showFlash(c);
    }
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
    var v = patternById[c.pattern];
    var who = v ? '<div class="flash-villain">' + v.emoji + " Это был " + escapeHtml(v.brName || v.name) + "</div>"
                : (!c.isTrap ? '<div class="flash-villain">Тут всё было честно</div>' : "");
    el.innerHTML = '<span class="flash-icon">' + c.icon + "</span>" + who + escapeHtml(c.why) +
      '<div class="flash-ans">Верно: ' + (a.emoji || "") + " " + escapeHtml(a.label || "") + "</div>";
    el.classList.remove("hidden");
    el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
    flashTimer = 2.2;
  }

  // ---------- Конец забега ----------
  var counters = [];
  function countTo(id, to, suffix, delay) { counters.push({ el: $(id), to: to, t: -delay, suf: suffix || "" }); $(id).textContent = "0" + (suffix || ""); }

  function endRun() {
    showScreen("end");
    $("end-title").textContent = caught ? "Жулик догнал!" : finished ? "Финиш! 🏁" : "Забег окончен!";
    $("more").open = false;
    renderAchievements();
    cards = []; clearFx();
    counters = [];
    countTo("end-distance", Math.round(meters), "", 0.25);
    countTo("end-recognized", trapsOK, "/" + trapsTotal, 0.45);
    countTo("end-coins", coins, "", 0.65);
    $("end-decisions").textContent = "Верных решений: " + decisionsOK + " из " + decisionsTotal;

    if (trapsOK >= 3) spawnConfetti(0, -10, 40, false);

    var list = $("review-list"); list.innerHTML = "";
    var uniq = {};
    var uniqueMisses = misses.filter(function (m) { if (uniq[m.text]) return false; uniq[m.text] = 1; return true; });
    $("review-title").classList.toggle("hidden", uniqueMisses.length === 0);
    $("review-title").textContent = "Разбор ошибок — нажми, чтобы понять:";
    uniqueMisses.slice(0, 5).forEach(function (m) {
      var d = document.createElement("div");
      d.className = "review-item";
      var tag = m.isTrap ? "" : '<span class="ri-tag">это было безопасно</span>';
      d.innerHTML = '<div class="ri-top">' + m.icon + " <span>" + escapeHtml(m.text) + "</span></div>" + tag + '<div class="ri-why">' + escapeHtml(m.why) + "</div>";
      d.addEventListener("click", function () { d.classList.toggle("open"); });
      list.appendChild(d);
    });

    renderVillains();
    renderProgress();

    Bridge.finish({ meters: Math.round(meters), coins: coins, trapsOK: trapsOK, trapsTotal: trapsTotal, bestCombo: bestCombo, runCode: runCode, villainsCaught: villainsCaught, villainsTotal: villainsTotal });
    Bridge.completed({ meters: Math.round(meters), trapsOK: trapsOK, trapsTotal: trapsTotal });
  }

  // Сетка «злодеев»: каждый приём мошенников — персонаж. Пойман = хотя бы раз верно распознан.
  var villainsCaught = 0, villainsTotal = 0;
  function renderVillains() {
    var pats = content.patterns || [], h = "";
    villainsCaught = 0; villainsTotal = pats.length;
    pats.forEach(function (p) {
      var st = patStats[p.id];
      var cls = !st ? "unmet" : st.ok > 0 ? "caught" : "escaped";
      if (cls === "caught") villainsCaught++;
      h += '<div class="villain ' + cls + '" style="--vc:' + (p.color || "#7350ff") + '"><div class="v-emoji">' + (cls === "unmet" ? "❔" : p.emoji) + '</div><div class="v-name">' +
        escapeHtml(cls === "unmet" ? "???" : (p.brName || p.name)) + '</div><div class="v-state">' + (cls === "caught" ? "БДЫЩ!" : cls === "escaped" ? "ускользнул" : "не встретился") + "</div></div>";
    });
    $("villains-grid").innerHTML = h;
    $("villains-title").textContent = "Коллекция жуликов: " + villainsCaught + " из " + villainsTotal;
    $("end-villains").classList.toggle("hidden", !villainsTotal);
  }

  function renderAchievements() {
    var el = $("end-ach");
    el.innerHTML = achEarned.map(function (id) { var a = achById[id]; return '<span class="ach-chip">' + a.emoji + " " + escapeHtml(a.title) + "</span>"; }).join("");
    el.classList.toggle("hidden", !achEarned.length);
  }

  // «Доказательство обучения»: точность в первой и второй половине забега
  function renderProgress() {
    var el = $("end-progress"), n = history.length, half = Math.floor(n / 2);
    if (n < 6) { el.classList.add("hidden"); return; }
    function pct(a) { var k = 0; for (var i = 0; i < a.length; i++) if (a[i]) k++; return Math.round(100 * k / a.length); }
    var a = pct(history.slice(0, half)), b = pct(history.slice(n - half));
    var note = b > a ? "Ты учишься прямо в игре!" : b === a ? (b >= 80 ? "Стабильно и точно!" : "Ещё забег — и станет лучше!") : "К концу стало быстрее — попробуй ещё!";
    el.innerHTML = '<div class="pg-row"><div class="pg-col"><div class="pg-num">' + a + '%</div><div class="pg-lbl">в начале</div></div>' +
      '<div class="pg-arrow">→</div><div class="pg-col"><div class="pg-num' + (b > a ? " up" : "") + '">' + b + '%</div><div class="pg-lbl">в конце</div></div></div>' +
      '<div class="pg-note">' + note + "</div>";
    el.classList.remove("hidden");
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  // ---------- Монеты и препятствия ----------
  function showTut(c) {
    var key = c ? c.text + (player.lane === c.answerLane ? "1" : "0") : "";
    if (key === tutShownKey) return; tutShownKey = key;
    var el = $("tut"), btns = document.querySelectorAll("#lane-legend .lane-btn");
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("hint", !!c && i === c.answerLane && player.lane !== c.answerLane);
    if (!c) { el.classList.add("hidden"); return; }
    el.textContent = player.lane === c.answerLane ? "Да! 👍" : c.hint;
    el.className = "tut lane-" + c.answerLane;
  }
  function firstUnresolved() { for (var i = 0; i < cards.length; i++) if (!cards[i].resolved) return cards[i]; return null; }
  function updateItems(wdt, hasUnresolved) {
    itemTimer -= wdt;
    if (itemTimer <= 0 && !ending) {
      if (coinLine > 0) {
        items.push({ kind: "coin", lane: coinLane, p: 0, ph: itemRng() * 6 });
        coinLine--; itemTimer = coinLine > 0 ? 0.16 : D("itemEvery", 0.7);
      } else {
        // препятствие — только в фазе бега и не прямо перед карточкой (иначе наказывали бы за верный ответ)
        var allowObs = !hasUnresolved && spawnTimer > 1.4 && elapsed > 3 && bossPhase === 0 && (!content.tutorial || tutIdx >= content.tutorial.length);
        if (allowObs && itemRng() < D("obstacleChance", 0.5)) {
          var ol = (itemRng() * 3) | 0;
          items.push({ kind: itemRng() < 0.5 ? "cone" : "barrier", lane: ol, p: 0 });
          itemTimer = D("itemEvery", 0.7);
        } else {
          coinLane = (itemRng() * 3) | 0; coinLine = 3 + ((itemRng() * 3) | 0); itemTimer = 0.01;
        }
      }
    }
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      it.p += speed * wdt / pY;
      if (!it.done && it.p >= 0.97) {
        it.done = true;
        if (it.lane === player.lane) {
          if (it.kind === "coin") {
            coins++; it.got = true; Sound.coin();
            if (!REDUCED) for (var k = 0; k < 4; k++) addParticle(player.x, pY - 10, (Math.random() - 0.5) * 120, -120 - Math.random() * 80, 0.45, 4, "#ffd23f", 300);
          } else {
            hurtT = 0.4; squashT = 0.2; shake(6); Sound.bad(); Bridge.vibrate(40);
            addFloat(player.x, pY - 90, it.kind === "cone" ? "Бум!" : "Ай!", "#ff7a92", 22);
            chaseHit(D("chaseObstacle", 0.12));
          }
        } else if (it.kind !== "coin") { dodged++; if (dodged >= 10) unlock("dodger"); }
      }
      if (it.got || it.p > DMAX) items.splice(i, 1);
    }
  }

  // ---------- Персонажи, реплики, ачивки ----------
  function addActor(kind, pat, x, y, sc) { actors.push({ kind: kind, pat: pat, x: x, y: y, x0: x, y0: y, s: sc, t: 0, hit: false, dir: x < W / 2 ? -1 : 1 }); }
  function addPop(kind, x, y, text, life) { if (pops.length > 4) pops.shift(); pops.push({ kind: kind, x: x, y: y, text: text, life: life, max: life }); }
  function unlock(id) {
    if (achEarned.indexOf(id) >= 0 || !achById[id]) return;
    achEarned.push(id); achQueue.push(achById[id]);
  }
  function updateActors(dt) {
    for (var i = actors.length - 1; i >= 0; i--) {
      var a = actors[i]; a.t += dt;
      if (a.kind === "ko") {
        if (a.t >= 0.42 && !a.hit) {
          a.hit = true; Sound.bonk(); shake(5);
          addPop("boom", a.x0, a.y0 - 92, "БДЫЩ!", 0.8);
          if (!REDUCED) for (var k = 0; k < 8; k++) addParticle(a.x0, a.y0 - 80, (Math.random() - 0.5) * 360, -Math.random() * 260, 0.6, 5, k % 2 ? "#ffd23f" : "#ffffff", 500, 1);
        }
        if (a.t > 1.5) actors.splice(i, 1);
      } else if (a.kind === "steal") {
        if (a.t > 1.3) actors.splice(i, 1);
      } else if (a.t > 1.8) actors.splice(i, 1);
    }
    for (i = pops.length - 1; i >= 0; i--) { pops[i].life -= dt; if (pops[i].life <= 0) pops.splice(i, 1); }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $("toast").classList.add("hidden"); }
    else if (achQueue.length) {
      var ac = achQueue.shift(), el = $("toast");
      el.innerHTML = '<span class="t-emoji">' + ac.emoji + '</span><span class="t-txt"><b>Ачивка!</b> ' + escapeHtml(ac.title) + "</span>";
      el.classList.remove("hidden"); el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
      toastT = 2.4; Sound.fanfare(); Bridge.vibrate(20);
    }
  }

  // ---------- Обновление ----------
  var lastDist = -1, lastCoins = -1;
  function update(dt) {
    tAnim += dt;
    var i;
    // общие эффекты
    updateFx(dt);
    if (shakeT > 0) shakeT -= dt;
    if (vignetteT > 0) vignetteT -= dt;
    if (squashT > 0) squashT -= dt;
    if (hopT > 0) hopT -= dt;
    if (hurtT > 0) hurtT -= dt;
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

    // Замедление на решении: когда карточка во второй половине пути, мир замедляется так,
    // чтобы на чтение и выбор оставалось ~decisionWindow секунд реального времени при любой скорости.
    var cur = firstUnresolved(), tsTarget = 1;
    if (cur) {
      var cp = (cur.y + cardH()) / pY;
      if (cp > 0.5) tsTarget = clamp((0.5 / D("decisionWindow", 3)) / (speed / pY), D("minTimeScale", 0.3), 1);
    }
    var tutWait = cur && cur.tut && (cur.y + cardH()) / pY > 0.86 && player.lane !== cur.answerLane;
    if (tutWait) tsTarget = 0;                 // обучение: мир ждёт верного нажатия, без штрафов
    showTut(cur && cur.tut && (cur.y + cardH()) / pY > 0.7 ? cur : null);
    timeScale = lerp(timeScale, tsTarget, Math.min(1, dt * (tsTarget < timeScale ? 5 : 9)));
    slowVis = clamp((1 - timeScale) / 0.5, 0, 1);
    if (slowVis > 0.6 && !slowHintShown && !(cur && (cur.drama || cur.tut))) { slowHintShown = true; addFloat(W / 2, H * 0.17, "Не торопись — подумай", "#ffffff", 22); }
    if (cur && cur.drama && !cur.dramaShown && (cur.y + cardH()) / pY > 0.5) {
      cur.dramaShown = true; dramaT = 1.5; Sound.drama(); addFloat(W / 2, H * 0.17, "🤔 Хммм…", "#ffffff", 26);
    }
    if (dramaT > 0) dramaT -= dt;
    updateActors(dt);
    if (bossHitT > 0) bossHitT -= dt;
    if (bossPhase > 0) bossT += dt;
    var wdt = dt * timeScale;      // «мировое» время

    elapsed += wdt;
    speed = Math.min(diff.maxSpeed, diff.startSpeed + elapsed * diff.speedRampPerSec) * (0.75 + 0.25 * Math.min(1, elapsed / 15));
    meters += speed * wdt * 0.09;
    roadScroll += speed * wdt;
    player.x = lerp(player.x, player.targetX, Math.min(1, dt * 14));   // герой реагирует в реальном времени
    player.bob += wdt * (11 + speed / 90);

    // одно решение за раз; между решениями — фаза бега (монеты и препятствия)
    var hasUnresolved = !!cur;
    if (!hasUnresolved) spawnTimer -= wdt;
    var gap = Math.max(D("runGapMin", 2.2), D("runGapStart", 3.4) - elapsed * 0.01);
    var boss = content.boss;
    if (bossPhase === 0) {
      if (boss && cardsSpawned >= (boss.after || 16) && !hasUnresolved && !ending) {
        // финальный босс: «звонок из банка» — 3 сообщения подряд, потом финиш
        bossPhase = 1; bossT = 0; dramaT = 1.8; spawnTimer = 2.4; Sound.drama();
        addPop("speech", W / 2, hy + 120, boss.intro || "📞 Входящий звонок…", 2.3);
      } else if (spawnTimer <= 0 && !hasUnresolved && !ending) {
        if (content.tutorial && tutIdx < content.tutorial.length) { spawnCard(content.tutorial[tutIdx], false); cards[cards.length - 1].tut = true; tutIdx++; spawnTimer = 1.4; }
        else { spawnSituation(); spawnTimer = gap; }
      }
    } else if (bossPhase <= 2 && !ending) {
      if (bossIdx < boss.messages.length) {
        if (spawnTimer <= 0 && !hasUnresolved) { spawnCard(boss.messages[bossIdx], true); bossIdx++; bossPhase = 2; spawnTimer = 1.1; }
      } else if (!hasUnresolved) {
        bossPhase = 3;
        if (bossHits >= 2) { bossGone = true; addActor("bossko", "boss", W * 0.8, hy + 104, 1.1); addPop("boom", W * 0.72, hy + 60, "БДЫЩ!", 1); Sound.bonk(); }
        if (bossHits >= boss.messages.length) unlock("boss");
        finished = true; ending = true; endTimer = 2.8;
        addFloat(W / 2, H * 0.4, "🏁 Финиш!", "#ffd23f", 40); spawnConfetti(W / 2, H * 0.3, 40, true); Sound.fanfare();
      }
    }
    updateItems(wdt, hasUnresolved);

    // погоня: плавное движение жулика
    chaseVis = lerp(chaseVis, chase, Math.min(1, dt * 4));
    villainX = lerp(villainX, player.x, Math.min(1, dt * 3));
    if (villainKnock > 0) villainKnock -= dt;
    var ck = Math.round(chaseVis * 200);
    if (ck !== lastChaseKey) { lastChaseKey = ck; renderChase(false); }

    // движение карточек
    var pYY = playerY();
    for (var j = cards.length - 1; j >= 0; j--) {
      var c = cards[j];
      c.y += speed * wdt; c.age += dt;
      if (!c.resolved) {
        // карточка «едет» за героем на выбранную дорожку — связь выбора и действия
        c.x = lerp(c.x, laneX(player.lane), Math.min(1, dt * 10));
        if (c.y + cardH() >= pYY) resolveCard(c);
      } else {
        c.removeTimer -= dt;
      }
      if (c.flashT > 0) c.flashT -= dt;
      if (c.resolved && c.removeTimer <= 0) cards.splice(j, 1);
    }

    if (ending) { endTimer -= dt; if (endTimer <= 0) { ending = false; endRun(); return; } }

    // таймер вспышки
    if (flashTimer > 0) { flashTimer -= dt; if (flashTimer <= 0) $("flash").classList.add("hidden"); }

    // HUD (DOM трогаем только при изменении)
    var dm = Math.round(meters);
    if (dm !== lastDist) { lastDist = dm; $("distance").textContent = dm + " м"; }
    if (coins !== lastCoins) {
      $("coins-n").textContent = coins;
      if (lastCoins >= 0) { var ce = $("coins"); ce.classList.remove("pop"); void ce.offsetWidth; ce.classList.add("pop"); }
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
    var dz = dramaT > 0 ? Math.sin(Math.PI * Math.min(1, (1.5 - dramaT) / 0.35) / 2) * Math.min(1, dramaT / 0.3) : 0;
    if ((slowVis > 0.01 || dz > 0) && !REDUCED) {          // «наезд камеры»; сильнее — драматичный зум
      var z = 1 + 0.035 * slowVis + 0.11 * dz;
      ctx.translate(W / 2, pY); ctx.scale(z, z); ctx.translate(-W / 2, -pY);
    }
    drawRoad();
    var cur = firstUnresolved(), cardP = cur ? (cur.y + cardH()) / pY : 9, i;
    for (i = 0; i < items.length; i++) if (items[i].p < cardP) drawItem(items[i]);
    for (i = 0; i < cards.length; i++) drawCard(cards[i]);
    for (i = 0; i < items.length; i++) if (items[i].p >= cardP) drawItem(items[i]);
    drawBoss();
    drawVillain();      // позади героя, чтобы герой всегда был виден
    drawPlayer();
    drawActors();
    drawFx();
    ctx.restore();
    drawPops();             // реплики — вне зума камеры, чтобы не обрезались у краёв
    drawVignette();
    drawSlowFx();
    if (dz > 0) {                                // киношные полосы — мем «драматичный зум»
      var bh = 46 * dz; ctx.fillStyle = "#14143a";
      ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
    }
  }

  // Рамка «фокуса» во время замедления
  function drawSlowFx() {
    if (slowVis <= 0.02 || state !== "run") return;
    var g = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.28, W / 2, H * 0.55, H * 0.75);
    g.addColorStop(0, "rgba(115,80,255,0)");
    g.addColorStop(1, "rgba(115,80,255," + (0.22 * slowVis) + ")");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function drawItem(it) {
    var p = Math.min(it.p, DMAX), r = rOf(p), y = yOf(r), x = sxAt(laneX(it.lane), r);
    if (y > H + 60) return;
    ctx.save(); ctx.translate(x, y);
    // тень
    ctx.fillStyle = "rgba(35,36,106,0.16)";
    ctx.beginPath(); ctx.ellipse(0, 0, (it.kind === "barrier" ? 34 : 15) * r, 5 * r, 0, 0, 6.2832); ctx.fill();
    if (it.kind === "coin") {
      var R = 15 * r, spin = Math.max(0.18, Math.abs(Math.cos(tAnim * 4 + it.ph)));
      ctx.translate(0, -R - 10 * r + Math.sin(tAnim * 5 + it.ph) * 3 * r);
      ctx.scale(spin, 1);
      ctx.fillStyle = "#d99a00"; ctx.beginPath(); ctx.arc(0, 2.5 * r, R, 0, 6.2832); ctx.fill();
      var cg = ctx.createRadialGradient(-R * 0.35, -R * 0.4, 1, 0, 0, R);
      cg.addColorStop(0, "#fff3b0"); cg.addColorStop(0.5, "#ffd23f"); cg.addColorStop(1, "#f5b800");
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = "rgba(217,154,0,0.8)"; ctx.lineWidth = 2 * r; ctx.beginPath(); ctx.arc(0, 0, R * 0.62, 0, 6.2832); ctx.stroke();
    } else if (it.kind === "cone") {
      var h = 46 * r, b = 17 * r;
      ctx.fillStyle = "#e05a1a"; ctx.fillRect(-b * 1.25, -5 * r, b * 2.5, 6 * r);
      ctx.fillStyle = "#ff8a3d";
      ctx.beginPath(); ctx.moveTo(-b, -4 * r); ctx.lineTo(-3 * r, -h); ctx.lineTo(3 * r, -h); ctx.lineTo(b, -4 * r); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.moveTo(-b * 0.72, -h * 0.32); ctx.lineTo(-b * 0.5, -h * 0.55); ctx.lineTo(b * 0.5, -h * 0.55); ctx.lineTo(b * 0.72, -h * 0.32); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.2 * r; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(-b, -4 * r); ctx.lineTo(-3 * r, -h); ctx.lineTo(3 * r, -h); ctx.lineTo(b, -4 * r); ctx.closePath(); ctx.stroke();
    } else {
      var bw = 34 * r, bh = 34 * r;
      ctx.fillStyle = "#8c90bd"; ctx.fillRect(-bw + 2 * r, -bh, 5 * r, bh); ctx.fillRect(bw - 7 * r, -bh, 5 * r, bh);
      ctx.save(); roundRect(-bw, -bh - 4 * r, bw * 2, 15 * r, 5 * r); ctx.clip();
      ctx.fillStyle = "#ffffff"; ctx.fillRect(-bw, -bh - 4 * r, bw * 2, 15 * r);
      ctx.fillStyle = "#ff4d6d";
      for (var sx2 = -bw - 10 * r; sx2 < bw; sx2 += 16 * r) { ctx.beginPath(); ctx.moveTo(sx2, -bh + 11 * r); ctx.lineTo(sx2 + 8 * r, -bh + 11 * r); ctx.lineTo(sx2 + 16 * r, -bh - 4 * r); ctx.lineTo(sx2 + 8 * r, -bh - 4 * r); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.2 * r; roundRect(-bw, -bh - 4 * r, bw * 2, 15 * r, 5 * r); ctx.stroke();
    }
    ctx.restore();
  }

  // Персонаж-жулик: балахон цвета приёма, маска, значок-эмодзи приёма на груди
  function drawCrook(x, y, sc, pat, expr, rot, alpha) {
    var v = patternById[pat] || {}, col = v.color || "#4a2bd0";
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(sc, sc);
    if (alpha != null) ctx.globalAlpha = alpha;
    var sw = Math.sin(tAnim * 14);
    ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(-9, 4 + sw * 4); ctx.moveTo(9, -6); ctx.lineTo(9, 4 - sw * 4); ctx.stroke();
    ctx.fillStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-26, -4); ctx.quadraticCurveTo(-30, -52, 0, -66); ctx.quadraticCurveTo(30, -52, 26, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.ellipse(-10, -50, 7, 4, -0.6, 0, 6.2832); ctx.fill();
    ctx.fillStyle = "#ffd9b8"; ctx.beginPath(); ctx.ellipse(0, -38, 16, 14, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = "#14143a"; roundRect(-18, -46, 36, 11, 5); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 2.2;
    if (expr === "dizzy") {
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-10, -43); ctx.lineTo(-4, -38); ctx.moveTo(-4, -43); ctx.lineTo(-10, -38);
      ctx.moveTo(4, -43); ctx.lineTo(10, -38); ctx.moveTo(10, -43); ctx.lineTo(4, -38); ctx.stroke();
      ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(0, -28, 4, Math.PI, 0); ctx.stroke();
    } else {
      var er = expr === "shock" ? 4.6 : 3.6;
      ctx.beginPath(); ctx.arc(-7, -40.5, er, 0, 6.2832); ctx.arc(7, -40.5, er, 0, 6.2832); ctx.fill();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-7, -41, 1.9, 0, 6.2832); ctx.arc(7, -41, 1.9, 0, 6.2832); ctx.fill();
      ctx.beginPath();
      if (expr === "shock") { ctx.fillStyle = INK; ctx.ellipse(1, -29, 4, 5, 0, 0, 6.2832); ctx.fill(); }
      else if (expr === "laugh") { ctx.fillStyle = "#8a1f3a"; ctx.arc(1, -32, 6.5, 0, Math.PI); ctx.fill(); }
      else { ctx.arc(2, -32, 6, 0.15 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
    }
    ctx.fillStyle = "#ffd9b8"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    var up = expr === "shock" || expr === "dizzy" ? -14 : 0;
    ctx.beginPath(); ctx.arc(-28, -26 + up, 5.5, 0, 6.2832); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(28, -26 + up, 5.5, 0, 6.2832); ctx.fill(); ctx.stroke();
    if (v.emoji) { ctx.font = "15px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(v.emoji, 0, -14); }
    ctx.restore();
  }

  // Нокдаун (выпрыгнул из телефона → БДЫЩ! → улетел), кража монет, нокаут босса
  function drawActors() {
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i], t = a.t;
      if (a.kind === "ko") {
        if (t < 0.42) {
          var u = Math.min(1, t / 0.22), pop = easeOutBack(u);
          drawCrook(a.x0, a.y0 - 30 - 40 * pop, 1.05 * (0.5 + 0.5 * pop), a.pat, "shock", Math.sin(t * 30) * 0.05);
        } else {
          var f = t - 0.42;
          var fx = a.x0 - a.dir * 340 * f, fy = a.y0 - 70 - 420 * f + 260 * f * f;
          drawCrook(fx, fy, Math.max(0.2, 1.05 - f * 0.7), a.pat, "dizzy", f * 12 * -a.dir, Math.max(0, 1 - f / 1.05));
        }
      } else if (a.kind === "steal") {
        var k = clamp((t - 0.25) / 1.0, 0, 1), sx2 = lerp(a.x0, player.x + 30, k), sy2 = lerp(a.y0 - 20, pY + 170, k * k);
        drawCrook(sx2, sy2 - (t < 0.25 ? 40 * easeOutBack(t / 0.25) : 40 * (1 - k)), 1.05, a.pat, "laugh", Math.sin(t * 20) * 0.08);
      } else if (a.kind === "bossko") {
        var g = t;
        drawCrook(a.x0 + 200 * g, a.y0 - 300 * g + 200 * g * g, Math.max(0.3, 1.5 - g * 0.6), "boss", "dizzy", g * 9, Math.max(0, 1 - g / 1.6));
      }
    }
  }

  // Босс у горизонта: «звонит» с телефоном в руке, сверху — его «жизни»
  function drawBoss() {
    if (bossPhase === 0 || bossGone || state !== "run") return;
    // босс сбоку у горизонта — не перекрывается пузырями его сообщений
    var app = Math.min(1, bossT / 0.6), bx = W * 0.8 + Math.sin(tAnim * 1.3) * 8, by = hy + 104 + (1 - easeOutBack(app)) * -80;
    var shk = bossHitT > 0 ? Math.sin(bossHitT * 60) * 6 : 0;
    drawCrook(bx + shk, by, 1.1 * app, "boss", bossHitT > 0 ? "shock" : "grin", 0);
    ctx.save(); ctx.translate(bx + shk - 34 * 1.1, by - 46 * 1.1); ctx.rotate(-0.3);
    ctx.fillStyle = "#14143a"; roundRect(-7, -13, 14, 26, 4); ctx.fill(); ctx.fillStyle = "#9fd3ff"; roundRect(-5, -10, 10, 18, 2); ctx.fill();
    ctx.restore();
    var total = content.boss.messages.length, left = total - bossHits;
    ctx.font = "16px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var hs = ""; for (var i = 0; i < total; i++) hs += i < left ? "❤️" : "🤍";
    ctx.fillText(hs, bx, by - 88);
    ctx.font = "900 13px " + FONT; ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.lineJoin = "round";
    var nx = Math.min(bx, W - ctx.measureText(content.boss.brName).width / 2 - 8);
    ctx.strokeText(content.boss.brName, nx, by - 106); ctx.fillStyle = INK; ctx.fillText(content.boss.brName, nx, by - 106);
  }

  // Комиксные «БДЫЩ!» и реплики-пузыри персонажей
  function drawPops() {
    for (var i = 0; i < pops.length; i++) {
      var p = pops[i], k = 1 - p.life / p.max, a = p.life < 0.3 ? p.life / 0.3 : 1;
      var sc = k < 0.15 ? easeOutBack(k / 0.15) : 1, j;
      ctx.save(); ctx.globalAlpha = a;
      if (p.kind === "boom") {
        ctx.translate(p.x, p.y); ctx.rotate(-0.12); ctx.scale(sc, sc);
        ctx.beginPath();
        for (j = 0; j < 24; j++) { var ang = j / 24 * 6.2832, rr = j % 2 ? 34 : 54; ctx.lineTo(Math.cos(ang) * rr * 1.25, Math.sin(ang) * rr * 0.85); }
        ctx.closePath(); ctx.fillStyle = "#ffd23f"; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = "#ff4d6d"; ctx.stroke();
        ctx.font = "900 24px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 5; ctx.strokeStyle = "#fff"; ctx.lineJoin = "round"; ctx.strokeText(p.text, 0, 1); ctx.fillStyle = INK; ctx.fillText(p.text, 0, 1);
      } else {
        ctx.font = "800 14.5px " + FONT;
        var lines = wrapLines(p.text, 196), lw = 0;
        for (j = 0; j < lines.length; j++) lw = Math.max(lw, ctx.measureText(lines[j]).width);
        var bw = lw + 24, bh = lines.length * 19 + 16, x = clamp(p.x, bw / 2 + 8, W - bw / 2 - 8), y = clamp(p.y, 70 + bh / 2, H - 200);
        ctx.translate(x, y); ctx.scale(sc, sc);
        ctx.fillStyle = "rgba(35,36,106,0.18)"; roundRect(-bw / 2, -bh / 2 + 4, bw, bh, 14); ctx.fill();
        ctx.fillStyle = "#fff"; roundRect(-bw / 2, -bh / 2, bw, bh, 14); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-8, bh / 2 - 1); ctx.lineTo(0, bh / 2 + 9); ctx.lineTo(8, bh / 2 - 1); ctx.closePath(); ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = INK; roundRect(-bw / 2, -bh / 2, bw, bh, 14); ctx.stroke();
        ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (j = 0; j < lines.length; j++) ctx.fillText(lines[j], 0, -bh / 2 + 17 + j * 19);
      }
      ctx.restore();
    }
  }

  // Жулик-преследователь сзади: цвет — последнего жулика, которого ты пропустил
  function drawVillain() {
    if (state !== "run" || chaseVis > 0.9) return;
    var knock = villainKnock > 0 ? Math.sin(Math.PI * (1 - villainKnock / 0.6)) * 40 : 0;
    var vy = pY + 70 + chaseVis * 110 + knock;
    if (vy - 80 > H) return;
    drawCrook(villainX, vy - Math.abs(Math.sin(player.bob * 1.1)) * 4, 1.05, chasePat, chaseVis < 0.35 ? "laugh" : "grin", 0);
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
  function sxAt(xb, r) { return W / 2 + (xb - W / 2) * r; }

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
    ctx.drawImage(townFar, -W * 0.15 - off * 0.05, hy - farH + 2, fw, farH);
    ctx.drawImage(townNear, -W * 0.15 - off * 0.12, hy - nearH + 3, fw, nearH);

    // трава с полосами «стрижки»
    ctx.fillStyle = groundGrad; ctx.fillRect(0, hy, W, H - hy);
    N = 8; ph = (u * N) % 1; fl = Math.floor(u * N);
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    for (i = 0; i <= N; i++) {
      if (((i - fl) & 1) === 0) continue;
      var pa = clamp((i - 1 + ph) / N, 0, DMAX), pb = clamp((i + ph) / N, 0, DMAX);
      var ya = yOf(rOf(pa)), yb = yOf(rOf(pb));
      if (yb > ya && ya < H) ctx.fillRect(0, ya, W, Math.min(yb, H) - ya + 1);
    }

    // бордюры дороги — «пластиковый» объём: светлый верх + тёмный бок
    var tl = W / 2 - (W / 2) * RT, tr = W / 2 + (W / 2) * RT, bl = W / 2 - (W / 2) * rB, br = W / 2 + (W / 2) * rB;
    var cT = 7 * RT, cB = 7 * rB, gold = feverGlow > 0.05;
    ctx.fillStyle = gold ? "#e0a800" : "#c3cde6";
    ctx.beginPath(); ctx.moveTo(tl - cT * 2.2, hy); ctx.lineTo(tl, hy); ctx.lineTo(bl, H); ctx.lineTo(bl - cB * 2.2, H); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(tr, hy); ctx.lineTo(tr + cT * 2.2, hy); ctx.lineTo(br + cB * 2.2, H); ctx.lineTo(br, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = gold ? "#ffd23f" : "#ffffff";
    ctx.beginPath(); ctx.moveTo(tl - cT * 2.2, hy); ctx.lineTo(tl - cT * 0.6, hy); ctx.lineTo(bl - cB * 0.6, H); ctx.lineTo(bl - cB * 2.2, H); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(tr + cT * 0.6, hy); ctx.lineTo(tr + cT * 2.2, hy); ctx.lineTo(br + cB * 2.2, H); ctx.lineTo(br + cB * 0.6, H); ctx.closePath(); ctx.fill();

    // полотно дороги
    ctx.fillStyle = roadGrad;
    ctx.beginPath(); ctx.moveTo(tl, hy); ctx.lineTo(tr, hy); ctx.lineTo(br, H); ctx.lineTo(bl, H); ctx.closePath(); ctx.fill();

    // плитка: поперечные швы в перспективе — ощущение скорости
    N = 12; ph = (u * N) % 1;
    ctx.fillStyle = "rgba(35,36,106,0.07)";
    for (i = 0; i <= N + 2; i++) {
      var pt = (i - 1 + ph) / N; if (pt < 0) continue; if (pt > DMAX) break;
      var rt = rOf(pt), yt = yOf(rt); if (yt > H) break;
      ctx.fillRect(sxAt(0, rt), yt, (W) * rt, Math.max(1, 2.2 * rt));
    }

    // дорожки: мягкая подсветка цветом действия (активная ярче) + вспышки
    for (i = 0; i < LANES; i++) {
      var active = i === player.lane && state === "run";
      var a = active ? 0.16 : 0.06;
      if (laneFlash[i] > 0) a += laneFlash[i] * 0.45;
      if (laneHint[i] > 0) a += (0.16 + 0.16 * Math.sin(tAnim * 18)) * Math.min(1, laneHint[i]);
      var x0 = W * i / LANES, x1 = W * (i + 1) / LANES;
      ctx.fillStyle = "rgba(" + LANE_RGB[i] + "," + a + ")";
      ctx.beginPath();
      ctx.moveTo(sxAt(x0, RT) + 2, hy); ctx.lineTo(sxAt(x1, RT) - 2, hy);
      ctx.lineTo(sxAt(x1, rB) - 2, H); ctx.lineTo(sxAt(x0, rB) + 2, H); ctx.closePath(); ctx.fill();
    }

    // разделители-пунктир
    N = 9; ph = (u * N) % 1;
    ctx.fillStyle = "rgba(115,80,255,0.28)";
    ctx.beginPath();
    for (i = 0; i <= N + 3; i++) {
      var pd = (i - 1 + ph) / N, pe = pd + 0.5 / N;
      if (pe <= 0) continue; if (pd >= DMAX) break;
      pd = Math.max(0, pd); pe = Math.min(DMAX, pe);
      var ra = rOf(pd), rb = rOf(pe), ya2 = yOf(ra), yb2 = yOf(rb);
      if (ya2 >= H) break;
      for (j = 1; j < LANES; j++) {
        var xb = W * j / LANES, wa = 2 * ra, wb = 2 * rb;
        ctx.moveTo(sxAt(xb, ra) - wa, ya2); ctx.lineTo(sxAt(xb, ra) + wa, ya2);
        ctx.lineTo(sxAt(xb, rb) + wb, yb2); ctx.lineTo(sxAt(xb, rb) - wb, yb2); ctx.closePath();
      }
    }
    ctx.fill();

    // стрелки-шевроны в цвет дорожек
    N = 5; ph = (u * N + 0.5) % 1;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (j = 0; j < LANES; j++) {
      ctx.strokeStyle = "rgba(" + LANE_RGB[j] + ",0.38)";
      ctx.beginPath();
      var cxb = W * (j + 0.5) / LANES;
      for (i = 0; i <= N + 1; i++) {
        var pc = (i - 1 + ph) / N; if (pc < 0.05) continue; if (pc > DMAX) break;
        var rc = rOf(pc), yc = yOf(rc), sz = 14 * rc, cx2 = sxAt(cxb, rc);
        if (yc > H - 4) break;
        ctx.moveTo(cx2 - sz, yc + sz * 0.5); ctx.lineTo(cx2, yc - sz * 0.5); ctx.lineTo(cx2 + sz, yc + sz * 0.5);
      }
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // линия решения на уровне героя
    ctx.fillStyle = "rgba(115,80,255," + (0.1 + 0.06 * Math.sin(tAnim * 5)) + ")";
    ctx.fillRect(sxAt(0, 1), pY + 31 * HS, W, 3);

    // придорожные деревья и кусты (двигаются синхронно с карточками)
    N = 7; ph = (u * N) % 1; fl = Math.floor(u * N);
    for (i = 0; i <= N; i++) {
      var pp = (i + ph) / N; if (pp > DMAX) break;
      r = rOf(pp); y = yOf(r);
      var tree = ((i - fl) & 1) === 0;
      for (j = -1; j <= 1; j += 2) {
        var ox = W / 2 + j * W * 0.62 * r;
        ctx.fillStyle = "rgba(35,90,40,0.18)";
        ctx.beginPath(); ctx.ellipse(ox, y, 22 * r, 7 * r, 0, 0, 6.2832); ctx.fill();
        if (tree) {
          ctx.fillStyle = "#b07a4f"; ctx.fillRect(ox - 3.5 * r, y - 30 * r, 7 * r, 30 * r);
          var tr2 = 24 * r, ty = y - 44 * r;
          var tg = ctx.createRadialGradient(ox - tr2 * 0.35, ty - tr2 * 0.4, 1, ox, ty, tr2 * 1.05);
          tg.addColorStop(0, "#a4f287"); tg.addColorStop(1, "#3fae3a");
          ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(ox, ty, tr2, 0, 6.2832); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.ellipse(ox - tr2 * 0.35, ty - tr2 * 0.45, tr2 * 0.32, tr2 * 0.18, -0.5, 0, 6.2832); ctx.fill();
        } else {
          ctx.fillStyle = "#4cb848";
          ctx.beginPath(); ctx.ellipse(ox, y - 12 * r, 26 * r, 15 * r, 0, 0, 6.2832); ctx.fill();
          ctx.fillStyle = "#7ddb62";
          ctx.beginPath(); ctx.ellipse(ox - 5 * r, y - 18 * r, 16 * r, 9 * r, 0, 0, 6.2832); ctx.fill();
          ctx.fillStyle = j < 0 ? "#ff7a92" : "#ffd23f";
          ctx.beginPath(); ctx.arc(ox + 9 * r, y - 17 * r, 3.2 * r, 0, 6.2832); ctx.fill();
        }
      }
    }

    // лёгкие скоростные линии от горизонта
    if (state === "run" && !REDUCED) {
      var spd = clamp((speed - diff.startSpeed) / (diff.maxSpeed - diff.startSpeed), 0, 1);
      ctx.strokeStyle = "rgba(255,255,255," + (0.18 + spd * 0.25) + ")";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      var cnt = 8 + Math.round(spd * 3), L = H * 1.1, vy = hy - 4;
      for (i = 0; i < cnt; i++) {
        var t = (i * 0.0833 + u * 2.4) % 1, d1 = t * t * L, d2 = d1 + 10 + t * (50 + spd * 80);
        var ca = Math.cos(streakAng[i]), sa2 = Math.sin(streakAng[i]);
        ctx.moveTo(W / 2 + ca * d1 * 1.2, vy + sa2 * d1); ctx.lineTo(W / 2 + ca * d2 * 1.2, vy + sa2 * d2);
      }
      ctx.stroke();
    }
  }

  function wrapLines(text, maxW) {
    var words = text.split(" "), line = "", lines = [];
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines.slice(0, 3);
  }

  // Карточка = телефон на ножках (одинаковый для всех — ребёнок читает текст, а не внешность) + пузырь-сообщение
  function drawPhone(c) {
    var run = Math.sin(tAnim * 14 + c.ph);
    ctx.strokeStyle = INK; ctx.lineWidth = 4.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-6 + run * 3, 0); ctx.moveTo(6, -8); ctx.lineTo(6 - run * 3, 0); ctx.stroke();
    ctx.fillStyle = "#2b2d6e"; roundRect(-16, -PH_H + 4, 32, 38, 8); ctx.fill();
    ctx.fillStyle = c.boss ? "#ffd9e0" : "#bfe3ff"; roundRect(-12, -PH_H + 8, 24, 28, 5); ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(-5, -PH_H + 19, 2.2, 0, 6.2832); ctx.arc(5, -PH_H + 19, 2.2, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(0, -PH_H + 24, 3.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
  function drawCard(c) {
    var w = cardW(), h = cardH();
    var p = clamp((c.y + h) / pY, 0, DMAX);
    var r = rOf(p), sy = yOf(r), sx = sxAt(c.x, r);
    var rn = clamp((r - RT) / (1 - RT), 0, 1.4);
    var s = (0.8 + 0.2 * rn) * (c.resolved ? 1 : 1 + 0.08 * slowVis);
    var alpha = clamp(c.age / 0.18, 0, 1), pop = 1;
    if (c.age < 0.28) pop = 0.55 + 0.45 * easeOutBack(c.age / 0.28);
    var bubA = 1, phA = 1, lift = 0, shx = 0;
    if (c.resolved) {
      var k = 1 - clamp(c.removeTimer / c.removeMax, 0, 1);
      if (c.result === "ok" && c.isTrap && !c.boss) { bubA = 1 - clamp(k / 0.35, 0, 1); phA = 1 - clamp((k - 0.4) / 0.6, 0, 1); }
      else if (c.result === "ok") { bubA = phA = 1 - k; lift = k * 16; }
      else { shx = Math.sin(k * 55) * 7 * (1 - k); bubA = phA = 1 - k; }
    }
    if (alpha * Math.max(bubA, phA) <= 0.01) return;
    var half = (w / 2) * s * pop + 6;
    sx = clamp(sx, half, W - half);
    var x = -w / 2, y = -h;
    ctx.save();
    ctx.translate(sx + shx, sy - lift);
    ctx.scale(s * pop, s * pop);
    ctx.globalAlpha = alpha * phA;
    ctx.fillStyle = "rgba(35,36,106,0.16)";
    ctx.beginPath(); ctx.ellipse(0, 2, 26, 6, 0, 0, 6.2832); ctx.fill();
    drawPhone(c);
    ctx.globalAlpha = alpha * bubA;
    ctx.fillStyle = "#cdd8ee"; roundRect(x, y + 5, w, BUB_H, 18); ctx.fill();
    ctx.fillStyle = "#ffffff"; roundRect(x, y, w, BUB_H, 18); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-9, y + BUB_H - 1); ctx.lineTo(0, y + BUB_H + 9); ctx.lineTo(9, y + BUB_H - 1); ctx.closePath(); ctx.fill();
    var border = "rgba(35,36,106,0.06)";
    if (c.flashT > 0) border = c.result === "ok" ? "rgba(34,195,122,0.95)" : "rgba(255,77,109,0.95)";
    ctx.lineWidth = c.flashT > 0 ? 3.5 : 1.5; ctx.strokeStyle = border;
    roundRect(x, y, w, BUB_H, 18); ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "28px " + FONT; ctx.fillStyle = "#000";
    ctx.fillText(c.icon, 0, y + 24);
    ctx.fillStyle = INK; ctx.font = "800 15.5px " + FONT;
    for (var i = 0; i < c.lines.length; i++) ctx.fillText(c.lines[i], 0, y + 53 + i * 18);
    if (c.resolved) {
      var st = easeOutBack(clamp((c.removeMax - c.removeTimer) / 0.2 + 0.2, 0, 1));
      ctx.save(); ctx.translate(w / 2 - 6, y + 6); ctx.scale(st, st);
      ctx.fillStyle = c.result === "ok" ? "#22c37a" : "#ff4d6d";
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      if (c.result === "ok") { ctx.moveTo(-6, 0); ctx.lineTo(-2, 5); ctx.lineTo(6, -5); }
      else { ctx.moveTo(-5, -5); ctx.lineTo(5, 5); ctx.moveTo(5, -5); ctx.lineTo(-5, 5); }
      ctx.stroke(); ctx.restore();
    }
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
    var x = player.x + (hurtT > 0 ? Math.sin(hurtT * 70) * 6 * (hurtT / 0.55) : 0);
    var bounce = -Math.abs(Math.sin(player.bob)) * 3.5;
    var hop = hopT > 0 ? -Math.sin(Math.PI * (1 - hopT / 0.36)) * 20 : 0;
    var y = playerY() + bounce + hop;
    var sq = squashT > 0 ? squashT / 0.22 : 0;
    var dx = player.targetX - player.x;
    var lean = clamp(dx / 70, -0.38, 0.38);
    var sx = 1 + sq * 0.2 + Math.abs(lean) * 0.1, sy = 1 - sq * 0.18;
    if (hopT > 0) { sy += 0.12 * Math.sin(Math.PI * (1 - hopT / 0.36)); sx -= 0.06; }
    var wob = hurtT > 0 ? Math.sin(hurtT * 48) * 0.28 * (hurtT / 0.55) : 0;
    var air = hop < -2 ? clamp(-hop / 20, 0, 1) : 0;

    // кольцо под ногами цвета текущей дорожки + тень
    var gy = playerY() + 36 * HS;
    ctx.fillStyle = "rgba(" + LANE_RGB[player.lane] + "," + (0.28 + 0.1 * Math.sin(tAnim * 6)) + ")";
    ctx.beginPath(); ctx.ellipse(x, gy, (34 - air * 8) * HS, (11 - air * 3) * HS, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = "rgba(35,36,106," + (0.22 - air * 0.1) + ")";
    ctx.beginPath(); ctx.ellipse(x, gy, (22 - air * 6 + sq * 4) * HS, (7 - air * 2) * HS, 0, 0, 6.2832); ctx.fill();

    // шлейф-призраки при смене дорожки
    var moving = Math.abs(dx) > 8;
    if (moving && !REDUCED) {
      for (var gI = 0; gI < 3; gI++) {
        ctx.save(); ctx.translate(ghostX[gI], y); ctx.scale(HS, HS); ctx.globalAlpha = 0.22 - gI * 0.06; shieldPath();
        ctx.fillStyle = "#00c1a0"; ctx.fill(); ctx.restore();
      }
    }
    ghostX[2] = ghostX[1]; ghostX[1] = ghostX[0]; ghostX[0] = x;

    // аура
    ctx.globalAlpha = 0.18 + 0.4 * feverGlow;
    var ag = (58 + feverGlow * 10) * HS;
    ctx.drawImage(feverGlow > 0.5 ? glowGold : glowGreen, x - ag, y - ag, ag * 2, ag * 2);
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(x, y); ctx.rotate(lean + wob); ctx.scale(sx * HS, sy * HS);
    if (hurtT > 0 && ((hurtT * 14) | 0) % 2 === 0) ctx.globalAlpha = 0.55;

    var sw = Math.sin(player.bob);
    // ноги
    ctx.lineCap = "round";
    for (var lg = -1; lg <= 1; lg += 2) {
      var ph2 = lg === -1 ? sw : -sw, ly = 31 + ph2 * 4.5 - air * 4;
      ctx.strokeStyle = INK; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(lg * 9, 22); ctx.lineTo(lg * 9, ly); ctx.stroke();
      ctx.fillStyle = "#ffc24b";
      ctx.beginPath(); ctx.ellipse(lg * 9 + lg * 1.5, ly + 3, 7.5, 4.6, 0, 0, 6.2832); ctx.fill();
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
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(-26, 4 + sw * 5 - air * 8, 5, 0, 6.2832); ctx.stroke(); ctx.fill();
    ctx.beginPath(); ctx.arc(26, 4 - sw * 5 - air * 8, 5, 0, 6.2832); ctx.stroke(); ctx.fill();

    // тело-щит: фирменный зелёный градиент
    var gr = ctx.createLinearGradient(-22, -28, 22, 28);
    gr.addColorStop(0, "#2bbf4a"); gr.addColorStop(0.55, "#21a038"); gr.addColorStop(1, "#00b49a");
    shieldPath(); ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.lineJoin = "round"; ctx.stroke();
    ctx.fillStyle = gr; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "#ffffff"; ctx.stroke();
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
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- Кнопки / UI ----------
  function setupUI() {
    $("btn-play").addEventListener("click", function () { Sound.ensure(); startRun(); });
    $("btn-again").addEventListener("click", function () { startRun(); });
    $("btn-more").addEventListener("click", function () { var m = $("more"); m.open = !m.open; if (m.open) m.scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("btn-close").addEventListener("click", function () { Bridge.close(); });

    var tgl = $("sound-toggle");
    tgl.addEventListener("change", function () { Sound.on = tgl.checked; Sound.ensure(); syncSoundBtn(); });
    $("sound-run").addEventListener("click", function () { Sound.on = !Sound.on; tgl.checked = Sound.on; Sound.ensure(); syncSoundBtn(); });
    syncSoundBtn();
  }
  function syncSoundBtn() { $("sound-run").textContent = Sound.on ? "🔊" : "🔈"; }

  // ---------- Фолбэк-контент (если fetch не сработал) ----------
  var FALLBACK = {
    actions: [{ id: "refuse", lane: 0, emoji: "🛑", label: "Отказать" }, { id: "check", lane: 1, emoji: "🔎", label: "Проверить" }, { id: "ok", lane: 2, emoji: "✅", label: "Можно" }],
    patterns: [
      { id: "codethief", name: "Кодокрад", emoji: "🔑", answer: "refuse" },
      { id: "prize", name: "Призовик", emoji: "🎁", answer: "refuse" },
      { id: "linker", name: "Ссылочник", emoji: "🔗", answer: "check" }
    ],
    difficulty: { startSpeed: 140, maxSpeed: 330, speedRampPerSec: 1.6 },
    situations: [
      { pattern: "codethief", icon: "💬", text: "Назови код из СМС", answer: "refuse", why: "Код из СМС — секрет, его нельзя говорить никому." },
      { pattern: "prize", icon: "💬", text: "Ты выиграл телефон! Оплати доставку", answer: "refuse", why: "Приз, за который надо платить, — обман." },
      { pattern: "linker", icon: "💬", text: "Перейди: sberr-priz.xyz", answer: "check", why: "Странная ссылка — лучше проверить." },
      { pattern: "safe", icon: "💬", text: "Мама: «Иди ужинать!»", answer: "ok", why: "Обычная просьба мамы — всё хорошо." }
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
