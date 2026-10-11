// End-to-end check of linking a chess.com account: the code is missing, then present; the rating
// shows in the wallet and on the player's waiting board. chess.com is played by a small stand-in
// server started here, so the test decides what the profile says.
//   (app running against a local chain, started with RATING_API_BASE=http://localhost:4011) node tools/e2e/rating.mjs
import http from "node:http";
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR;
const check = (cond, what) => {
  if (!cond) throw new Error(`FAILED: ${what}`);
  console.log(`  ok: ${what}`);
};

// The stand-in chess.com: every username exists except "ghost_player"; the Location is whatever the test sets.
let location = "Lagos";
const stub = http
  .createServer((req, res) => {
    const [, handle, stats] = req.url.split("/");
    res.setHeader("content-type", "application/json");
    if (handle === "ghost_player") return res.writeHead(404).end(JSON.stringify({ code: 0, message: "not found" }));
    if (stats === "stats") return res.end(JSON.stringify({ chess_rapid: { last: { rating: 1450 } }, chess_blitz: { last: { rating: 1380 } } }));
    res.end(JSON.stringify({ username: handle, name: "Test Player", location }));
  })
  .listen(4011);

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const errors = [];
async function page(passkey = true) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem("degenchess.view", "2d"));
  const p = await ctx.newPage();
  if (passkey) {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
    });
  }
  p.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await p.goto(APP);
  return p;
}
const idle = (p) => p.waitForFunction(() => !document.querySelector(".Toastify__toast--loading"), null, { timeout: 60000 });

try {
  const name = `r_${Date.now().toString(36).slice(-6)}`;
  const p = await page();
  await p.getByLabel("Username").fill(name);
  await p.getByText("Available").waitFor({ timeout: 20000 });
  await p.getByRole("button", { name: "Play now", exact: true }).click();
  await p.getByText("You're in.").waitFor({ timeout: 60000 });
  await idle(p);

  await p.getByTitle("Add funds or send").click();
  const wallet = p.getByRole("dialog");
  await wallet.getByText("Chess.com rating").waitFor();
  const code = (await wallet.locator("code", { hasText: /^away-[0-9a-f]{6}$/ }).innerText()).trim();
  check(/^away-[0-9a-f]{6}$/.test(code), `the wallet shows the player's code (${code})`);

  // The account exists but does not carry the code: refused, with the reason.
  // (A fresh username each run: one chess.com account can only be linked by one player.)
  const handle = `tp_${name.slice(2)}`;
  await wallet.getByLabel("chess.com username").fill(handle.toUpperCase());
  check((await wallet.getByLabel("chess.com username").inputValue()) === handle, "the username is lower-cased as typed");
  await wallet.getByRole("button", { name: "Link", exact: true }).click();
  await wallet.getByText("Your code was not on that chess.com profile.").waitFor({ timeout: 90000 });
  check(true, "without the code on the profile the link is refused, and says why");
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/rating-refused.png` });

  // The player adds the code and checks again: no new transaction, and the rating arrives.
  location = `Lagos ${code.toUpperCase()}`;
  await p.waitForTimeout(15500); // the route's per-player cooldown
  await wallet.getByRole("button", { name: "I've added it. Check again" }).click();
  await wallet.getByText("· verified").waitFor({ timeout: 60000 }).catch(async (e) => {
    console.log("  wallet:", (await wallet.innerText()).replace(/\s+/g, " ").slice(-500));
    console.log("  toasts:", (await p.locator(".Toastify").innerText()).replace(/\s+/g, " "));
    throw e;
  });
  const linked = (await wallet.innerText()).replace(/\s+/g, " ");
  check(/verified/.test(linked) && /Rapid 1450 · Blitz 1380 · Bullet –/.test(linked), `linked and verified: ${linked.match(/Rapid.{0,40}/)?.[0]}`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/rating-linked.png` });
  await p.keyboard.press("Escape");

  // Anyone looking for a game sees the rating on this player's waiting board.
  await idle(p);
  await p.getByRole("button", { name: "Create Game", exact: true }).click();
  await p.waitForURL(/game=\d+/, { timeout: 60000 });
  await p.getByText("Waiting for an opponent").waitFor({ timeout: 30000 });
  await p.getByText(`White · ${name} (you) (1450)`).first().waitFor({ timeout: 30000 });
  check(true, "the game shows the rating after the player's name");
  const visitor = await page(false);
  await visitor.getByRole("button", { name: /^Waiting \d+$/ }).click();
  await visitor.getByText(`${name} (1450) is waiting, plays White`).waitFor({ timeout: 60000 });
  check(true, "a visitor sees the rating on the waiting board");
  if (SHOTS) await visitor.screenshot({ path: `${SHOTS}/rating-yard.png` });

  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" / ") : ""}`);
  console.log("RATING OK");
} finally {
  await browser.close();
  stub.close();
}
