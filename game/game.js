// The Midnight Vault — top-down stealth heist game.
// Plain canvas 2D, no libraries, no build step, no network requests.
// Core simulation is DOM-free so it can be driven from Node for testing;
// rendering / input / audio only run in the browser.

var TILE = 40;
var COLS = 32;
var ROWS = 16;
var VIEW_W = 1280;
var VIEW_H = 720;
var HUD_H = 64;
var MAP_W = COLS * TILE; // 1280
var MAP_H = ROWS * TILE; // 640
var MAP_Y = HUD_H; // map starts below the HUD

var VAULT_VALUE = 5000;
var CRACK_TIME = 3.0; // seconds holding E at the vault
var LOCKDOWN_TIME = 20; // seconds once the alarm hits 100
var GHOST_BONUS = 500; // score bonus if the alarm never passes 25
var TOOL_COST = { smoke: 25, emp: 50, lockpick: 100 };

var LEVELS_REF = null;
if (typeof require !== "undefined") {
  LEVELS_REF = require("./levels.js").LEVELS;
} else if (typeof LEVELS !== "undefined") {
  LEVELS_REF = LEVELS;
}

function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tileCenter(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: MAP_Y + ty * TILE + TILE / 2 };
}

function isWall(walls, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
  return walls[ty][tx];
}

function parseLevel(def) {
  var walls = [];
  var playerStart = null;
  var vault = null;
  var exit = null;
  for (var y = 0; y < ROWS; y++) {
    var row = def.map[y];
    var wrow = [];
    for (var x = 0; x < COLS; x++) {
      var c = row[x];
      wrow.push(c === "#");
      if (c === "P") playerStart = tileCenter(x, y);
      if (c === "V") vault = tileCenter(x, y);
      if (c === "E") exit = tileCenter(x, y);
    }
    walls.push(wrow);
  }
  return { walls: walls, playerStart: playerStart, vault: vault, exit: exit };
}

function losClear(walls, x0, y0, x1, y1) {
  var dx = x1 - x0;
  var dy = y1 - y0;
  var dist = Math.sqrt(dx * dx + dy * dy);
  var steps = Math.max(1, Math.ceil(dist / 6));
  for (var i = 1; i < steps; i++) {
    var t = i / steps;
    var px = x0 + dx * t;
    var py = y0 + dy * t;
    var tx = Math.floor(px / TILE);
    var ty = Math.floor((py - MAP_Y) / TILE);
    if (isWall(walls, tx, ty)) return false;
  }
  return true;
}

function angleDiff(a, b) {
  var d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

// Can an observer at (ox,oy) facing `angle` with field of view `fov` and
// range `range` see the target at (tx,ty)? Walls block sight; smoke hides.
function canSee(state, ox, oy, angle, fov, range, tx, ty) {
  var dx = tx - ox;
  var dy = ty - oy;
  var dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > range) return false;
  if (dist > 1 && angleDiff(Math.atan2(dy, dx), angle) > fov / 2) return false;
  if (!losClear(state.walls, ox, oy, tx, ty)) return false;
  for (var i = 0; i < state.smokes.length; i++) {
    var s = state.smokes[i];
    var sdx = tx - s.x;
    var sdy = ty - s.y;
    if (Math.sqrt(sdx * sdx + sdy * sdy) < 80) return false;
  }
  return true;
}

// Breadth-first pathfinding on the tile grid. Returns a list of pixel
// waypoints (tile centers) from start to target, or null if unreachable.
function findPath(walls, sx, sy, tx, ty) {
  if (isWall(walls, tx, ty)) return null;
  var key = function (x, y) { return x + "," + y; };
  var prev = {};
  var queue = [[sx, sy]];
  prev[key(sx, sy)] = null;
  var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (queue.length > 0) {
    var cur = queue.shift();
    if (cur[0] === tx && cur[1] === ty) {
      var path = [];
      var node = cur;
      while (node) {
        var c = tileCenter(node[0], node[1]);
        path.unshift(c);
        node = prev[key(node[0], node[1])];
      }
      return path;
    }
    for (var i = 0; i < dirs.length; i++) {
      var nx = cur[0] + dirs[i][0];
      var ny = cur[1] + dirs[i][1];
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (isWall(walls, nx, ny)) continue;
      var k = key(nx, ny);
      if (k in prev) continue;
      prev[k] = cur;
      queue.push([nx, ny]);
    }
  }
  return null;
}

