// End-to-end checks for the flows passkey-game.mjs does not cover: cancel and refund, tap-to-move on a
// phone (with promotion), a spectator following a live game, a draw by agreement, and a win on time.
// Runs against a LOCAL hardhat chain (it moves the chain clock):
//
//   npx hardhat node, npm run deploy:local, build and start the app against it, then:
//   node tools/e2e/core-flows.mjs
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const SHOTS = process.env.SHOTS_DIR;
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const step = (msg) => console.log("-", msg);
const shot = (p, name) => (SHOTS ? p.page.screenshot({ path: `${SHOTS}/core-${name}.png` }) : null);

async function player(n, { phone = false, passkey = true } = {}) {
  const ctx = await browser.newContext(
    phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1300, height: 900 } }
  );
  // Desktop players drag on the 2D board; the phone player gets the phone default (2D) on its own.
  if (!phone) await ctx.addInitScript(() => localStorage.setItem("degenchess.view", "2d"));
  // A fake clock that can be fast-forwarded, for the clock test.
  const page = await ctx.newPage();
  await page.clock.install();
  if (passkey) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
    });
  }
  page.on("pageerror", (e) => console.log(`[P${n} pageerror]`, e.message.slice(0, 300)));
  await page.goto(APP);
  return { page, n, phone };
}

const idle = (p) => p.page.waitForFunction(() => !document.querySelector(".Toastify__toast--loading"), null, { timeout: 60000 });
async function click(p, name) {
  const b = p.page.getByRole("button", { name, exact: true });
  await b.first().waitFor({ timeout: 60000 }).catch(async (e) => {
    await shot(p, `fail-p${p.n}`);
    console.log(`  P${p.n} page text:`, (await p.page.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 600));
    throw e;
  });
  await b.first().click({ timeout: 60000 });
}
/** In-app navigation, as a player clicking around would do. A full reload locks the account by design. */
async function go(p, url) {
  await p.page.evaluate((path) => window.next.router.push(path), new URL(url, APP).pathname + new URL(url, APP).search);
  await p.page.waitForTimeout(500);
}
async function signUp(p) {
  await click(p, "Play now");
  await p.page.getByText("You're in.").waitFor({ timeout: 60000 });
}
async function createGame(p, clock = "5 + 3", side = "White") {
  await go(p, "/");
  await p.page.getByRole("button", { name: new RegExp(`^${clock.replace(/\+/g, "\\+")}`) }).click();
  await p.page.getByRole("button", { name: side, exact: true }).click();
  await click(p, "Create Game");
  await p.page.waitForURL(/game=\d+/, { timeout: 60000 });
  await p.page.getByText("Waiting for an opponent").waitFor();
  await idle(p);
  return p.page.url();
}
async function join(p, url) {
  await go(p, url);
  await click(p, new RegExp("^Join as Black"));
  await p.page.getByText("White to move").waitFor({ timeout: 60000 });
  await idle(p);
}
const plyShown = (p, n) => p.page.getByText(`ply ${n} `).first().waitFor({ timeout: 30000 });
let ply = 0;
/** One move: dragged on desktop, tapped (piece, then square) on the phone. Waits until every watcher sees it. */
async function move(p, from, to, watchers, promotion) {
  await p.page.waitForTimeout(700);
  if (p.phone) {
    await p.page.locator(`[data-square="${from}"]`).tap();
    await p.page.locator(`[data-square="${to}"]`).tap();
  } else {
    await p.page.dragAndDrop(`[data-square="${from}"] [data-piece]`, `[data-square="${to}"]`);
  }
  if (promotion) {
    const option = p.page.locator(`[data-piece="${promotion}"]:not([data-square] [data-piece])`);
    await option.waitFor({ timeout: 10000 });
    await shot(p, "promotion-dialog");
    p.phone ? await option.tap() : await option.click();
  }
  ply++;
  for (const q of watchers) await plyShown(q, ply + 1);
  await idle(p);
}
async function chainTime(seconds) {
  const call = (method, params = []) =>
    fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  await call("evm_increaseTime", [seconds]);
  await call("evm_mine");
  const block = await (await call("eth_getBlockByNumber", ["latest", false])).json();
  return Number(BigInt(block.result.timestamp));
}
function check(cond, what) {
  if (!cond) throw new Error(`FAILED: ${what}`);
  console.log(`  ok: ${what}`);
}

const desk = await player(1);
const phone = await player(2, { phone: true });
const watcher = await player(3, { passkey: false });

step("Sign up on desktop and on the phone");
await signUp(desk);
await signUp(phone);

