// Screenshots for a design review: the landing page and a spectated game, at desktop and phone sizes.
//   SHOTS_DIR=/some/dir [APP_URL=...] [GAME=0] node tools/e2e/review-shots.mjs
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const DIR = process.env.SHOTS_DIR ?? ".";
const GAME = process.env.GAME ?? "0";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ready = (page) =>
  page.waitForFunction(() => document.querySelector("canvas") && !document.body.innerText.includes("Setting the board"), null, { timeout: 90000 });

for (const [label, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: label === "mobile" ? 2 : 1, hasTouch: label === "mobile" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${label} pageerror]`, e.message.slice(0, 300)));
  await page.goto(APP);
  await ready(page);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${DIR}/${label}-hero.png` });
  await page.screenshot({ path: `${DIR}/${label}-page.png`, fullPage: true });
  await page.goto(`${APP}/?game=${GAME}`);
  await ready(page);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${DIR}/${label}-watch.png` });
  await ctx.close();
}
// Signed in and then locked, at phone size: the header must stay out of the board's way.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
  });
  await page.goto(APP);
  await page.getByLabel("Username").fill(`shot_${Date.now().toString(36).slice(-5)}`);
  await page.getByRole("button", { name: "Play now", exact: true }).click();
  await page.getByText("You're in.").waitFor({ timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${DIR}/mobile-signed-in.png`, fullPage: true });
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/mobile-locked.png` });
  await ctx.close();
}
await browser.close();
console.log("shots in", DIR);