function createGame(levelIndex, seed) {
  var def = LEVELS_REF[levelIndex];
  var parsed = parseLevel(def);
  var rng = mulberry32(seed || 1);
  var guards = def.guards.map(function (g) {
    var wps = g.waypoints.map(function (w) { return tileCenter(w[0], w[1]); });
    return {
      x: wps[0].x, y: wps[0].y, waypoints: wps, wpIndex: 1, dir: 1,
      speed: g.speed, alerted: false, loseSight: 0, angle: 0
    };
  });
  var cameras = def.cameras.map(function (c) {
    var p = tileCenter(c.tx, c.ty);
    return {
      x: p.x, y: p.y, baseAngle: c.baseAngle, sweep: c.sweep,
      speed: c.speed, angle: c.baseAngle, disabledUntil: 0, spotting: false
    };
  });
  var loot = def.loot.map(function (l) {
    var p = tileCenter(l.tx, l.ty);
    return { x: p.x, y: p.y, name: l.name, value: l.value, taken: false };
  });
  return {
    levelIndex: levelIndex,
    levelName: def.name,
    levelIntro: def.intro,
    seed: seed || 1,
    rng: rng,
    time: 0,
    status: "title",
    walls: parsed.walls,
    player: {
      x: parsed.playerStart.x, y: parsed.playerStart.y,
      dir: 0, sneaking: false, path: [], pathIndex: 0, moving: false
    },
    guards: guards,
    cameras: cameras,
    loot: loot,
    vault: { x: parsed.vault.x, y: parsed.vault.y, cracked: false, progress: 0 },
    exit: { x: parsed.exit.x, y: parsed.exit.y },
    alarm: 0,
    maxAlarm: 0,
    lockdown: 0,
    tools: { smoke: 3, emp: 2, lockpick: 1 },
    smokes: [],
    empUntil: 0,
    lootValue: 0,
    toolCost: 0,
    ghost: true,
    message: "",
    messageUntil: 0,
    wonAt: 0,
    seenBy: null
  };
}

function timeBonus(state) {
  return Math.max(0, 600 - Math.floor(state.time) * 2);
}

function getTake(state) {
  var vault = state.vault.cracked ? VAULT_VALUE : 0;
  var loot = state.lootValue;
  var bonus = timeBonus(state);
  return {
    vault: vault,
    loot: loot,
    timeBonus: bonus,
    ghostBonus: state.ghost ? GHOST_BONUS : 0,
    total: vault + loot + bonus
  };
}

// ---- movement / collision ----

function circleHitsWall(walls, x, y, r) {
  var x0 = Math.floor((x - r) / TILE);
  var x1 = Math.floor((x + r) / TILE);
  var y0 = Math.floor((y - MAP_Y - r) / TILE);
  var y1 = Math.floor((y - MAP_Y + r) / TILE);
  for (var ty = y0; ty <= y1; ty++) {
    for (var tx = x0; tx <= x1; tx++) {
      if (isWall(walls, tx, ty)) {
        var cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
        var cy = Math.max(MAP_Y + ty * TILE, Math.min(y, MAP_Y + ty * TILE + TILE));
        var ddx = x - cx;
        var ddy = y - cy;
        if (ddx * ddx + ddy * ddy < r * r) return true;
      }
    }
  }
  return false;
}

function collideMove(state, e, dx, dy, r) {
  var nx = e.x + dx;
  if (!circleHitsWall(state.walls, nx, e.y, r)) e.x = nx;
  var ny = e.y + dy;
  if (!circleHitsWall(state.walls, e.x, ny, r)) e.y = ny;
}

