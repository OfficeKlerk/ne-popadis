// Синхронизирует game/content.js с game/content.json.
// content.json — основной источник (грузится через fetch, меняется через CMS без релиза);
// content.js — копия для запуска двойным кликом (file://), где fetch заблокирован браузером.
// Запуск после правки content.json:  node tools/sync-content.js
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "game");
const data = JSON.parse(fs.readFileSync(path.join(dir, "content.json"), "utf8"));
const out = "/* Сгенерировано tools/sync-content.js из content.json — не править вручную. */\n" +
  "window.GAME_CONTENT = " + JSON.stringify(data) + ";\n";
fs.writeFileSync(path.join(dir, "content.js"), out, "utf8");
console.log("content.js обновлён: " + data.situations.length + " карточек");
