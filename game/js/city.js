/* Живой квартал: процедурные Canvas-фасады, витрины, жители и коты. */
(function () {
  "use strict";
  var COLORS = [
    { front: "#f1f5ff", side: "#cad9ef", roof: "#a7bfde", accent: "#7350ff" },
    { front: "#fae8f0", side: "#e1c7e2", roof: "#c39fc6", accent: "#ff85a2" },
    { front: "#ecfaed", side: "#b5d9c7", roof: "#a1c5ad", accent: "#f6bd43" },
    { front: "#fff1d9", side: "#e7d4b1", roof: "#d2b786", accent: "#6faef4" }
  ];
  function seeded(a) { var x = Math.sin(a * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function rect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function quad(ctx, a, b, c, d, fill) {
    ctx.fillStyle=fill; ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.lineTo(c[0],c[1]);ctx.lineTo(d[0],d[1]);ctx.closePath();ctx.fill();
  }
  // Original human characters: eight friendly reactions, one occupied house in three.
  var REACTIONS = ["67", "Даб!", "Ну как?", "Ой!", "Лайк!", "Лови ♥", "Бип-буп", "Круто!"];
  function hasResident(id) { return ((id % 3) + 3) % 3 === 0; }
  function residentKind(id) { return ((Math.floor(id / 3) % REACTIONS.length) + REACTIONS.length) % REACTIONS.length; }
  function resident(ctx, x, sillY, scale, id, view, bubble, layer) {
    var kind = residentKind(id);
    var rhythm = view.reduced ? .45 : Math.sin(view.time * 5.4 + id * 1.7);
    var lean = view.reduced ? 0 : Math.sin(view.time * 2.7 + id) * 1.8;
    var lift = view.reduced ? 11 : 11 + Math.min(1, view.cheer || 0) * 2;
    var shirt = ["#ffca67", "#78e3c1", "#d3adff", "#93c9ff", "#ff9cac", "#afe386", "#ffd283", "#b8bcff"][kind];
    var skin = ["#edb68e", "#bd805c", "#f4cfab"][Math.abs(id) % 3];
    ctx.save(); ctx.translate(x, sillY); ctx.scale(scale, scale);
    ctx.translate(lean, -2);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (layer === "inside") {
      // Тело и плечи рисуются внутри проёма; нижняя часть скрыта стеной и подоконником.
      ctx.fillStyle = "#050f1c66"; ctx.beginPath(); ctx.ellipse(1, -25, 23, 38, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#203c43"; ctx.lineWidth = 2;
      var torsoShade = ctx.createLinearGradient(0,-28,0,24);
      torsoShade.addColorStop(0,shirt); torsoShade.addColorStop(.45,shirt); torsoShade.addColorStop(1,"#102b35");
      ctx.fillStyle = torsoShade; rect(ctx, -14, -30, 28, 58, 10); ctx.fill();
      ctx.beginPath();ctx.moveTo(-14,-8);ctx.lineTo(-14,-20);ctx.quadraticCurveTo(-14,-30,-4,-30);ctx.lineTo(4,-30);ctx.quadraticCurveTo(14,-30,14,-20);ctx.lineTo(14,-8);ctx.stroke();
      ctx.fillStyle = skin; rect(ctx, -5, -38, 10, 12, 3); ctx.fill();
      ctx.fillStyle = "#ffffff66"; ctx.fillRect(-6, -18, 12, 4);
      for (var arm = -1; arm <= 1; arm += 2) {
        ctx.strokeStyle = "#203c43"; ctx.lineWidth = 10;
        ctx.beginPath(); ctx.moveTo(arm*11, -25); ctx.lineTo(arm*23, -28); ctx.stroke();
        ctx.strokeStyle = shirt; ctx.lineWidth = 7; ctx.stroke();
      }
      ctx.restore(); return;
    }
    // Hands stay anchored to shoulders; poses never detach the torso from the room.
    function hands() {
      for (var hand = -1; hand <= 1; hand += 2) {
        var palmX = hand * 35, palmY = -39 + rhythm * hand * lift, palmTilt = hand * -.12;
        if (kind === 1) { palmX = hand < 0 ? 8 : 40; palmY = hand < 0 ? -44 : -61 + rhythm*3; }
        if (kind === 2) { palmY = -43 + rhythm*2; }
        if (kind === 3) { palmX = hand > 0 ? 2 : -30; palmY = hand > 0 ? -49 + rhythm*2 : -20; palmTilt = hand > 0 ? -1 : 0; }
        if (kind === 4) { palmX = hand*31; palmY = hand > 0 ? -45 + rhythm*3 : -22; palmTilt = hand > 0 ? 1.4 : 0; }
        if (kind === 5) { palmX = hand*6; palmY = -22 + rhythm; palmTilt = -hand*.65; }
        if (kind === 6) { palmX = hand*37; palmY = -33 + rhythm*hand*16; palmTilt = hand*1.4; }
        if (kind === 7) { palmX = hand*30; palmY = -24 + rhythm*2; }
        ctx.strokeStyle = "#203c43"; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(hand*23,-28);
        if (kind === 6) ctx.lineTo(hand*23,palmY);
        ctx.lineTo(palmX,palmY+3); ctx.stroke();
        ctx.strokeStyle = skin; ctx.lineWidth = 5; ctx.stroke();
        ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(palmX,palmY,kind===3?8:9,4,palmTilt,0,Math.PI*2); ctx.fill();
        ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(palmX-hand*5,palmY);
        ctx.lineTo(palmX-hand*7,palmY-(kind===4&&hand>0?13:4)); ctx.stroke();
      }
    }
    if (kind !== 1 && kind !== 3 && kind !== 5) hands();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, -43, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#203c43"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#403039"; ctx.beginPath(); ctx.arc(0, -46, 14, Math.PI, Math.PI * 2); ctx.lineTo(12, -45); ctx.quadraticCurveTo(5, -47, 2, -52); ctx.quadraticCurveTo(-3, -45, -13, -46); ctx.fill();
    ctx.fillStyle = "#fff9e8";
    ctx.beginPath(); ctx.ellipse(-5, -43, 3.5, 4.5, 0, 0, Math.PI * 2); ctx.ellipse(5, -43, 3.5, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#27343b"; ctx.beginPath(); ctx.arc(-4, -42, 1.9, 0, Math.PI * 2); ctx.arc(6, -42, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#773f34"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(1, -38, 4, .1, Math.PI - .1); ctx.stroke();
    ctx.fillStyle = "#e58f7866"; ctx.beginPath(); ctx.ellipse(-9, -37, 3, 2, 0, 0, Math.PI * 2); ctx.ellipse(10, -37, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
    if (kind === 7) {
      ctx.fillStyle="#302758"; rect(ctx,-12,-49,11,9,3);ctx.fill();rect(ctx,1,-49,11,9,3);ctx.fill();
      ctx.strokeStyle="#302758";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-2,-46);ctx.lineTo(2,-46);ctx.stroke();
      ctx.strokeStyle="#fff";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-9,-46);ctx.lineTo(-6,-44);ctx.moveTo(4,-46);ctx.lineTo(7,-44);ctx.stroke();
    }
    if (kind === 2) { ctx.strokeStyle="#403039";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-9,-51);ctx.lineTo(-3,-53);ctx.moveTo(3,-53);ctx.lineTo(9,-51);ctx.stroke(); }
    if (kind === 1 || kind === 3 || kind === 5) hands();
    if (kind === 5) {
      ctx.fillStyle="#f26d91";ctx.beginPath();ctx.moveTo(0,-16);ctx.bezierCurveTo(-17,-25,-4,-35,0,-27);ctx.bezierCurveTo(4,-35,17,-25,0,-16);ctx.fill();
    }
    if (bubble) {
      var bob = view.reduced ? 0 : Math.sin(view.time * 2.7 + id) * 2;
      ctx.globalAlpha = bubble;
      ctx.translate(0, bob);
      var bubbleWidth = Math.max(58, REACTIONS[kind].length * 9 + 18);
      ctx.fillStyle = "#061d2866"; rect(ctx, -bubbleWidth/2+2, -103, bubbleWidth, 34, 12); ctx.fill();
      ctx.fillStyle = "#fff3ce"; ctx.strokeStyle = "#d5b56c"; ctx.lineWidth = 1.5;
      rect(ctx, -bubbleWidth/2, -106, bubbleWidth, 34, 12); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-7, -73); ctx.lineTo(-3, -65); ctx.lineTo(6, -73); ctx.fill();
      ctx.fillStyle = "#163d43"; ctx.font = "900 " + (kind === 0 ? 26 : 16) + "px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(REACTIONS[kind], 0, -88);
    }
    ctx.restore();
  }
  function cat(ctx,x,y,s,time,id,reduced) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ctx.strokeStyle="#e4be82";ctx.lineWidth=3;ctx.lineCap="round";
    ctx.beginPath();ctx.moveTo(5,4);ctx.quadraticCurveTo(18,9,16+(reduced?0:Math.sin(time*2+id)*3),-6);ctx.stroke();
    ctx.fillStyle="#e4be82";ctx.beginPath();ctx.ellipse(0,4,8,6,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(-7,-1);ctx.lineTo(-8,-12);ctx.lineTo(-2,-8);ctx.lineTo(3,-8);ctx.lineTo(8,-12);ctx.lineTo(7,-1);ctx.closePath();ctx.fill();
    ctx.fillStyle="#183b3d";var eye=!reduced&&(time+id)%4<.15?1:2.5;ctx.fillRect(-4,-5,2,eye);ctx.fillRect(3,-5,2,eye);
    ctx.restore();
  }
  function shopIcon(ctx, type, x, y, s) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.strokeStyle="#f7e7ba";ctx.fillStyle="#f7e7ba";ctx.lineWidth=2;
    if(type===0){ // книжная лавка
      ctx.beginPath();ctx.moveTo(0,8);ctx.lineTo(-10,5);ctx.lineTo(-10,-8);ctx.lineTo(0,-5);ctx.lineTo(10,-8);ctx.lineTo(10,5);ctx.closePath();ctx.stroke();ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(0,8);ctx.stroke();
    }else if(type===1){ // мороженое
      ctx.fillStyle="#e9bf70";ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(6,0);ctx.lineTo(0,12);ctx.closePath();ctx.fill();ctx.fillStyle="#eeadad";ctx.beginPath();ctx.arc(0,-4,8,Math.PI,0);ctx.lineTo(8,0);ctx.lineTo(-8,0);ctx.fill();
    }else{ // цветы
      ctx.strokeStyle="#a0d5a7";ctx.beginPath();ctx.moveTo(0,10);ctx.lineTo(0,-5);ctx.stroke();ctx.fillStyle="#f4c86c";for(var i=0;i<5;i++){var a=i*Math.PI*2/5;ctx.beginPath();ctx.arc(Math.cos(a)*5,-5+Math.sin(a)*5,3.5,0,Math.PI*2);ctx.fill();}ctx.fillStyle="#d7877d";ctx.beginPath();ctx.arc(0,-5,3,0,Math.PI*2);ctx.fill();
    }ctx.restore();
  }
  var HOUSE_DEPTH = .235, HOUSE_SPACING = .27;
  function nearPlane(view) { return 1 + (1 - .32) / view.perspective; }
  function scaleAt(view, p) { return 1 / (1 + (1 - p) * view.perspective); }
  function project(view, point) {
    var r = scaleAt(view, point[2]);
    return [view.sxAt(point[0], r), view.yOf(r) + (36 - point[1]) * r];
  }
  // Отсекаем геометрию у камеры, а не весь дом по передней грани.
  // Его задняя часть остаётся на экране и продолжает проходить мимо игрока.
  function clipNear(points, limit) {
    var clipped = [], a = points[points.length - 1];
    for (var i = 0; i < points.length; i++) {
      var b = points[i], insideA = a[2] <= limit, insideB = b[2] <= limit;
      if (insideA !== insideB) {
        var t = (limit - a[2]) / (b[2] - a[2]);
        clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, limit]);
      }
      if (insideB) clipped.push(b);
      a = b;
    }
    return clipped;
  }
  function polygonPath(ctx, view, points) {
    var clipped = clipNear(points, nearPlane(view));
    if (clipped.length < 3) return false;
    ctx.beginPath();
    for (var i = 0; i < clipped.length; i++) {
      var pt = project(view, clipped[i]);
      if (i === 0) ctx.moveTo(pt[0], pt[1]); else ctx.lineTo(pt[0], pt[1]);
    }
    ctx.closePath(); return true;
  }
  function polygon(ctx, view, points, fill) {
    if (polygonPath(ctx, view, points)) { ctx.fillStyle = fill; ctx.fill(); }
  }
  function buildings(view) {
    var travel = view.scroll / (view.height * .8) * .38;
    var result = [];
    for (var side = -1; side <= 1; side += 2) {
      var offset = side < 0 ? -.05 : -.13;
      var first = Math.ceil((-.22 - travel - offset) / HOUSE_SPACING);
      var last = Math.floor((nearPlane(view) + HOUSE_DEPTH - travel - offset) / HOUSE_SPACING);
      for (var index = first; index <= last; index++) {
        result.push({ side: side, p: index * HOUSE_SPACING + travel + offset, id: index * 2 + (side > 0 ? 1 : 0) + 80 });
      }
    }
    // Один мировой номер на весь путь: при смене квартала окна/цвета не перескакивают.
    return result.sort(function(a, b) { return a.p - b.p; });
  }
  function house(ctx, view, building) {
    var side = building.side, p = building.p, id = building.id;
    var depth = HOUSE_DEPTH, width = 146, height = 328 + seeded(id + 3) * 62;
    var inner = view.width / 2 + side * (view.roadWidth / 2 + 29), outer = inner + side * width;
    var backP = p - depth, palette = COLORS[((id % 4) + 4) % 4];
    function wallPoints(u0, u1, low, high) {
      return [[inner, low, p-u0*depth], [inner, low, p-u1*depth], [inner, high, p-u1*depth], [inner, high, p-u0*depth]];
    }
    function wall(u0, u1, low, high, fill) { polygon(ctx, view, wallPoints(u0,u1,low,high), fill); }
    polygon(ctx, view, [[inner, height, p], [inner, height, backP], [outer, height, backP], [outer, height, p]], palette.roof);
    wall(0, 1, 0, height, palette.side);
    wall(0, 1, height-7, height, palette.accent);
    wall(0, 1, 0, 10, "#afc3db");
    // Этажи, окна и витрины имеют собственную глубину, как стены.
    for (var floor = 0; floor < 3; floor++) {
      var low = 91 + floor * 77;
      wall(0, 1, low-10, low-7, "#ffffff0d");
      if (floor === 1) continue; // Здесь одно открытое окно, без старых рам под ним.
      for (var column = 0; column < 2; column++) {
        var u0 = .08 + column * .48, u1 = u0 + .34;
        var warm = seeded(id * 13 + floor * 2 + column) > .25;
        wall(u0-.015, u1+.015, low-3, low+57, "#9badce");
        wall(u0, u1, low, low+54, warm ? "#c4e9ff" : "#a5c8ec");
        wall(u0+.15, u0+.17, low, low+54, palette.roof);
        wall(u0-.03, u1+.03, low-6, low, palette.roof);
      }
    }
    // Одно открытое окно: тёмная комната, откосы и раздвинутые занавески.
    var sill = 155, characterP = p - depth * .35;
    var opening = wallPoints(.22,.60,sill,sill+83);
    wall(.185, .635, sill-6, sill+90, "#102832");
    wall(.20, .62, sill-2, sill+87, "#f9fbff");
    polygon(ctx, view, opening, "#102b35");
    wall(.22, .60, sill+64, sill+83, "#f0bf6914");
    wall(.22, .26, sill, sill+83, "#ad7257");
    wall(.56, .60, sill, sill+83, "#ad7257");
    wall(.235, .245, sill, sill+83, "#e2ae76");
    wall(.575, .585, sill, sill+83, "#e2ae76");
    wall(.22, .60, sill+78, sill+83, "#081d28");
    if (!hasResident(id)) {
      polygon(ctx, view, opening, "#c4e7fc");
      wall(.405, .425, sill, sill+83, "#f9fbff");
      wall(.22, .60, sill+39, sill+43, "#f9fbff");
      wall(.245, .28, sill+7, sill+75, "#ffffff66");
    }
    // Передняя грань проходит за пределы кадра; после near plane остаётся боковая стена.
    if (p <= nearPlane(view)) {
      var r = scaleAt(view, p), a = project(view, [inner, 0, p]), b = project(view, [outer, height, p]);
      var left = Math.min(a[0], b[0]), y = a[1], top = b[1], fw = width * r;
      ctx.fillStyle = palette.front; ctx.fillRect(left, top, fw, height*r);
      ctx.fillStyle = palette.accent; ctx.fillRect(left-3*r, top, fw+6*r, 7*r);
      if (r > .17) {
        for (var row = 0; row < 3; row++) for (var col = 0; col < 2; col++) {
          var wx = left + (15 + col*65)*r, wy = top + (25 + row*77)*r, ww = 45*r, wh = 53*r;
          var lit = seeded(id*19 + row*3 + col) > .23;
          var glow = view.reduced ? .84 : .80 + .07*Math.sin(view.time*.65 + id+row+col);
          ctx.fillStyle = "#8ea4cb"; rect(ctx, wx-3*r, wy-3*r, ww+6*r, wh+6*r, 3*r); ctx.fill();
          ctx.fillStyle = lit ? "rgba(255,229,172,"+glow+")" : "#afd6f2"; ctx.fillRect(wx, wy, ww, wh);
          ctx.fillStyle = lit ? "#b27b4e77" : "#62818944"; ctx.fillRect(wx,wy,6*r,wh); ctx.fillRect(wx+ww-6*r,wy,6*r,wh);
          if (row === 1 && col === (Math.abs(id)%2)) {
            cat(ctx,wx+ww*.5,wy+wh-12*r,1.55*r,view.time,id,view.reduced);
          } else {
            ctx.fillStyle = palette.roof; ctx.fillRect(wx+ww/2-r,wy,2*r,wh);
          }
          ctx.fillStyle = palette.roof; ctx.fillRect(wx-4*r,wy+wh,ww+8*r,5*r);
          if (row === 2 && col === 0) {
            ctx.fillStyle="#b77759";ctx.fillRect(wx+9*r,wy+wh-8*r,25*r,8*r);ctx.fillStyle="#8ac78a";
            for(var leaf=0;leaf<3;leaf++){ctx.beginPath();ctx.ellipse(wx+(13+leaf*7)*r,wy+wh-10*r,4*r,7*r,leaf-1,0,Math.PI*2);ctx.fill();}
          }
        }
        var sy = y-66*r;
        ctx.fillStyle = "#9bbddd";ctx.fillRect(left+10*r,sy,fw-20*r,57*r);
        ctx.fillStyle = "#ffffff77";ctx.fillRect(left+16*r,sy+6*r,fw-32*r,43*r);
        for (var k=0;k<8;k++){ctx.fillStyle=k%2?"#e7ddb9":palette.accent;ctx.fillRect(left+(5+k*17)*r,sy-9*r,17*r,13*r);}
        ctx.fillStyle=palette.side;rect(ctx,left+49*r,sy+5*r,48*r,36*r,6*r);ctx.fill();
        shopIcon(ctx,Math.abs(id)%3,left+73*r,sy+24*r,1.1*r);
      }
    }
    function sillLedge() {
      var ledge = inner - side*9, nearP = p-.185*depth, farP = p-.635*depth;
      // Толщина и верхняя плоскость подоконника дают читаемую глубину.
      polygon(ctx,view,[[ledge,sill-7,nearP],[ledge,sill-7,farP],[ledge,sill+1,farP],[ledge,sill+1,nearP]],palette.roof);
      polygon(ctx,view,[[inner,sill+1,nearP],[inner,sill+1,farP],[ledge,sill+1,farP],[ledge,sill+1,nearP]],"#ffffff");
    }
    sillLedge();
    if (hasResident(id) && characterP <= nearPlane(view)) {
      var cr = scaleAt(view, characterP), anchor = project(view, [inner, sill+8, characterP]);
      if (cr > .27 && anchor[0] > -70*cr && anchor[0] < view.width+70*cr) {
        ctx.save();ctx.globalAlpha = Math.min(1, (cr-.27)/.12);
        ctx.save();
        if (polygonPath(ctx,view,opening)) {
          ctx.clip();
          resident(ctx, anchor[0], anchor[1], cr*1.13, id, view, 0, "inside");
        }
        ctx.restore();
        // Стена и подоконник закрывают торс, а голова и ладони находятся перед рамой.
        sillLedge();
        resident(ctx, anchor[0], anchor[1], cr*1.13, id, view, Math.max(0,Math.min(1,(cr-.38)/.10)), "outside");
        ctx.restore();
      }
    }

  }
  function draw(ctx, view) {
    var street = buildings(view);
    ctx.save();ctx.beginPath();ctx.rect(0,0,view.width,view.height);ctx.clip();
    for (var i=0; i<street.length; i++) house(ctx, view, street[i]);
    ctx.restore();
    var time=view.reduced?0:view.time, x=view.width*.77+Math.sin(time*.33)*9, y=view.height*.17+Math.sin(time*.7)*5;
    ctx.strokeStyle="#d8d5a34d";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y+10);ctx.quadraticCurveTo(x-20,y+30,x-7,y+49);ctx.stroke();
    quad(ctx,[x,y-11],[x+8,y],[x,y+12],[x-8,y],"#f2c76e");
    quad(ctx,[x,y-11],[x,y+12],[x-8,y],[x,y-11],"#6ccfb3");
  }
  var api = {draw:draw, buildings:buildings, project:project, clipNear:clipNear, reactions:REACTIONS, hasResident:hasResident, residentKind:residentKind};
  if (typeof module === "object" && module.exports) module.exports = api;
  else window.GameCity = api;
})();
