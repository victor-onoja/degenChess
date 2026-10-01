import { chromium, devices } from "playwright";
const out = process.env.SHOTS_DIR;
const mobile = process.env.MOBILE === "1";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext(mobile ? { ...devices["iPhone 14"] } : { viewport: { width: 900, height: 980 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 300)));
await page.goto("http://localhost:3000/arena");
await page.waitForFunction(() => document.querySelector("canvas") && !document.body.innerText.includes("Mustering"), null, { timeout: 90000 });
await page.waitForTimeout(2500);
const box = await page.locator("canvas").boundingBox();
console.log("canvas", JSON.stringify(box));
const tag = mobile ? "m" : "d";
await page.screenshot({ path: `${out}/click-${tag}-0.png` });
// Click positions as fractions of the canvas, passed in as "x,y x,y ..."
const pts = (process.env.PTS ?? "").split(" ").filter(Boolean).map((p) => p.split(",").map(Number));
let i = 1;
for (const [fx, fy] of pts) {
  const x = box.x + box.width * fx, y = box.y + box.height * fy;
  if (mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  await page.waitForTimeout(1600);
  console.log(`after click ${i}:`, await page.locator('[data-testid="ply"]').innerText());
  await page.screenshot({ path: `${out}/click-${tag}-${i++}.png` });
}
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res(Math.round(n / 2)); }; requestAnimationFrame(f); }));
console.log("fps:", fps);
await browser.close();
