// Node simulation tests for The Midnight Vault.
// No browser needed. Run: node tools/sim.mjs
// Exit 0 when every check passes, 1 otherwise.

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const game = require(path.join(root, "game", "game.js"));
const levels = require(path.join(root, "game", "levels.js")).LEVELS;

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : ""));
  if (!ok) failures++;
}

// ---- T1: map validation for all three floors ----
for (let li = 0; li < levels.length; li++) {
  const def = levels[li];
  const parsed = game.parseLevel(def);
  let rowsOk = def.map.length === 16 && def.map.every((r) => r.length === 32);
  check("L" + (li + 1) + " map is 16x32", rowsOk);
  check("L" + (li + 1) + " has player/vault/exit", !!parsed.playerStart && !!parsed.vault && !!parsed.exit);
  const floor = (tx, ty) => !game.isWall(parsed.walls, tx, ty);
  for (const l of def.loot) check("L" + (li + 1) + " loot " + l.name + " on floor", floor(l.tx, l.ty));
  for (const c of def.cameras) check("L" + (li + 1) + " camera on floor", floor(c.tx, c.ty));
  for (const g of def.guards) {
    for (const w of g.waypoints) check("L" + (li + 1) + " guard waypoint on floor", floor(w[0], w[1]));
    for (let i = 0; i + 1 < g.waypoints.length; i++) {
      const a = g.waypoints[i];
      const b = g.waypoints[i + 1];
      const ax = a[0] * 40 + 20, ay = 64 + a[1] * 40 + 20;
      const bx = b[0] * 40 + 20, by = 64 + b[1] * 40 + 20;
      check("L" + (li + 1) + " guard segment clear", game.losClear(parsed.walls, ax, ay, bx, by));
    }
  }
  const ps = { x: Math.floor(parsed.playerStart.x / 40), y: Math.floor((parsed.playerStart.y - 64) / 40) };
  const vs = { x: Math.floor(parsed.vault.x / 40), y: Math.floor((parsed.vault.y - 64) / 40) };
  const es = { x: Math.floor(parsed.exit.x / 40), y: Math.floor((parsed.exit.y - 64) / 40) };
  check("L" + (li + 1) + " vault reachable", !!game.findPath(parsed.walls, ps.x, ps.y, vs.x, vs.y));
  check("L" + (li + 1) + " exit reachable", !!game.findPath(parsed.walls, ps.x, ps.y, es.x, es.y));
  for (const l of def.loot) {
    check("L" + (li + 1) + " loot " + l.name + " reachable",
      !!game.findPath(parsed.walls, ps.x, ps.y, l.tx, l.ty));
  }
}

// ---- T2: staged states are deterministic ----
for (let n = 1; n <= 4; n++) {
  const a = JSON.stringify(game.buildStage(n, 1));
  const b = JSON.stringify(game.buildStage(n, 1));
  check("stage " + n + " deterministic (seed 1)", a === b);
}

// ---- T3: stage 4 win screen numbers ----
{
  const s4 = game.buildStage(4, 1);
  const take = game.getTake(s4);
  check("stage 4 status won", s4.status === "won");
  check("stage 4 vault $5,000", take.vault === 5000, "got " + take.vault);
  check("stage 4 loot $1,116", take.loot === 1116, "got " + take.loot);
  check("stage 4 time bonus $300", take.timeBonus === 300, "got " + take.timeBonus);
  check("stage 4 floor take $6,416", take.total === 6416, "got " + take.total);
  check("stage 4 ghost intact", s4.ghost === true);
}

// ---- T4: win path mechanics (floor 1) ----
{
  const s = game.createGame(0, 1);
  s.status = "playing";
  const idle = { up: false, down: false, left: false, right: false, sneak: false, crack: false };
  // Stand next to the vault and crack it.
  s.player.x = s.vault.x - 50;
  s.player.y = s.vault.y;
  for (let i = 0; i < 200; i++) game.stepGame(s, { ...idle, crack: true }, 1 / 60);
  check("vault cracks after 3s hold", s.vault.cracked === true, "progress=" + s.vault.progress.toFixed(2));
  // Collect the two big loot items.
  for (const l of s.loot) {
    s.player.x = l.x;
    s.player.y = l.y;
    game.stepGame(s, idle, 1 / 60);
  }
  check("all loot collected", s.lootValue === 700 + 416 + 250 + 180, "got " + s.lootValue);
  // Walk out the green door.
  s.player.x = s.exit.x;
  s.player.y = s.exit.y;
  game.stepGame(s, idle, 1 / 60);
  check("exit after vault = won", s.status === "won", "status=" + s.status);
  const take = game.getTake(s);
  check("win take = vault+loot+timeBonus",
    take.total === take.vault + take.loot + take.timeBonus, "total=" + take.total);
}

