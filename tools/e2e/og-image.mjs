// Regenerates public/og.png (the link-preview image) from the live landing hero.
//   node tools/e2e/og-image.mjs      (app running on localhost:3000)
import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(process.env.APP_URL ?? "http://localhost:3000");
await page.waitForFunction(() => document.querySelector("canvas") && !document.body.innerText.includes("Setting the board"), null, { timeout: 90000 });
// Just the logo and headline over the arena: no form, stats or network chip.
await page.addStyleTag({ content: ".stage form, .stage p, .stage header a, .capture-amount { display: none !important } .stage h1 { margin-bottom: 20px }" });
await page.waitForTimeout(26200); // mid-capture in the demo game
await page.screenshot({ path: "public/og.png" });
await browser.close();
