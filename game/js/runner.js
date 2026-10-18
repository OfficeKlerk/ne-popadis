/* Независимая модель бега: дорожки, прыжки, препятствия и собираемые монеты. */
(function (root) {
  "use strict";
  var JUMP_TIME = 0.92, JUMP_HEIGHT = 106, BARRIER_CLEARANCE = 43;
  var HIT_START = 0.985, HIT_END = 1.02, EXIT = 1.07;
  function create(random) {
    random = random || Math.random;
    var course = { obstacles: [], coins: [], time: 0, duration: 10, round: 0, ready: false, jumpTime: -1, jumpHeight: 0, invulnerable: 0, rowsSpawned: 0, objectsSpawned: 0 };
    var nextSpawn = 0, count = 0, travel = 1, gap = 1, rowCount = 5, lastSafeLane = 1, serial = 0;
    function coin(lane, p, height, barrierId, value) {
      var item = { id: serial++, type: "coin", lane: lane, p: p, height: height || 30, airborne: !!height, barrierId: barrierId, value: value || 1, travel: travel, collected: false };
      course.coins.push(item);
      return item;
    }
    function jumpBonus(lane, barrierId) {
      // Одна монета X5 на вершине прыжка, в той же плоскости, что и барьер.
      coin(lane, 0, 34 + JUMP_HEIGHT, barrierId, 5);
    }
    course.begin = function (round, seconds, speedMultiplier) {
      course.obstacles.length = 0; course.coins.length = 0;
      course.time = 0; course.duration = Math.max(10, seconds || 10); course.round = round; course.ready = false;
      course.jumpTime = -1; course.jumpHeight = 0; course.invulnerable = 0;
      course.rowsSpawned = 0; course.objectsSpawned = 0;
      // Та же базовая скорость сближения, ускоренная вместе с дорогой в 1,5 раза.
      travel = Math.max(2.8, 3.5 - round * 0.07) / (speedMultiplier || 1.5);
      rowCount = round === 0 ? 5 : round < 3 ? 7 : 8;
      nextSpawn = 0.55; count = 0; lastSafeLane = 1; serial = 0;
      gap = (course.duration - 0.45 - travel * EXIT - nextSpawn) / (rowCount - 1);
      // Первые монеты видны сразу; до первого препятствия остаётся время для манёвра.
      coin(1, 0.55); coin(1, 0.42); coin(1, 0.29);
    };
    course.jump = function () {
      if (course.jumpTime >= 0 || course.ready) return false;
      course.jumpTime = 0;
      return true;
    };
    function spawnRow() {
      // Монеты подсказывают проходимый маршрут. Между рядами он смещается максимум на одну дорожку.
      var routes = [0, 1, 2].filter(function (lane) { return Math.abs(lane - lastSafeLane) <= 1; });
      if (course.round === 0 && count === 0) routes = [0, 2];
      var safe = routes[Math.floor(random() * routes.length)];
      var blocked = [0, 1, 2].filter(function (lane) { return lane !== safe; });
      var lane = course.round === 0 && count === 0 ? 1 : blocked[Math.floor(random() * blocked.length)];
      // Плотность выше примерно в 1,5 раза: 11 / 17 / 20 объектов за отрезок.
      // Между обязательными прыжками всегда есть обычный ряд для приземления.
      var requiresJump = course.round === 0 ? count === 2 : course.round < 3 ? count >= 2 && count % 2 === 0 : count % 2 === 1;
      var type = requiresJump || count % 2 === 0 ? "barrier" : "crate";
      var row = { id: count, hit: false, jumped: false, safeLane: safe, requiresJump: requiresJump };
      function obstacle(at, kind, secondary) {
        course.obstacles.push({ lane: at, type: kind, row: row, p: 0, checked: false, hit: false, jumped: false, travel: travel, noReward: !!secondary });
        course.objectsSpawned++;
      }
      if (requiresJump) lane = safe;
      obstacle(lane, type, false);
      if (requiresJump) {
        obstacle(blocked[0], "crate", true);
        obstacle(blocked[1], "crate", true);
      } else {
        var second = blocked[0] === lane ? blocked[1] : blocked[0];
        obstacle(second, type === "barrier" ? "crate" : "barrier", true);
      }
      if (!requiresJump) for (var c = 0; c < 4; c++) coin(safe, 0.25 - c * 0.1).rowId = count;
      // Поздние участки оставляют промежуточные ряды без бонусного прыжка.
      if (requiresJump || (course.round < 3 && type === "barrier" && (Math.floor(count / 2) + course.round) % 2 === 0)) jumpBonus(lane, count);
      lastSafeLane = safe; count++; course.rowsSpawned = count; nextSpawn += gap;
    }
    course.update = function (dt, playerLane, playerRadius) {
      var events = [];
      course.time += dt;
      course.invulnerable = Math.max(0, course.invulnerable - dt);
      if (course.jumpTime >= 0) {
        course.jumpTime += dt;
        var t = Math.min(1, course.jumpTime / JUMP_TIME);
        course.jumpHeight = 4 * JUMP_HEIGHT * t * (1 - t);
        if (t === 1) { course.jumpTime = -1; course.jumpHeight = 0; events.push({ type: "land" }); }
      }
      if (count < rowCount && course.time >= nextSpawn) spawnRow();
      for (var i = course.obstacles.length - 1; i >= 0; i--) {
        var o = course.obstacles[i], old = o.p;
        o.p += dt / o.travel;
        if (!o.checked && o.p >= HIT_START) {
          var overlap = Math.abs(playerLane - o.lane) < 0.29 + (playerRadius || 0.18);
          var clears = o.type === "barrier" && course.jumpHeight >= BARRIER_CLEARANCE;
          // Проверяется пересечение интервала глубины, чтобы на редком кадре не проскочить объект.
          if (old <= HIT_END && overlap) {
            if (clears) { o.jumped = true; o.row.jumped = true; }
            else {
              o.hit = true; o.row.hit = true; o.checked = true;
              if (course.invulnerable === 0) {
                events.push({ type: "hit", obstacle: o });
                course.invulnerable = 0.75;
              }
            }
          }
          if (o.p > HIT_END) {
            o.checked = true;
            if (!o.row.hit && !o.noReward) events.push({ type: "clear", jumped: o.row.jumped, obstacle: o });
          }
        }
        if (o.p > EXIT) course.obstacles.splice(i, 1);
      }
      for (i = course.coins.length - 1; i >= 0; i--) {
        var c = course.coins[i], before = c.p;
        c.p += dt / c.travel;
        if (before <= HIT_END && c.p >= HIT_START && Math.abs(playerLane - c.lane) < 0.36 && Math.abs(course.jumpHeight + 34 - c.height) < 43) {
          c.collected = true;
          events.push({ type: "coin", coin: c });
          course.coins.splice(i, 1);
        } else if (c.p > EXIT) course.coins.splice(i, 1);
      }
      course.ready = course.time >= course.duration && course.obstacles.length === 0 && course.coins.length === 0 && course.jumpTime < 0;
      return events;
    };
    return course;
  }
  var api = { create: create, jumpTime: JUMP_TIME, jumpHeight: JUMP_HEIGHT, barrierClearance: BARRIER_CLEARANCE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RunnerCourse = api;
})(typeof window !== "undefined" ? window : this);