step("Create a game, then cancel it: the stake comes back");
const balanceText = async (p) => (await p.page.locator("header").innerText()).match(/([\d.]+) tUSD/)?.[1];
const before = await balanceText(desk);
await createGame(desk);
await click(desk, "Cancel & Refund");
await desk.page.getByText("This game was cancelled and refunded.").waitFor({ timeout: 60000 });
await go(desk, "/");
await desk.page.getByText(`${before} tUSD`).first().waitFor({ timeout: 30000 }).catch(async (e) => {
  await shot(desk, "fail-balance");
  console.log("  before:", before, "header now:", await desk.page.locator("header").innerText());
  throw e;
});
check(true, `balance back to ${before} tUSD after cancelling`);

step("The phone creates a game and plays White by tapping; desktop joins as Black");
const url = await createGame(phone);
check((await phone.page.getByRole("button", { name: "2D", exact: true }).getAttribute("aria-pressed")) === "true", "phone opens the game in 2D by default");
await join(desk, url);
await phone.page.getByText("White to move").waitFor({ timeout: 30000 });
await watcher.page.goto(url);
await watcher.page.getByText("You are spectating.").waitFor({ timeout: 60000 });
check(true, "a signed-out visitor can open the game and spectate");

const line = [
  [phone, "h2", "h4"], [desk, "g7", "g5"],
  [phone, "h4", "g5"], [desk, "g8", "f6"],
  [phone, "g5", "f6"], [desk, "h7", "h5"],
  [phone, "f6", "e7"], [desk, "h5", "h4"],
];
for (const [p, from, to] of line) await move(p, from, to, [phone, desk, watcher]);
await shot(phone, "phone-before-promotion");
step("Promotion by tapping: exf8=Q");
await move(phone, "e7", "f8", [phone, desk, watcher], "wQ");
await phone.page.locator('[data-square="f8"] [data-piece="wQ"]').waitFor({ timeout: 30000 });
check(true, "the pawn promoted to a queen on f8, and the spectator followed every move");
await shot(watcher, "spectator");

step("Draw by agreement");
await move(desk, "e8", "f8", [phone, desk, watcher]); // Kxf8
await click(desk, "Offer draw");
await idle(desk);
await click(phone, "Accept draw offer");
await phone.page.getByText("Finished - Draw").waitFor({ timeout: 60000 });
await watcher.page.getByText("Finished - Draw").waitFor({ timeout: 60000 });
check(true, "both sides and the spectator see the draw");
await shot(phone, "draw");

step("Going back through a finished game");
await phone.page.getByRole("button", { name: "First move" }).click();
await phone.page.getByText(/^Move 0 of \d+/).waitFor({ timeout: 10000 });
await phone.page.locator('[data-square="h2"] [data-piece="wP"]').waitFor({ timeout: 10000 });
check(true, "First move shows the starting position");
await phone.page.getByRole("button", { name: "Next move" }).click();
await phone.page.getByText(/^Move 1 of \d+/).waitFor({ timeout: 10000 });
await phone.page.locator('[data-square="h4"] [data-piece="wP"]').waitFor({ timeout: 10000 });
check(true, "Next move steps forward one move (h4)");
await phone.page.getByRole("button", { name: "Last move" }).click();
await phone.page.locator('[data-square="f8"] [data-piece="bK"]').waitFor({ timeout: 10000 });
check(true, "Last move returns to the final position");

step("Out of time: Black lets the clock run out, White claims the win");
const url2 = await createGame(desk, "3 + 2");
await join(phone, url2);
ply = 0;
await move(desk, "e2", "e4", [desk, phone]);
// Move the chain past Black's flag, then bring each browser's clock to the chain's time.
const chainNow = await chainTime(200);
for (const p of [desk, phone]) {
  await p.page.clock.setSystemTime(chainNow * 1000);
  await p.page.clock.fastForward(2000);
}
await phone.page.getByText("You ran out of time").first().waitFor({ timeout: 30000 }).catch(async (e) => {
  await shot(phone, "fail-timeout");
  console.log("  phone page:", (await phone.page.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 500));
  throw e;
});
check((await phone.page.getByRole("button", { name: "Resign", exact: true }).count()) === 0, "the player out of time is not offered Resign");
check((await phone.page.getByRole("button", { name: "Offer draw", exact: true }).count()) === 0, "nor Offer draw");
await shot(phone, "out-of-time-phone");
await shot(desk, "claim-desktop");
await click(desk, "Claim win on timeout");
await desk.page.getByText("Finished - White wins").waitFor({ timeout: 60000 });
check(true, "White wins on time after claiming");

step("Choosing a side: the creator plays Black");
const url3 = await createGame(desk, "5 + 3", "Black");
await go(phone, url3);
await click(phone, /^Join as White/);
await desk.page.getByText("White to move").waitFor({ timeout: 60000 });
await desk.page.getByText(/Black · .*\(you\)/).first().waitFor({ timeout: 30000 });
check(true, "the creator who chose Black sits as Black, and the joiner moves first as White");

await browser.close();
console.log("CORE FLOWS OK");
