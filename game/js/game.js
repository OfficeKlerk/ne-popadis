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
    swish: function () { this.blip(420, 0.05, "sine"); }
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
  var LANE_COLORS = ["#ff5a5f", "#3e9bff", "#2fd06e"]; // отказать / проверить / можно
  var LANE_RGB = ["255,90,95", "62,155,255", "47,208,110"];
  var FONT = "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif";

  // ---------- Геометрия псевдо-перспективы ----------
  // Глубина p: 0 — горизонт, 1 — линия решения (позиция героя). Масштаб r(p) = 1 / (1 + (1-p)K).
  var RT = 0.34;                  // масштаб дороги на горизонте
  var KP = 1 / RT - 1;
  var hy = 0, y0 = 0, pY = 0, rB = 1;
  var skyGrad, groundGrad, roadGrad;
  var glowTeal, glowGold, glowGreen;
  var skyFar, skyNear, stars = [];
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

  function makeSkyline(w, h, seed, base, lit, windows) {
    var c = document.createElement("canvas"); c.width = Math.round(w * DPR); c.height = Math.round(h * DPR);
    var g = c.getContext("2d"); g.scale(DPR, DPR);
    var s = seed;
    function rnd() { s = (s * 16807) % 2147483647; return s / 2147483647; }
    var x = -4;
    while (x < w) {
      var bw = 18 + rnd() * 34, bh = h * (0.28 + rnd() * 0.72);
      g.fillStyle = base; g.fillRect(x, h - bh, bw, bh);
      if (rnd() > 0.7) g.fillRect(x + bw * 0.3, h - bh - 8, bw * 0.4, 8);
      if (windows) {
        g.fillStyle = lit;
        for (var wy = h - bh + 6; wy < h - 4; wy += 9) {
          for (var wx = x + 4; wx < x + bw - 4; wx += 8) { if (rnd() > 0.72) g.fillRect(wx, wy, 3, 4); }
        }
      }
      x += bw + 1 + rnd() * 5;
    }
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
    pY = H * 0.80; hy = H * 0.21;
    y0 = (hy - RT * pY) / (1 - RT);
    rB = (H - y0) / (pY - y0);
    skyGrad = ctx.createLinearGradient(0, 0, 0, hy);
    skyGrad.addColorStop(0, "#07131f"); skyGrad.addColorStop(0.65, "#0f3340"); skyGrad.addColorStop(1, "#1c6a66");
    groundGrad = ctx.createLinearGradient(0, hy, 0, H);
    groundGrad.addColorStop(0, "#0b1f24"); groundGrad.addColorStop(1, "#08141a");
    roadGrad = ctx.createLinearGradient(0, hy, 0, H);
    roadGrad.addColorStop(0, "#1f3445"); roadGrad.addColorStop(1, "#16252f");
    glowTeal = makeGlow("0,193,160", 128); glowGold = makeGlow("255,194,75", 64); glowGreen = makeGlow("33,160,56", 96);
    skyFar = makeSkyline(W * 1.3, hy * 0.62, 7, "#123a46", "", false);
    skyNear = makeSkyline(W * 1.3, hy * 0.46, 29, "#0a2230", "rgba(255,214,120,0.85)", true);
    stars = [];
    var s = 11;
    for (var i = 0; i < 26; i++) { s = (s * 16807) % 2147483647; var a = s / 2147483647; s = (s * 16807) % 2147483647; stars.push({ x: a * W, y: (s / 2147483647) * hy * 0.6, ph: i * 1.7 }); }
  }

  // ---------- Загрузка контента ----------
  function loadContent() {
    fetch("content.json", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        content = data;
        diff = data.difficulty;
        applyContent(data);
        showScreen("start");
      })
      .catch(function () {
        // Фолбэк, если fetch недоступен (file://): минимальный контент
        content = FALLBACK; diff = FALLBACK.difficulty;
        applyContent(FALLBACK);
        showScreen("start");
      });
  }
  function applyContent(data) {
    (data.actions || []).forEach(function (a) { actionLaneById[a.id] = a.lane; actionById[a.id] = a; });
    (data.patterns || []).forEach(function (p) { patternById[p.id] = p; });
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
    meters = 0; coins = 0; combo = 0; bestCombo = 0; lives = diff.lives;
    trapsTotal = 0; trapsOK = 0; decisionsTotal = 0; decisionsOK = 0;
    misses = []; lastSituation = null; flashTimer = 0; ending = false; endTimer = 0;
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

  var livesEls = [];
  function renderLives(lostIdx) {
    var el = $("lives"), s = "";
    for (var i = 0; i < diff.lives; i++) s += '<span class="life' + (i >= lives ? " lost" : "") + (i === lostIdx ? " pop" : "") + '">🛡️</span>';
    el.innerHTML = s;
  }

  // ---------- Спавн ситуаций ----------
  function spawnSituation() {
    var list = content.situations;
    var s = list[(rng() * list.length) | 0];
    var guard = 0;
    // не повторяем ту же карточку и тот же приём подряд (кроме «безопасных»)
    while ((s === lastSituation || (lastSituation && s.pattern !== "safe" && s.pattern === lastSituation.pattern)) && guard++ < 8) s = list[(rng() * list.length) | 0];
    lastSituation = s;
    var lane = actionLaneById[s.answer];
    ctx.font = "700 15.5px " + FONT;
    cards.push({
      icon: s.icon, text: s.text, why: s.why, answer: s.answer, pattern: s.pattern, lines: wrapLines(s.text, cardW() - 16),
      answerLane: lane, isTrap: s.answer !== "ok",
      x: laneX(1), y: -cardH(), resolved: false, result: null, flashT: 0, removeTimer: 0, age: 0
    });
  }
  function cardW() { return Math.min(W * 0.46, 178); }
  function cardH() { return 108; }

  // ---------- Ввод ----------
  function move(dir) {
    if (state !== "run") return;
    var prev = player.lane;
    player.lane = clamp(player.lane + dir, 0, LANES - 1);
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
    var sx = 0, sy = 0, swiping = false;
    cv.addEventListener("touchstart", function (e) {
      var t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; swiping = true;
    }, { passive: true });
    cv.addEventListener("touchend", function (e) {
      if (!swiping) return; swiping = false;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) { move(dx > 0 ? 1 : -1); }
      else if (Math.abs(dx) < 16 && Math.abs(dy) < 16) { move(t.clientX < W / 2 ? -1 : 1); } // тап по стороне
    }, { passive: true });
    // мышь — для теста в браузере
    cv.addEventListener("mousedown", function (e) {
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
    decisionsTotal++;
    if (c.isTrap) trapsTotal++;
    var correct = player.lane === c.answerLane;
    c.result = correct ? "ok" : "bad";
    history.push(correct);
    if (c.pattern) { var ps = patStats[c.pattern] || (patStats[c.pattern] = { ok: 0, bad: 0 }); ps[correct ? "ok" : "bad"]++; }
    var villain = patternById[c.pattern];
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
      if (villain) addFloat(W / 2, H * 0.30, villain.emoji + " " + villain.name + " пойман!", "#ffc24b", 22);
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
      misses.push({ icon: c.icon, text: c.text, why: c.why, isTrap: c.isTrap, answer: c.answer, pattern: c.pattern });
      Bridge.vibrate(70); Sound.bad();
      shake(10); vignetteT = 0.5; squashT = 0.22; hurtT = 0.55;
      laneHint[c.answerLane] = 1.6;
      spawnBurst(player.x, hy2 - 30, "#ff5a5f"); spawnBurst(player.x, hy2, "#ff8a8e");
      addFloat(player.x, hy2 - 62, hadCombo ? "Серия прервана" : "Ой!", "#ff8a8e", 22);
      showFlash(c);
      if (lives <= 0) { ending = true; endTimer = 2.0; }
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
    var who = v ? '<div class="flash-villain">' + v.emoji + " Это был " + escapeHtml(v.name) + "</div>"
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
    cards = []; clearFx();
    counters = [];
    countTo("end-distance", Math.round(meters), "", 0.25);
    countTo("end-recognized", trapsOK, "/" + trapsTotal, 0.45);
    countTo("end-coins", coins, "", 0.65);
    $("end-decisions").textContent = "Верных решений: " + decisionsOK + " из " + decisionsTotal;

    var pct = trapsTotal ? trapsOK / trapsTotal : 1;
    var verdict, stars3;
    if (pct >= 0.9) { verdict = "🏆 Супер! Тебя почти не провести."; stars3 = 3; }
    else if (pct >= 0.6) { verdict = "👍 Хорошо! Но пару ловушек ты пропустил."; stars3 = 2; }
    else { verdict = "🧐 Давай ещё — мошенники хитрые, но ты научишься их ловить."; stars3 = 1; }
    $("end-verdict").textContent = verdict;
    var st = "";
    for (var s = 0; s < 3; s++) st += '<span class="star' + (s < stars3 ? " on" : "") + '" style="animation-delay:' + (0.2 + s * 0.18) + 's">★</span>';
    $("end-stars").innerHTML = st;
    if (stars3 >= 2) spawnConfetti(0, -10, stars3 === 3 ? 60 : 30, false);

    var list = $("review-list"); list.innerHTML = "";
    var uniq = {};
    var uniqueMisses = misses.filter(function (m) { if (uniq[m.text]) return false; uniq[m.text] = 1; return true; });
    $("review-title").classList.toggle("hidden", uniqueMisses.length === 0);
    $("review-title").textContent = "Разбор ошибок (все неверные решения) — нажми, чтобы понять:";
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
    $("end-code").innerHTML = (friendRun ? "Забег друга, код " : "Код твоего забега: ") + "<b>" + runCode + "</b>" +
      '<span class="ec-sub">' + (friendRun ? "Сравни результат с другом!" : "Поделись — друг пройдёт тот же забег") + "</span>";

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
      h += '<div class="villain ' + cls + '"><div class="v-emoji">' + p.emoji + '</div><div class="v-name">' + escapeHtml(p.name) +
        '</div><div class="v-state">' + (cls === "caught" ? "пойман" : cls === "escaped" ? "ускользнул" : "не встретился") + "</div></div>";
    });
    $("villains-grid").innerHTML = h;
    $("villains-title").textContent = "Разоблачено жуликов: " + villainsCaught + " из " + villainsTotal;
    $("end-villains").classList.toggle("hidden", !villainsTotal);
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

    elapsed += dt;
    speed = Math.min(diff.maxSpeed, diff.startSpeed + elapsed * diff.speedRampPerSec) * (0.68 + 0.32 * Math.min(1, elapsed / 20));
    meters += speed * dt * 0.09;
    roadScroll += speed * dt;
    player.x = lerp(player.x, player.targetX, Math.min(1, dt * 14));
    player.bob += dt * (11 + speed / 90);

    // одно решение за раз: новая карточка — только когда нет нерешённых
    var hasUnresolved = false;
    for (var k2 = 0; k2 < cards.length; k2++) { if (!cards[k2].resolved) { hasUnresolved = true; break; } }
    spawnTimer -= dt;
    var gap = Math.max(diff.spawnGapMin, diff.spawnGapStart - elapsed * diff.spawnGapRampPerSec) * (elapsed < 20 ? 1.3 : 1);
    if (spawnTimer <= 0 && !hasUnresolved && !ending) { spawnSituation(); spawnTimer = gap; }

    // движение карточек
    var pYY = playerY();
    for (var j = cards.length - 1; j >= 0; j--) {
      var c = cards[j];
      c.y += speed * dt; c.age += dt;
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
    drawRoad();
    for (var i = 0; i < cards.length; i++) drawCard(cards[i]);
    drawPlayer();
    drawFx();
    ctx.restore();
    drawVignette();
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

    // небо
    ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, hy + 1);
    ctx.fillStyle = "#cfeee6";
    for (i = 0; i < stars.length; i++) {
      ctx.globalAlpha = REDUCED ? 0.5 : 0.35 + 0.35 * Math.sin(tAnim * 1.6 + stars[i].ph);
      ctx.fillRect(stars[i].x, stars[i].y, 2, 2);
    }
    ctx.globalAlpha = 0.85;
    ctx.drawImage(glowTeal, W / 2 - W * 0.8, hy - W * 0.5, W * 1.6, W * 0.9);
    ctx.globalAlpha = 1;
    // параллакс-слои города: реагируют на положение героя
    var off = REDUCED ? 0 : (player.x - W / 2);
    var fw = W * 1.3, farH = hy * 0.62, nearH = hy * 0.46;
    ctx.drawImage(skyFar, -W * 0.15 - off * 0.05, hy - farH, fw, farH);
    ctx.drawImage(skyNear, -W * 0.15 - off * 0.12, hy - nearH, fw, nearH);

    // земля + дорога
    ctx.fillStyle = groundGrad; ctx.fillRect(0, hy, W, H - hy);
    var tl = W / 2 - (W / 2) * RT, tr = W / 2 + (W / 2) * RT, bl = W / 2 - (W / 2) * rB, br = W / 2 + (W / 2) * rB;
    ctx.fillStyle = roadGrad;
    ctx.beginPath(); ctx.moveTo(tl, hy); ctx.lineTo(tr, hy); ctx.lineTo(br, H); ctx.lineTo(bl, H); ctx.closePath(); ctx.fill();

    // полосы-«шпалы» в перспективе — главный источник ощущения скорости
    N = 8; ph = (u * N) % 1; fl = Math.floor(u * N);
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    for (i = 0; i <= N; i++) {
      if (((i - fl) & 1) === 0) continue;
      var pa = clamp((i - 1 + ph) / N, 0, 1.3), pb = clamp((i + ph) / N, 0, 1.3);
      var ya = yOf(rOf(pa)), yb = yOf(rOf(pb));
      if (yb > ya && ya < H) ctx.fillRect(0, ya, W, Math.min(yb, H) - ya + 1);
    }

    // дорожки: подсветка цветом действия (активная ярче) + вспышки
    for (i = 0; i < LANES; i++) {
      var active = i === player.lane && state === "run";
      var a = active ? 0.17 : 0.06;
      if (laneFlash[i] > 0) a += laneFlash[i] * 0.5;
      if (laneHint[i] > 0) a += (0.18 + 0.18 * Math.sin(tAnim * 18)) * Math.min(1, laneHint[i]);
      var x0 = W * i / LANES, x1 = W * (i + 1) / LANES;
      ctx.fillStyle = "rgba(" + LANE_RGB[i] + "," + a + ")";
      ctx.beginPath();
      ctx.moveTo(sxAt(x0, RT) + 2, hy); ctx.lineTo(sxAt(x1, RT) - 2, hy);
      ctx.lineTo(sxAt(x1, rB) - 2, H); ctx.lineTo(sxAt(x0, rB) + 2, H); ctx.closePath(); ctx.fill();
    }

    // неоновые края дороги (золотые при серии)
    var edgeCol = feverGlow > 0.02 ? "rgba(255,194,75," + (0.55 + feverGlow * 0.4) + ")" : "rgba(0,193,160,0.55)";
    ctx.strokeStyle = edgeCol; ctx.lineWidth = 3 + feverGlow * 2;
    ctx.beginPath(); ctx.moveTo(tl, hy); ctx.lineTo(bl, H); ctx.moveTo(tr, hy); ctx.lineTo(br, H); ctx.stroke();
    if (feverGlow > 0.05) {
      ctx.strokeStyle = "rgba(255,194,75," + feverGlow * 0.16 + ")"; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(tl, hy); ctx.lineTo(bl, H); ctx.moveTo(tr, hy); ctx.lineTo(br, H); ctx.stroke();
    }

    // разделители-пунктир: трапеции, сходящиеся к горизонту
    N = 9; ph = (u * N) % 1;
    ctx.fillStyle = "rgba(255,255,255,0.32)";
    ctx.beginPath();
    for (i = 0; i <= N + 3; i++) {
      var pd = (i - 1 + ph) / N, pe = pd + 0.5 / N;
      if (pe <= 0) continue; if (pd >= 1.3) break;
      pd = Math.max(0, pd); pe = Math.min(1.3, pe);
      var ra = rOf(pd), rb = rOf(pe), ya2 = yOf(ra), yb2 = yOf(rb);
      if (ya2 >= H) break;
      for (j = 1; j < LANES; j++) {
        var xb = W * j / LANES, wa = 1.6 * ra, wb = 1.6 * rb;
        ctx.moveTo(sxAt(xb, ra) - wa, ya2); ctx.lineTo(sxAt(xb, ra) + wa, ya2);
        ctx.lineTo(sxAt(xb, rb) + wb, yb2); ctx.lineTo(sxAt(xb, rb) - wb, yb2); ctx.closePath();
      }
    }
    ctx.fill();

    // стрелки-шевроны в цвет дорожек (бегут к герою, ярче в нижней трети)
    N = 5; ph = (u * N + 0.5) % 1;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (j = 0; j < LANES; j++) {
      ctx.strokeStyle = "rgba(" + LANE_RGB[j] + ",0.5)";
      ctx.beginPath();
      var cxb = W * (j + 0.5) / LANES;
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
    ctx.fillRect(sxAt(0, 1), pY + 31, W, 3);

    // придорожные фонари и кусты (двигаются синхронно с карточками)
    N = 7; ph = (u * N) % 1; fl = Math.floor(u * N);
    for (i = 0; i <= N; i++) {
      var pp = (i + ph) / N; if (pp > 1.28) break;
      r = rOf(pp); y = yOf(r);
      var lamp = ((i - fl) & 1) === 0;
      for (j = -1; j <= 1; j += 2) {
        var ox = W / 2 + j * W * 0.6 * r;
        if (lamp) {
          ctx.strokeStyle = "#0a1820"; ctx.lineWidth = Math.max(1.5, 4 * r);
          ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox, y - 78 * r); ctx.lineTo(ox - j * 14 * r, y - 84 * r); ctx.stroke();
          var g = 30 * r;
          ctx.globalAlpha = 0.9;
          ctx.drawImage(glowGold, ox - j * 14 * r - g, y - 84 * r - g, g * 2, g * 2);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = "#0c3a2c";
          ctx.beginPath(); ctx.ellipse(ox, y - 10 * r, 30 * r, 22 * r, 0, 0, 6.2832); ctx.fill();
          ctx.fillStyle = "#14633f";
          ctx.beginPath(); ctx.ellipse(ox - 4 * r, y - 16 * r, 20 * r, 14 * r, 0, 0, 6.2832); ctx.fill();
        }
      }
    }

    // скоростные линии, разлетающиеся от горизонта
    if (state === "run" && !REDUCED) {
      var spd = clamp((speed - diff.startSpeed) / (diff.maxSpeed - diff.startSpeed), 0, 1);
      ctx.strokeStyle = "rgba(255,255,255," + (0.12 + spd * 0.2) + ")";
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

  function drawCard(c) {
    var w = cardW(), h = cardH();
    var p = clamp((c.y + h) / pY, 0, 1.38);
    var r = rOf(p), sy = yOf(r), sx = sxAt(c.x, r);
    var rn = clamp((r - RT) / (1 - RT), 0, 1.4);
    var s = 0.8 + 0.2 * rn;                       // читаемость: карточка не уменьшается сильно
    var alpha = clamp(c.age / 0.18, 0, 1), pop = 1;
    if (c.age < 0.28) pop = 0.55 + 0.45 * easeOutBack(c.age / 0.28);
    var lift = 0;
    if (c.resolved) {
      var fo = clamp(c.removeTimer / 0.5, 0, 1), k = 1 - fo;
      if (c.result === "ok") {
        // карточка влетает в героя: «поймал»
        var kk = k * k * (3 - 2 * k);
        sx = lerp(sx, player.x, kk); sy = lerp(sy, pY - 12, kk);
        pop *= 1 - 0.55 * kk; alpha *= k < 0.7 ? 1 : (1 - k) / 0.3;
      } else {
        // карточка «разбивается»: дрожит и краснеет
        sx += Math.sin(k * 55) * 7 * fo; pop *= 1 + k * 0.18; alpha *= fo < 0.4 ? fo / 0.4 : 1; lift = k * 10;
      }
    }
    if (alpha <= 0.01) return;
    var x = -w / 2, y = -h;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sx, sy - lift);
    ctx.scale(s * pop, s * pop);
    // тень на дороге
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.beginPath(); ctx.ellipse(0, 10, w * 0.42, 7, 0, 0, 6.2832); ctx.fill();
    // фон карточки нейтральный (чтобы ребёнок читал текст, а не цвет)
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    roundRect(x + 2, y + 6, w, h, 14); ctx.fill();
    ctx.fillStyle = "#ffffff";
    roundRect(x, y, w, h, 14); ctx.fill();
    // «хвостик» сообщения
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(0, 9); ctx.lineTo(9, 0); ctx.closePath(); ctx.fill();
    var border = "rgba(0,0,0,0.10)";
    if (c.flashT > 0) border = c.result === "ok" ? "rgba(33,160,56,0.95)" : "rgba(229,72,77,0.95)";
    ctx.lineWidth = c.flashT > 0 ? 3.5 : 1.5; ctx.strokeStyle = border;
    roundRect(x, y, w, h, 14); ctx.stroke();

    // иконка
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "30px " + FONT;
    ctx.fillStyle = "#000";
    ctx.fillText(c.icon, 0, y + 25);
    // текст (перенос предвычислен при появлении)
    ctx.fillStyle = "#0e1a12";
    ctx.font = "700 15.5px " + FONT;
    for (var i = 0; i < c.lines.length; i++) ctx.fillText(c.lines[i], 0, y + 54 + i * 18);

    // штамп результата (после решения)
    if (c.resolved) {
      var st = easeOutBack(clamp((0.5 - c.removeTimer) / 0.2 + 0.2, 0, 1));
      var bx = w / 2 - 6, by = y + 6;
      ctx.save(); ctx.translate(bx, by); ctx.scale(st, st);
      ctx.fillStyle = c.result === "ok" ? "#21a038" : "#e5484d";
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      if (c.result === "ok") { ctx.moveTo(-6, 0); ctx.lineTo(-2, 5); ctx.lineTo(6, -5); }
      else { ctx.moveTo(-5, -5); ctx.lineTo(5, 5); ctx.moveTo(5, -5); ctx.lineTo(-5, 5); }
      ctx.stroke();
      ctx.restore();
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
    if (state !== "run") return;
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
    var gy = playerY() + 36;
    ctx.fillStyle = "rgba(" + LANE_RGB[player.lane] + "," + (0.28 + 0.1 * Math.sin(tAnim * 6)) + ")";
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
    ctx.globalAlpha = 0.55 + 0.2 * feverGlow;
    var ag = 58 + feverGlow * 10;
    ctx.drawImage(feverGlow > 0.5 ? glowGold : glowGreen, x - ag, y - ag, ag * 2, ag * 2);
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(x, y); ctx.rotate(lean + wob); ctx.scale(sx, sy);
    if (hurtT > 0 && ((hurtT * 14) | 0) % 2 === 0) ctx.globalAlpha = 0.55;

    var sw = Math.sin(player.bob);
    // ноги
    ctx.lineCap = "round";
    for (var lg = -1; lg <= 1; lg += 2) {
      var ph2 = lg === -1 ? sw : -sw, ly = 31 + ph2 * 4.5 - air * 4;
      ctx.strokeStyle = "#0e2a33"; ctx.lineWidth = 6;
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
    ctx.fillStyle = "#e8fff2";
    ctx.beginPath(); ctx.arc(-26, 4 + sw * 5 - air * 8, 5, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(26, 4 - sw * 5 - air * 8, 5, 0, 6.2832); ctx.fill();

    // тело-щит: фирменный зелёный градиент
    var gr = ctx.createLinearGradient(-22, -28, 22, 28);
    gr.addColorStop(0, "#2bbf4a"); gr.addColorStop(0.55, "#21a038"); gr.addColorStop(1, "#00b49a");
    shieldPath(); ctx.fillStyle = gr; ctx.fill();
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
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- Кнопки / UI ----------
  function setupUI() {
    $("btn-play").addEventListener("click", function () { Sound.ensure(); startRun(); });
    $("btn-again").addEventListener("click", function () { startRun(); });
    $("btn-code").addEventListener("click", function () {
      var box = $("code-box"); box.classList.toggle("hidden");
      if (!box.classList.contains("hidden")) $("code-input").focus();
    });
    $("code-input").addEventListener("input", function () {
      this.value = this.value.replace(/\D/g, "").slice(0, 4); this.classList.remove("err");
    });
    $("btn-code-go").addEventListener("click", function () {
      var v = parseInt($("code-input").value, 10);
      if (!(v >= 1000 && v <= 9999)) { $("code-input").classList.add("err"); return; }
      $("code-input").blur(); Sound.ensure(); startRun(v);
    });
    $("btn-share").addEventListener("click", function () {
      Bridge.share({
        text: "Я разоблачил " + villainsCaught + " из " + villainsTotal + " жуликов в «Не попадись!» 🛡️ " +
          "Пройди мой забег — код " + runCode + ". Сможешь лучше?",
        runCode: runCode
      });
    });
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
    difficulty: { startSpeed: 105, maxSpeed: 300, speedRampPerSec: 1.6, spawnGapStart: 2.4, spawnGapMin: 1.5, spawnGapRampPerSec: 0.008, lives: 3 },
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