function dist(ax, ay, bx, by) {
  var dx = ax - bx;
  var dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---- tools ----

function useTool(state, name) {
  if (state.status !== "playing") return false;
  var p = state.player;
  if (name === "smoke") {
    if (state.tools.smoke <= 0) return false;
    state.tools.smoke--;
    state.smokes.push({ x: p.x, y: p.y, until: state.time + 5 });
    state.toolCost += TOOL_COST.smoke;
    state.message = "Smoke out — 5s of cover";
    state.messageUntil = state.time + 2;
    return true;
  }
  if (name === "emp") {
    if (state.tools.emp <= 0) return false;
    state.tools.emp--;
    state.empUntil = state.time + 8;
    state.toolCost += TOOL_COST.emp;
    state.message = "EMP blast — cameras down 8s";
    state.messageUntil = state.time + 2;
    return true;
  }
  if (name === "lockpick") {
    if (state.tools.lockpick <= 0) return false;
    if (state.vault.cracked) return false;
    if (dist(p.x, p.y, state.vault.x, state.vault.y) > 56) return false;
    state.tools.lockpick--;
    state.vault.cracked = true;
    state.vault.progress = 1;
    state.toolCost += TOOL_COST.lockpick;
    state.message = "Lockpick — vault cracked instantly! $5,000";
    state.messageUntil = state.time + 3;
    return true;
  }
  return false;
}

// ---- main update ----

function stepGame(state, input, dt) {
  if (state.status !== "playing") return;
  if (dt > 0.1) dt = 0.1;
  state.time += dt;
  state.smokes = state.smokes.filter(function (s) { return s.until > state.time; });
  if (state.time > state.messageUntil) state.message = "";

  var p = state.player;
  var speed = p.sneaking || input.sneak ? 85 : 165;
  var kx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  var ky = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (kx !== 0 || ky !== 0) {
    p.path = [];
    p.moving = false;
    var len = Math.sqrt(kx * kx + ky * ky);
    var mx = (kx / len) * speed * dt;
    var my = (ky / len) * speed * dt;
    collideMove(state, p, mx, my, 14);
    p.dir = Math.atan2(my, mx);
    p.moving = true;
  } else if (p.path.length > 0 && p.pathIndex < p.path.length) {
    var target = p.path[p.pathIndex];
    var tdx = target.x - p.x;
    var tdy = target.y - p.y;
    var tdist = Math.sqrt(tdx * tdx + tdy * tdy);
    if (tdist < 6) {
      p.pathIndex++;
      if (p.pathIndex >= p.path.length) {
        p.path = [];
        p.moving = false;
      }
    } else {
      var step = Math.min(tdist, speed * dt);
      collideMove(state, p, (tdx / tdist) * step, (tdy / tdist) * step, 14);
      p.dir = Math.atan2(tdy, tdx);
      p.moving = true;
    }
  } else {
    p.moving = false;
  }
  p.sneaking = !!input.sneak;

  // Vault cracking.
  var vaultDist = dist(p.x, p.y, state.vault.x, state.vault.y);
  if (!state.vault.cracked) {
    if (input.crack && vaultDist < 56) {
      state.vault.progress += dt / CRACK_TIME;
      if (state.vault.progress >= 1) {
        state.vault.progress = 1;
        state.vault.cracked = true;
        state.message = "Vault cracked! $5,000 — get to the green door";
        state.messageUntil = state.time + 3;
      }
    } else {
      state.vault.progress = Math.max(0, state.vault.progress - dt * 0.2);
    }
  }

  // Loot pickup.
  for (var li = 0; li < state.loot.length; li++) {
    var l = state.loot[li];
    if (!l.taken && dist(p.x, p.y, l.x, l.y) < 26) {
      l.taken = true;
      state.lootValue += l.value;
      state.message = "Picked up " + l.name + " +$" + l.value;
      state.messageUntil = state.time + 2;
    }
  }

  // Exit — only after the vault is cracked.
  if (state.vault.cracked && dist(p.x, p.y, state.exit.x, state.exit.y) < 32) {
    state.status = "won";
    state.wonAt = state.time;
    return;
  }

  // Guards.
  var seen = false;
  var lockdownBoost = state.lockdown > 0 ? 1.4 : 1;
  for (var gi = 0; gi < state.guards.length; gi++) {
    var g = state.guards[gi];
    var gSees = canSee(state, g.x, g.y, g.angle, 1.22, 170, p.x, p.y);
    if (gSees) {
      g.alerted = true;
      g.loseSight = 0;
      seen = true;
      state.seenBy = "guard";
      state.alarm += 30 * dt;
      var cdx = p.x - g.x;
      var cdy = p.y - g.y;
      var cd = Math.sqrt(cdx * cdx + cdy * cdy);
      if (cd > 1) {
        collideMove(state, g, (cdx / cd) * 130 * lockdownBoost * dt, (cdy / cd) * 130 * lockdownBoost * dt, 14);
        g.angle = Math.atan2(cdy, cdx);
      }
      if (cd < 16) {
        state.status = "caught";
        return;
      }
    } else {
      if (g.alerted) {
        g.loseSight += dt;
        if (g.loseSight > 3) g.alerted = false;
      }
      var wp = g.waypoints[g.wpIndex];
      var wdx = wp.x - g.x;
      var wdy = wp.y - g.y;
      var wd = Math.sqrt(wdx * wdx + wdy * wdy);
      if (wd < 8) {
        g.wpIndex += g.dir;
        if (g.wpIndex >= g.waypoints.length) {
          g.wpIndex = g.waypoints.length - 2;
          g.dir = -1;
        } else if (g.wpIndex < 0) {
          g.wpIndex = 1;
          g.dir = 1;
        }
      } else {
        collideMove(state, g, (wdx / wd) * g.speed * dt, (wdy / wd) * g.speed * dt, 14);
        g.angle = Math.atan2(wdy, wdx);
      }
    }
  }

  // Cameras.
  for (var ci = 0; ci < state.cameras.length; ci++) {
    var cam = state.cameras[ci];
    cam.angle = cam.baseAngle + Math.sin(state.time * cam.speed) * cam.sweep;
    cam.spotting = false;
    if (state.time < state.empUntil) continue;
    if (canSee(state, cam.x, cam.y, cam.angle, 0.96, 200, p.x, p.y)) {
      cam.spotting = true;
      seen = true;
      state.seenBy = "camera";
      state.alarm += 20 * dt;
    }
  }
  if (!seen) state.seenBy = null;

  // Alarm meter.
  if (!seen) state.alarm = Math.max(0, state.alarm - 6 * dt);
  if (state.alarm > state.maxAlarm) state.maxAlarm = state.alarm;
  if (state.alarm > 25) state.ghost = false;
  if (state.alarm >= 100 && state.lockdown <= 0) {
    state.lockdown = LOCKDOWN_TIME;
    state.message = "LOCKDOWN! Reach the exit in 20s!";
    state.messageUntil = state.time + 3;
  }
  if (state.lockdown > 0) {
    state.lockdown -= dt;
    if (state.lockdown <= 0) {
      state.lockdown = 0;
      state.status = "busted";
      return;
    }
  }
}

// ---- staged states (deterministic, seed 1) ----

function buildStage(n, seed) {
  var s = createGame(0, seed || 1);
  var vault = s.vault;
  if (n === 0) {
    s.status = "title";
    return s;
  }
  s.status = "playing";
  if (n === 1) {
    s.time = 12;
    var p1 = tileCenter(6, 4);
    s.player.x = p1.x;
    s.player.y = p1.y;
    s.player.dir = 0;
    var g1a = tileCenter(8, 2);
    s.guards[0].x = g1a.x;
    s.guards[0].y = g1a.y;
    s.guards[0].angle = 0;
    var g1b = tileCenter(22, 14);
    s.guards[1].x = g1b.x;
    s.guards[1].y = g1b.y;
    s.guards[1].angle = Math.PI;
    s.cameras[0].angle = s.cameras[0].baseAngle + Math.sin(12 * s.cameras[0].speed) * s.cameras[0].sweep;
    s.cameras[1].angle = s.cameras[1].baseAngle + Math.sin(12 * s.cameras[1].speed) * s.cameras[1].sweep;
    return s;
  }
  if (n === 2) {
    s.time = 68;
    s.player.x = vault.x - 60;
    s.player.y = vault.y;
    s.player.dir = 0;
    // Aim the second camera (near the vault) at the player; it spots them.
    var cam = s.cameras[1];
    cam.baseAngle = Math.atan2(s.player.y - cam.y, s.player.x - cam.x);
    cam.sweep = 0;
    cam.angle = cam.baseAngle;
    cam.spotting = true;
    s.seenBy = "camera";
    s.alarm = 16;
    s.maxAlarm = 16;
    s.vault.progress = 0.4;
    return s;
  }
  if (n === 3) {
    s.time = 95;
    s.player.x = vault.x - 60;
    s.player.y = vault.y + 20;
    s.player.dir = 0;
    var cam3 = s.cameras[1];
    cam3.baseAngle = Math.atan2(s.player.y - cam3.y, s.player.x - cam3.x);
    cam3.sweep = 0;
    cam3.angle = cam3.baseAngle;
    cam3.spotting = true;
    s.seenBy = "camera";
    s.alarm = 55;
    s.maxAlarm = 55;
    s.vault.progress = 0.75;
    var g3 = s.guards[0];
    g3.x = vault.x - 150;
    g3.y = vault.y;
    g3.angle = Math.atan2(s.player.y - g3.y, s.player.x - g3.x);
    g3.alerted = true;
    return s;
  }
  if (n === 4) {
    s.time = 150;
    s.status = "won";
    s.wonAt = 150;
    s.vault.cracked = true;
    s.vault.progress = 1;
    s.loot[0].taken = true; // Painting $700
    s.loot[1].taken = true; // Necklace $416
    s.lootValue = 700 + 416;
    s.alarm = 0;
    s.maxAlarm = 0;
    s.ghost = true;
    s.player.x = s.exit.x;
    s.player.y = s.exit.y;
    return s;
  }
  return s;
}

// ---- rendering ----

var TOOL_BUTTONS = [
  { name: "smoke", key: "1", label: "Smoke", x: 840, y: 12, w: 104, h: 40 },
  { name: "emp", key: "2", label: "EMP", x: 956, y: 12, w: 104, h: 40 },
  { name: "lockpick", key: "3", label: "Pick", x: 1072, y: 12, w: 104, h: 40 }
];

function drawCone(ctx, x, y, angle, fov, range, color) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, range, angle - fov / 2, angle + fov / 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function renderGame(ctx, state) {
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Floor tiles.
  for (var ty = 0; ty < ROWS; ty++) {
    for (var tx = 0; tx < COLS; tx++) {
      var px = tx * TILE;
      var py = MAP_Y + ty * TILE;
      if (isWall(state.walls, tx, ty)) {
        ctx.fillStyle = "#39415a";
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = "#4a5470";
        ctx.fillRect(px, py, TILE, 4);
      } else {
        ctx.fillStyle = (tx + ty) % 2 === 0 ? "#191c23" : "#1d212a";
        ctx.fillRect(px, py, TILE, TILE);
      }
    }
  }
  // Loot.
  for (var li = 0; li < state.loot.length; li++) {
    var l = state.loot[li];
    if (l.taken) continue;
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
    ctx.fillStyle = "#fde68a";
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("$" + l.value, l.x, l.y + 22);
  }
  // Vault.
  var v = state.vault;
  ctx.fillStyle = v.cracked ? "#78350f" : "#d4a017";
  ctx.fillRect(v.x - 18, v.y - 18, 36, 36);
  ctx.strokeStyle = "#fde68a";
  ctx.lineWidth = 2;
  ctx.strokeRect(v.x - 18, v.y - 18, 36, 36);
  ctx.fillStyle = "#111827";
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "center";
  ctx.fillText(v.cracked ? "OPEN" : "$", v.x, v.y + 6);
  if (!v.cracked && v.progress > 0) {
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(v.x - 18, v.y - 26, 36 * v.progress, 5);
  }
  // Exit door.
  var e = state.exit;
  ctx.fillStyle = "#16a34a";
  ctx.fillRect(e.x - 18, e.y - 18, 36, 36);
  ctx.fillStyle = "#bbf7d0";
  ctx.font = "bold 10px monospace";
  ctx.fillText("EXIT", e.x, e.y + 4);
  // Smoke clouds.
  for (var si = 0; si < state.smokes.length; si++) {
    var sm = state.smokes[si];
    var grad = ctx.createRadialGradient(sm.x, sm.y, 4, sm.x, sm.y, 80);
    grad.addColorStop(0, "rgba(148,163,184,0.55)");
    grad.addColorStop(1, "rgba(148,163,184,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sm.x, sm.y, 80, 0, Math.PI * 2);
    ctx.fill();
  }
  // Camera cones.
  for (var ci = 0; ci < state.cameras.length; ci++) {
    var cam = state.cameras[ci];
    var disabled = state.time < state.empUntil;
    if (disabled) continue;
    drawCone(ctx, cam.x, cam.y, cam.angle, 0.96, 200,
      cam.spotting ? "rgba(239,68,68,0.30)" : "rgba(56,189,248,0.15)");
  }
  // Guard cones.
  for (var gi = 0; gi < state.guards.length; gi++) {
    var g = state.guards[gi];
    drawCone(ctx, g.x, g.y, g.angle, 1.22, 170,
      g.alerted ? "rgba(239,68,68,0.30)" : "rgba(250,204,21,0.16)");
  }
  // Guards.
  for (var gj = 0; gj < state.guards.length; gj++) {
    var gd = state.guards[gj];
    ctx.fillStyle = gd.alerted ? "#dc2626" : "#991b1b";
    ctx.beginPath();
    ctx.arc(gd.x, gd.y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fca5a5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gd.x, gd.y);
    ctx.lineTo(gd.x + Math.cos(gd.angle) * 20, gd.y + Math.sin(gd.angle) * 20);
    ctx.stroke();
  }
  // Cameras.
  for (var cj = 0; cj < state.cameras.length; cj++) {
    var cm = state.cameras[cj];
    var off = state.time < state.empUntil;
    ctx.fillStyle = off ? "#475569" : "#cbd5e1";
    ctx.fillRect(cm.x - 8, cm.y - 8, 16, 16);
    ctx.strokeStyle = off ? "#334155" : "#0ea5e9";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cm.x, cm.y);
    ctx.lineTo(cm.x + Math.cos(cm.angle) * 16, cm.y + Math.sin(cm.angle) * 16);
    ctx.stroke();
  }
  // Player.
  var p = state.player;
  ctx.fillStyle = "#2dd4bf";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#134e4a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(p.dir) * 20, p.y + Math.sin(p.dir) * 20);
  ctx.stroke();
  if (p.sneaking) {
    ctx.strokeStyle = "rgba(45,212,191,0.6)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Click-to-move path.
  if (p.path.length > 0 && p.pathIndex < p.path.length) {
    ctx.strokeStyle = "rgba(45,212,191,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    for (var pi = p.pathIndex; pi < p.path.length; pi++) {
      ctx.lineTo(p.path[pi].x, p.path[pi].y);
    }
    ctx.stroke();
  }
  renderHUD(ctx, state);
  if (state.status === "title") renderTitle(ctx, state);
  if (state.status === "won") renderWin(ctx, state);
  if (state.status === "caught") renderEnd(ctx, "CAUGHT!", "#ef4444", "A guard grabbed you. Press R to retry.");
  if (state.status === "busted") renderEnd(ctx, "BUSTED!", "#ef4444", "Lockdown expired. Press R to retry.");
  if (state.lockdown > 0 && state.status === "playing") {
    ctx.fillStyle = "rgba(220,38,38,0.85)";
    ctx.fillRect(0, MAP_Y, VIEW_W, 34);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    ctx.fillText("LOCKDOWN — reach the exit in " + Math.ceil(state.lockdown) + "s!", VIEW_W / 2, MAP_Y + 25);
  }
  if (state.message) {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    var mw = ctx.measureText(state.message).width + 24;
    ctx.fillRect((VIEW_W - mw) / 2, VIEW_H - 40, mw, 28);
    ctx.fillStyle = "#fde68a";
    ctx.font = "15px monospace";
    ctx.textAlign = "center";
    ctx.fillText(state.message, VIEW_W / 2, VIEW_H - 20);
  }
}

function renderHUD(ctx, state) {
  ctx.fillStyle = "#0f1115";
  ctx.fillRect(0, 0, VIEW_W, HUD_H);
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "left";
  ctx.fillText(state.levelName, 16, 26);
  ctx.font = "13px monospace";
  ctx.fillStyle = "#9ca3af";
  var mm = Math.floor(state.time / 60);
  var ss = Math.floor(state.time % 60);
  ctx.fillText("TIME " + mm + ":" + (ss < 10 ? "0" : "") + ss, 16, 48);
  // Alarm bar.
  ctx.fillStyle = "#374151";
  ctx.fillRect(400, 20, 260, 24);
  var ar = state.alarm / 100;
  ctx.fillStyle = ar < 0.5 ? "#22c55e" : ar < 0.8 ? "#eab308" : "#ef4444";
  ctx.fillRect(400, 20, 260 * ar, 24);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "center";
  ctx.fillText("ALARM " + Math.floor(state.alarm) + "%", 530, 38);
  // Tool buttons.
  for (var i = 0; i < TOOL_BUTTONS.length; i++) {
    var b = TOOL_BUTTONS[i];
    var count = state.tools[b.name];
    ctx.fillStyle = count > 0 ? "#1f2937" : "#111827";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = count > 0 ? "#6b7280" : "#374151";
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = count > 0 ? "#e5e7eb" : "#4b5563";
    ctx.font = "13px monospace";
    ctx.fillText(b.key + " " + b.label + " x" + count, b.x + b.w / 2, b.y + 26);
  }
  // Take (right-aligned just left of the tool buttons).
  var take = getTake(state);
  ctx.fillStyle = "#fbbf24";
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "right";
  ctx.fillText("TAKE $" + take.total.toLocaleString("en-US"), 824, 26);
  ctx.fillStyle = "#9ca3af";
  ctx.font = "12px monospace";
  ctx.fillText("vault $" + take.vault + "  loot $" + take.loot, 824, 46);
}

function renderTitle(ctx, state) {
  ctx.fillStyle = "rgba(5,7,12,0.82)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = "#fbbf24";
  ctx.font = "bold 56px monospace";
  ctx.textAlign = "center";
  ctx.fillText("THE MIDNIGHT VAULT", VIEW_W / 2, 190);
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "20px monospace";
  ctx.fillText("A top-down stealth heist — three floors, one legend.", VIEW_W / 2, 235);
  ctx.font = "16px monospace";
  ctx.fillStyle = "#9ca3af";
  var lines = [
    "WASD / arrows — move      Shift — sneak      E — crack the vault (hold 3s)",
    "1 smoke pellet (5s cover)   2 EMP (cameras down 8s)   3 lockpick (instant vault)",
    "Click the floor to walk. Click a HUD tool to use it.",
    "Read the cones. Crack the vault. Grab the loot. Leave by the green door.",
    "Ghost bonus: keep the alarm under 25 for +500 score."
  ];
  for (var i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], VIEW_W / 2, 300 + i * 30);
  }
  ctx.fillStyle = "#2dd4bf";
  ctx.font = "bold 22px monospace";
  ctx.fillText("Press Enter or click to start — " + state.levelName, VIEW_W / 2, 500);
}

