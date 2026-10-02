// Screenshots of the landing page on a desktop and a phone-sized window (hero, then the full page).
//   SHOTS_DIR=out node tools/e2e/landing-shots.mjs
import { chromium, devices } from "playwright";
const out = process.env.SHOTS_DIR ?? ".";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist"] });
for (const [tag, opts] of [["d", { viewport: { width: 1440, height: 900 } }], ["l", { viewport: { width: 1366, height: 700 } }], ["m", { ...devices["iPhone 14"] }]]) {
  const page = await (await browser.newContext(opts)).newPage();
  page.on("pageerror", (e) => console.log(tag, "pageerror:", e.message.slice(0, 300)));
  await page.goto(process.env.APP_URL ?? "http://localhost:3000");
  await page.waitForFunction(() => document.querySelector("canvas") && !document.body.innerText.includes("Setting the board"), null, { timeout: 90000 });
  await page.waitForTimeout(Number(process.env.WAIT_MS ?? 26200)); // into the demo game's first capture
  await page.screenshot({ path: `${out}/land-${tag}-hero.png` });
  await page.screenshot({ path: `${out}/land-${tag}-full.png`, fullPage: true });
  console.log(tag, "overflow-x px:", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
}
await browser.close();
