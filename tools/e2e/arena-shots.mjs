// Screenshots of the chain-free arena sandbox: opening position, a capture in progress, and after it.
//   SHOTS_DIR=out node tools/e2e/arena-shots.mjs        (MOBILE=1 for a phone-sized window)
import { chromium, devices } from "playwright";
const out = process.env.SHOTS_DIR ?? ".";
const mobile = process.env.MOBILE === "1";
const tag = mobile ? "m" : "d";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext(mobile ? { ...devices["iPhone 14"] } : { viewport: { width: 1100, height: 1000 } })).newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 300)));
page.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && console.log("console:", m.text().slice(0, 240)));
await page.goto((process.env.APP_URL ?? "http://localhost:3000") + "/arena");
await page.waitForFunction(() => document.querySelector("canvas") && !document.body.innerText.includes("Setting the board"), null, { timeout: 90000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/arena-${tag}-1-start.png` });
await page.getByRole("button", { name: "Play demo game" }).click();
const ply = (n) => page.waitForFunction((n) => document.querySelector('[data-testid="ply"]')?.textContent === `ply ${n}`, n, { timeout: 120000 });
await ply(9); // exd5, a capture
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/arena-${tag}-2-hop.png` });
await page.waitForTimeout(330);
await page.screenshot({ path: `${out}/arena-${tag}-3-impact.png` });
await ply(13); // Qf3+, a check
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/arena-${tag}-4-check.png` });
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
console.log(tag, "fps:", fps);
await browser.close();