function renderWin(ctx, state) {
  var take = getTake(state);
  ctx.fillStyle = "rgba(5,12,7,0.82)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = "#22c55e";
  ctx.font = "bold 52px monospace";
  ctx.textAlign = "center";
  ctx.fillText("CLEAN GETAWAY", VIEW_W / 2, 200);
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "20px monospace";
  var rows = [
    "Vault  $" + take.vault.toLocaleString("en-US"),
    "Loot   $" + take.loot.toLocaleString("en-US"),
    "Time bonus  $" + take.timeBonus.toLocaleString("en-US")
  ];
  for (var i = 0; i < rows.length; i++) {
    ctx.fillText(rows[i], VIEW_W / 2, 270 + i * 34);
  }
  if (state.ghost) {
    ctx.fillStyle = "#2dd4bf";
    ctx.fillText("Ghost bonus  +500 score  (alarm never passed 25)", VIEW_W / 2, 270 + rows.length * 34);
  }
  ctx.fillStyle = "#fbbf24";
  ctx.font = "bold 28px monospace";
  ctx.fillText("Floor take  $" + take.total.toLocaleString("en-US"), VIEW_W / 2, 420);
  ctx.fillStyle = "#9ca3af";
  ctx.font = "16px monospace";
  ctx.fillText(state.levelIndex < 2 ? "Press R for the next floor" : "All floors cleared — press R to run it back", VIEW_W / 2, 470);
}

