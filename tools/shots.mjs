// Staged screenshots for The Midnight Vault (headless Chrome, 1280x720).
// Run: node tools/shots.mjs
// Uses the Playwright-cached stock Chromium (the /opt/meta-chromium build
// refuses to start from a plain shell). Override with CHROME_BIN.
// Exit 0 when every stage renders with zero page errors and every PNG is
// under the 256 KiB cap, 1 otherwise.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const shots = JSON.parse(fs.readFileSync(path.join(root, "shots.json"), "utf8"));
const CHROME = process.env.CHROME_BIN ||
  path.join(process.env.HOME || "/home/hatch", ".cache/ms-playwright/chromium-1255/chrome-linux64/chrome");
const shotsDir = path.join(root, "shots");
fs.mkdirSync(shotsDir, { recursive: true });

const baseArgs = ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
  "--window-size=" + shots.width + "," + shots.height, "--virtual-time-budget=4000",
  "--hide-scrollbars"];

let failures = 0;
for (const st of shots.stages) {
  const url = "file://" + path.join(root, "game", "index.html") + "?stage=" + st.stage + "&seed=" + shots.seed;
  const out = path.join(shotsDir, st.file);
  // 1. DOM check: page must load with zero JS errors.
  let dom = "";
  try {
    dom = execFileSync(CHROME, [...baseArgs, "--dump-dom", url], { stdio: ["ignore", "pipe", "pipe"], timeout: 60000 }).toString();
  } catch (e) {
    console.log("FAIL stage " + st.stage + " (" + st.file + ") — chrome dump-dom failed: " + (e.message || e));
    failures++;
    continue;
  }
  const errOk = dom.includes("errors=0");
  const statusOk = dom.includes("status=");
  console.log((errOk ? "PASS " : "FAIL ") + "stage " + st.stage + " loads with zero page errors");
  if (!errOk) failures++;
  // 2. Screenshot.
  try {
    execFileSync(CHROME, [...baseArgs, "--screenshot=" + out, url], { stdio: ["ignore", "pipe", "pipe"], timeout: 60000 });
  } catch (e) {
    console.log("FAIL stage " + st.stage + " (" + st.file + ") — screenshot failed: " + (e.message || e));
    failures++;
    continue;
  }
  const size = fs.existsSync(out) ? fs.statSync(out).size : 0;
  const sizeOk = size > 0 && size < 256 * 1024;
  console.log((sizeOk ? "PASS " : "FAIL ") + "stage " + st.stage + " " + st.file + " — " + size + " bytes" + (sizeOk ? "" : " (must be >0 and <256 KiB)") + " — " + st.desc);
  if (!sizeOk) failures++;
}

console.log(failures === 0 ? "ALL SCREENSHOTS OK" : failures + " SCREENSHOT CHECK(S) FAILED");
process.exit(failures === 0 ? 0 : 1);
