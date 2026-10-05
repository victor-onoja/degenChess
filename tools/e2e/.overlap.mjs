// Plays a quick queen trade in the sandbox and checks that no two voice lines ever play at once.
import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.addInitScript(() => {
  // Watch every voice clip: how many are audible at the same moment, and what the music does.
  window.__voices = { now: 0, max: 0, played: 0, musicLow: false };
  const Real = window.Audio;
  window.Audio = function (src) {
    const a = new Real(src);
    if (String(src).includes("/voices/")) {
      a.addEventListener("play", () => { const v = window.__voices; v.now++; v.played++; v.max = Math.max(v.max, v.now); });
      const end = () => { window.__voices.now = Math.max(0, window.__voices.now - 1); };
      a.addEventListener("ended", end);
      a.addEventListener("pause", end);
    } else if (String(src).includes("/music/")) {
      window.__music = a;
    }
    return a;
  };
});
await p.goto("http://localhost:3000/sandbox");
await p.getByRole("button", { name: "2d", exact: true }).click();
await p.locator('[data-square="e2"]').waitFor({ timeout: 60000 });
const tap = async (a, c, wait = 350) => { await p.locator(`[data-square="${a}"]`).click(); await p.locator(`[data-square="${c}"]`).click(); await p.waitForTimeout(wait); };
// Fast moves with back-to-back big moments: queen takes queen, king retakes, checks.
await tap("e2", "e4"); await tap("d7", "d5"); await tap("e4", "d5"); await tap("d8", "d5"); await tap("d1", "g4"); await tap("d5", "g2");
await tap("g4", "c8"); // check, capturing a bishop
await p.waitForTimeout(1200);
const low = await p.evaluate(() => (window.__music ? window.__music.volume : null));
await p.waitForTimeout(14000);
const v = await p.evaluate(() => window.__voices);
const after = await p.evaluate(() => (window.__music ? window.__music.volume : null));
console.log(`voice lines played: ${v.played}, most at once: ${v.max}, music volume while speaking: ${low}, after: ${after}, page errors: ${errors.length}`);
await b.close();
if (v.max > 1 || errors.length) process.exit(1);