function renderEnd(ctx, title, color, sub) {
  ctx.fillStyle = "rgba(12,5,5,0.82)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = color;
  ctx.font = "bold 56px monospace";
  ctx.textAlign = "center";
  ctx.fillText(title, VIEW_W / 2, 300);
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "20px monospace";
  ctx.fillText(sub, VIEW_W / 2, 350);
}

// ---- audio (synthesized, guarded) ----

var audioCtx = null;
function beep(freq, dur, type, vol) {
  try {
    if (typeof window === "undefined") return;
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    var o = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.value = vol || 0.04;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* headless or blocked: silence is fine */ }
}

// ---- browser boot ----

if (typeof document !== "undefined") {
  (function () {
    function init() {
      var canvas = document.getElementById("game");
      if (!canvas) return;
      var ctx = canvas.getContext("2d");
      var params = new URLSearchParams(window.location.search);
      var stageParam = params.get("stage");
      var seed = parseInt(params.get("seed") || "1", 10) || 1;
      var state;
      var staged = stageParam !== null;
      if (staged) {
        state = buildStage(parseInt(stageParam, 10) || 0, seed);
      } else {
        state = createGame(0, seed);
        state.status = "title";
      }
      window.__game = state;
      window.__gameErrors = [];
      var errDiv = document.getElementById("game-errors");
      var statusDiv = document.getElementById("game-status");
      function mark() {
        var n = window.__gameErrors.length;
        document.title = "MIDNIGHT-VAULT stage=" + (stageParam || "play") + " errors=" + n;
        if (errDiv) errDiv.textContent = "errors=" + n;
        if (statusDiv) statusDiv.textContent = "status=" + state.status;
      }
      window.onerror = function (msg) {
        window.__gameErrors.push(String(msg));
        mark();
      };
      var input = { up: false, down: false, left: false, right: false, sneak: false, crack: false };
      var prev = { loot: 0, cracked: false, status: state.status, alarm: 0 };
      function sfxTick() {
        if (state.lootValue !== prev.loot) { beep(880, 0.12, "sine", 0.05); prev.loot = state.lootValue; }
        if (state.vault.cracked !== prev.cracked) {
          prev.cracked = state.vault.cracked;
          if (state.vault.cracked) { beep(523, 0.12, "square", 0.05); setTimeout(function () { beep(784, 0.18, "square", 0.05); }, 120); }
        }
        if (state.status !== prev.status) {
          prev.status = state.status;
          if (state.status === "won") { beep(523, 0.15, "triangle", 0.06); setTimeout(function () { beep(659, 0.15, "triangle", 0.06); }, 150); setTimeout(function () { beep(784, 0.3, "triangle", 0.06); }, 300); }
          if (state.status === "caught" || state.status === "busted") beep(110, 0.5, "sawtooth", 0.06);
        }
        if (state.alarm >= 100 && prev.alarm < 100) beep(220, 0.4, "sawtooth", 0.06);
        prev.alarm = state.alarm;
      }
      function startPlaying() {
        if (state.status === "title") state.status = "playing";
      }
      function retry() {
        if (state.status === "won" && state.levelIndex < 2) {
          state = createGame(state.levelIndex + 1, state.seed);
          window.__game = state;
        } else if (state.status === "won" || state.status === "caught" || state.status === "busted") {
          state = createGame(state.levelIndex, state.seed);
          window.__game = state;
        }
        prev = { loot: 0, cracked: false, status: state.status, alarm: 0 };
        state.status = "playing";
        mark();
      }
      window.addEventListener("keydown", function (ev) {
        var k = ev.key;
        if (k === "w" || k === "W" || k === "ArrowUp") input.up = true;
        if (k === "s" || k === "S" || k === "ArrowDown") input.down = true;
        if (k === "a" || k === "A" || k === "ArrowLeft") input.left = true;
        if (k === "d" || k === "D" || k === "ArrowRight") input.right = true;
        if (k === "Shift") input.sneak = true;
        if (k === "e" || k === "E") input.crack = true;
        if (k === "1") useTool(state, "smoke");
        if (k === "2") useTool(state, "emp");
        if (k === "3") useTool(state, "lockpick");
        if (k === "Enter") startPlaying();
        if (k === "r" || k === "R") retry();
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].indexOf(k) >= 0) ev.preventDefault();
      });
      window.addEventListener("keyup", function (ev) {
        var k = ev.key;
        if (k === "w" || k === "W" || k === "ArrowUp") input.up = false;
        if (k === "s" || k === "S" || k === "ArrowDown") input.down = false;
        if (k === "a" || k === "A" || k === "ArrowLeft") input.left = false;
        if (k === "d" || k === "D" || k === "ArrowRight") input.right = false;
        if (k === "Shift") input.sneak = false;
        if (k === "e" || k === "E") input.crack = false;
      });
      canvas.addEventListener("mousedown", function (ev) {
        var rect = canvas.getBoundingClientRect();
        var mx = (ev.clientX - rect.left) * (VIEW_W / rect.width);
        var my = (ev.clientY - rect.top) * (VIEW_H / rect.height);
        if (state.status === "title") { startPlaying(); return; }
        if (state.status !== "playing") return;
        for (var i = 0; i < TOOL_BUTTONS.length; i++) {
          var b = TOOL_BUTTONS[i];
          if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
            useTool(state, b.name);
            return;
          }
        }
        var tx = Math.floor(mx / TILE);
        var ty = Math.floor((my - MAP_Y) / TILE);
        var sx = Math.floor(state.player.x / TILE);
        var sy = Math.floor((state.player.y - MAP_Y) / TILE);
        var path = findPath(state.walls, sx, sy, tx, ty);
        if (path) {
          state.player.path = path;
          state.player.pathIndex = 0;
        }
      });
      var last = null;
      function frame(ts) {
        if (last === null) last = ts;
        var dt = Math.min(0.1, (ts - last) / 1000);
        last = ts;
        if (!staged && state.status === "playing") stepGame(state, input, dt);
        sfxTick();
        renderGame(ctx, state);
        mark();
        requestAnimationFrame(frame);
      }
      mark();
      requestAnimationFrame(frame);
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  })();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    TILE: TILE, COLS: COLS, ROWS: ROWS, VIEW_W: VIEW_W, VIEW_H: VIEW_H,
    HUD_H: HUD_H, MAP_Y: MAP_Y, VAULT_VALUE: VAULT_VALUE,
    CRACK_TIME: CRACK_TIME, LOCKDOWN_TIME: LOCKDOWN_TIME,
    GHOST_BONUS: GHOST_BONUS, TOOL_COST: TOOL_COST,
    mulberry32: mulberry32, tileCenter: tileCenter, isWall: isWall,
    parseLevel: parseLevel, losClear: losClear, angleDiff: angleDiff,
    canSee: canSee, findPath: findPath, createGame: createGame,
    timeBonus: timeBonus, getTake: getTake, circleHitsWall: circleHitsWall,
    collideMove: collideMove, dist: dist, useTool: useTool,
    stepGame: stepGame, buildStage: buildStage
  };
}