// ---- T5: click-to-move path following + wall collision ----
{
  const s = game.createGame(0, 1);
  s.status = "playing";
  const idle = { up: false, down: false, left: false, right: false, sneak: false, crack: false };
  const from = { x: 2, y: 5 };
  const to = { x: 10, y: 5 };
  const p0 = game.tileCenter(from.x, from.y);
  s.player.x = p0.x;
  s.player.y = p0.y;
  const path = game.findPath(s.walls, from.x, from.y, to.x, to.y);
  check("path found along row 5", Array.isArray(path) && path.length > 0);
  s.player.path = path;
  s.player.pathIndex = 0;
  let arrived = false;
  for (let i = 0; i < 600; i++) {
    game.stepGame(s, idle, 1 / 60);
    if (game.dist(s.player.x, s.player.y, game.tileCenter(to.x, to.y).x, game.tileCenter(to.x, to.y).y) < 20) { arrived = true; break; }
  }
  check("player follows path to target", arrived);
  check("player never inside a wall", !game.circleHitsWall(s.walls, s.player.x, s.player.y, 14));
}

// ---- T6: floors 2 and 3 load and simulate without errors ----
for (const li of [1, 2]) {
  const s = game.createGame(li, 1);
  s.status = "playing";
  const idle = { up: false, down: false, left: false, right: false, sneak: false, crack: false };
  let ok = true;
  try {
    for (let i = 0; i < 600; i++) game.stepGame(s, idle, 1 / 60);
  } catch (e) { ok = false; }
  check("floor " + (li + 1) + " simulates 10s cleanly", ok && s.status === "playing", "status=" + s.status);
  s.player.x = s.vault.x - 50;
  s.player.y = s.vault.y;
  for (let i = 0; i < 200; i++) game.stepGame(s, { ...idle, crack: true }, 1 / 60);
  check("floor " + (li + 1) + " vault cracks", s.vault.cracked === true);
}

// ---- T7: tools ----
{
  const s = game.createGame(0, 1);
  s.status = "playing";
  check("smoke fires", game.useTool(s, "smoke") === true && s.tools.smoke === 2 && s.smokes.length === 1);
  check("emp fires", game.useTool(s, "emp") === true && s.tools.emp === 1 && s.empUntil > s.time);
  s.player.x = s.vault.x - 50;
  s.player.y = s.vault.y;
  check("lockpick cracks instantly", game.useTool(s, "lockpick") === true && s.vault.cracked === true);
  check("lockpick spent", s.tools.lockpick === 0);
  check("empty tool refused", game.useTool(s, "lockpick") === false);
}

// ---- T8: main.ts runs twice with byte-identical output ----
{
  const outA = "/tmp/midnight-out-a";
  const outB = "/tmp/midnight-out-b";
  fs.rmSync(outA, { recursive: true, force: true });
  fs.rmSync(outB, { recursive: true, force: true });
  const envA = { ...process.env, MAKEFUN_OUTPUT_DIR: outA };
  const envB = { ...process.env, MAKEFUN_OUTPUT_DIR: outB };
  execFileSync(process.execPath, [path.join(root, "main.ts")], { env: envA, stdio: "pipe" });
  execFileSync(process.execPath, [path.join(root, "main.ts")], { env: envB, stdio: "pipe" });
  const diff = (() => {
    try {
      execFileSync("diff", ["-r", outA, outB], { stdio: "pipe" });
      return true;
    } catch (e) { return false; }
  })();
  check("main.ts double run byte-identical", diff);
  check("dossier manifest exists", fs.existsSync(path.join(outA, "makefun", "dossier", "v1", "manifest.json")));
  check("dossier has index + game + levels", ["index.html", "game.js", "levels.js"].every((f) => fs.existsSync(path.join(outA, "makefun", "dossier", "v1", f))));
}

console.log(failures === 0 ? "ALL SIM TESTS PASSED" : failures + " SIM TEST(S) FAILED");
process.exit(failures === 0 ? 0 : 1);
