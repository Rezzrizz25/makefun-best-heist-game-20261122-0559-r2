// The Midnight Vault — make.fun entrypoint (node22).
// Run with node and MAKEFUN_OUTPUT_DIR set: writes the game dossier into
// that directory. Output is fully deterministic: running twice produces
// byte-identical files (no timestamps, no randomness, fixed seed).
//
// Layout written to $MAKEFUN_OUTPUT_DIR:
//   index.html                  playable game (self-contained page)
//   game.js                     game logic (canvas 2D, no libraries)
//   levels.js                   the three floors
//   makefun/dossier/v1/         the same three files + manifest.json

const fs = require("node:fs");
const path = require("node:path");

const OUT = process.env.MAKEFUN_OUTPUT_DIR || path.join(process.cwd(), "dist");
const SRC = path.join(__dirname, "game");
const DOSSIER = path.join(OUT, "makefun", "dossier", "v1");
const FILES = ["index.html", "game.js", "levels.js"];

function writeFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

function main() {
  const manifest = {
    name: "The Midnight Vault",
    competition: "best-heist-game-20261122-0559",
    format: "makefun/dossier/v1",
    entrypoint: "index.html",
    engine: "canvas-2d",
    floors: ["Marlowe Gallery", "Meridian Bank", "Gilded Cage"],
    seed: 1,
    controls: {
      move: "WASD / arrows (or click the floor to walk)",
      sneak: "Shift",
      crack: "E (hold 3s at the vault)",
      tools: "1 smoke pellet, 2 EMP, 3 lockpick (or click the HUD tools)"
    },
    files: FILES.slice()
  };
  for (const name of FILES) {
    const data = fs.readFileSync(path.join(SRC, name));
    writeFile(path.join(OUT, name), data);
    writeFile(path.join(DOSSIER, name), data);
  }
  writeFile(path.join(DOSSIER, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const total = FILES.reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  console.log("The Midnight Vault — dossier written to " + OUT);
  console.log("files: " + FILES.join(", ") + " (+ makefun/dossier/v1/manifest.json)");
  console.log("game bytes: " + total);
}

main();
