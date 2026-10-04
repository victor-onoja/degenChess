// Checks the practice board (/sandbox): one person plays both sides, captures move the money, and
// checkmate settles it the way the contract would. Nothing touches the chain.
//   (app running) node tools/e2e/sandbox.mjs
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR;
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist"] });
const errors = []; // any uncaught page error fails the run
const check = (cond, what) => {
  if (!cond) throw new Error(`FAILED: ${what}`);
  console.log(`  ok: ${what}`);
};

for (const phone of [false, true]) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 300)));
  await page.goto(`${APP}/sandbox`);
  // Desktop opens in 3D; the split view shows the flat board to tap on, and the 3D board beside it.
  if (!phone) await page.getByRole("button", { name: "Split", exact: true }).click();
  await page.locator('[data-square="e2"]').waitFor({ timeout: 60000 });
  const tap = async (sq) => (phone ? page.locator(`[data-square="${sq}"]`).tap() : page.locator(`[data-square="${sq}"]`).click());
  // Scholar's mate, with a capture on f7.
  for (const [from, to] of [["e2", "e4"], ["e7", "e5"], ["f1", "c4"], ["b8", "c6"], ["d1", "h5"], ["g8", "f6"], ["h5", "f7"]]) {
    await tap(from);
    await tap(to);
    await page.waitForTimeout(250);
  }
  await page.getByText("Checkmate. White wins").waitFor({ timeout: 10000 });
  const text = await page.locator(".slab").first().innerText();
  // 10 tUSD each, Black captured nothing: White takes the pot less the 2.5% fee, Black keeps nothing.
  const flat = text.replace(/\s+/g, " ");
  check(flat.includes("White 19.5") && flat.includes("0 Black"), `${phone ? "phone" : "desktop"}: checkmate settles to "${flat.slice(0, 60)}"`);
  if (SHOTS) {
    await page.waitForTimeout(phone ? 500 : 6000);
    await page.screenshot({ path: `${SHOTS}/sandbox-${phone ? "phone" : "desktop"}.png` });
  }
  await ctx.close();
}
await browser.close();
check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" / ") : ""}`);
console.log("SANDBOX OK");
