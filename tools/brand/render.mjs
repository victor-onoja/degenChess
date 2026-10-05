// Renders every brand image from the real app and its tokens, so they always match what ships:
//   public/og.png              link preview, 1200x630 (the landing hero)
//   public/brand/title-card.png  16:9 for video intros and slides
//   public/brand/poster.png      9:16 for stories and reels
//   public/brand/logo-mark.png   1024 square: the eyes on the board
//   public/brand/logo-wide.png   1600x480: mark, name and line
//
//   node tools/brand/render.mjs      (app running on localhost:3000, or APP_URL)
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist"] });

/** The landing hero with only the logo and the statement over the live board. */
async function hero(path, viewport, scale = 1) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  await page.goto(APP);
  await page.waitForFunction(() => document.querySelector("canvas") && !document.body.innerText.includes("Setting the board"), null, { timeout: 120000 });
  await page.addStyleTag({ content: ".stage form, .stage p, .stage header a, .capture-amount { display: none !important } .stage h1 { margin-bottom: 20px }" });
  await page.waitForTimeout(26200); // the armies mid-game in the demo
  await page.screenshot({ path });
  await page.close();
  console.log("wrote", path);
}

const FONT = '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&display=swap" rel="stylesheet">';
const EYES = (size) => `<svg width="${size}" height="${size * 0.5625}" viewBox="0 0 32 18">
  <circle cx="9" cy="9" r="8" fill="#f1e9d6"/><circle cx="10.2" cy="9.4" r="3.6" fill="#0a0a14"/>
  <circle cx="23" cy="9" r="8" fill="#f1e9d6"/><circle cx="24.2" cy="9.4" r="3.6" fill="#0a0a14"/></svg>`;

async function card(path, width, height, html) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(`<!doctype html><html><head>${FONT}<style>
    html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#0d0b14;color:#f1e9d6;font-family:"Bricolage Grotesque",sans-serif}
  </style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path });
  await page.close();
  console.log("wrote", path);
}

await hero("public/og.png", { width: 1200, height: 630 });
await hero("public/brand/title-card.png", { width: 1920, height: 1080 });
await hero("public/brand/poster.png", { width: 540, height: 960 }, 2);

// The mark: the eyes on a corner of the board, the same drawing as the favicon.
const favicon = readFileSync("public/favicon.svg", "utf8").replace("<svg ", '<svg width="1024" height="1024" ');
await card("public/brand/logo-mark.png", 1024, 1024, favicon);

await card(
  "public/brand/logo-wide.png",
  1600,
  480,
  `<div style="height:100%;display:flex;align-items:center;gap:56px;padding:0 120px">
    ${EYES(250)}
    <div>
      <div style="font-weight:800;font-size:150px;letter-spacing:-0.035em;font-variation-settings:'wdth' 80;line-height:1">Away Chess</div>
      <div style="margin-top:22px;font-size:40px;color:#b5aecd">Every piece has <span style="color:#ffc233;font-weight:700">skin in the game.</span></div>
    </div>
  </div>`
);
await browser.close();
