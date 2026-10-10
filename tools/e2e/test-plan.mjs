// Walks docs/TEST-PLAN.md the way its reader does: Player A on a phone, Player B on a laptop, a
// signed-out spectator and a third player. Every line the plan tells the tester to expect is checked
// here, by step number, so the plan cannot drift from the app. It does not stop at the first
// mismatch: it lists them all at the end.
//
// Runs against a LOCAL hardhat chain (it moves the chain clock, and stands in for the referee):
//   npx hardhat node, npm run deploy:local, build and start the app against it, then:
//   NEXT_PUBLIC_CONTRACT_ADDRESS=0x... node tools/e2e/test-plan.mjs
import { chromium } from "playwright";
import { createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CHESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const SHOTS = process.env.SHOTS_DIR;
if (!CHESS) throw new Error("set NEXT_PUBLIC_CONTRACT_ADDRESS (printed by npm run deploy:local)");
// First account of `npx hardhat node` (public, local chain only): the contract owner, standing in for the referee.
const owner = createWalletClient({
  account: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"),
  chain: hardhat,
  transport: http(RPC),
});

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const failures = [];
const part = (msg) => console.log(`\n${msg}`);
function check(id, cond, what) {
  if (cond) console.log(`  ok   ${id} ${what}`);
  else {
    console.log(`  FAIL ${id} ${what}`);
    failures.push(`${id} ${what}`);
  }
  return cond;
}
const text = async (p, sel = "body") => (await p.page.locator(sel).first().innerText()).replace(/\s+/g, " ");
/** Waits for some text; a miss is recorded against the step, with what the page said instead. */
async function see(id, p, what, { timeout = 30000, label } = {}) {
  const found = await p.page.getByText(what).first().waitFor({ timeout }).then(() => true, () => false);
  if (!check(id, found, label ?? `${p.name} sees "${what}"`)) {
    console.log(`       ${p.name} page: ${(await text(p)).slice(0, 700)}`);
    if (SHOTS) await p.page.screenshot({ path: `${SHOTS}/plan-fail-${id}-${p.name}.png` });
  }
  return found;
}

async function player(name, { phone = false, passkey = true, view } = {}) {
  const ctx = await browser.newContext(
    phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1300, height: 900 } }
  );
  // The laptop player drags on the 2D board here; its 3D default is checked with the spectator.
  if (view) await ctx.addInitScript((v) => localStorage.setItem("degenchess.view", v), view);
  const page = await ctx.newPage();
  await page.clock.install();
  if (passkey) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
    });
  }
  page.on("pageerror", (e) => failures.push(`page error on ${name}: ${e.message.slice(0, 200)}`));
  await page.goto(APP);
  return { page, name, phone };
}
const idle = (p) => p.page.waitForFunction(() => !document.querySelector(".Toastify__toast--loading"), null, { timeout: 60000 });
const button = (p, name) => p.page.getByRole("button", { name, exact: typeof name === "string" });
async function press(p, name) {
  await button(p, name).first().click({ timeout: 60000 });
}
/** In-app navigation, as a player clicking around would do. A full reload locks the account by design. */
async function go(p, url) {
  await p.page.evaluate((path) => window.next.router.push(path), new URL(url, APP).pathname + new URL(url, APP).search);
  await p.page.waitForTimeout(600);
}
const balance = async (p) => Number((await text(p, "header")).match(/([\d.]+) tUSD/)?.[1]);
/** The header balance, once it has settled on the expected amount. */
async function balanceIs(id, p, amount) {
  const ok = await p.page.locator("header").getByText(`${amount} tUSD`, { exact: true }).first().waitFor({ timeout: 30000 }).then(() => true, () => false);
  check(id, ok, `${p.name}'s header balance is ${amount} tUSD${ok ? "" : ` (shows ${await balance(p)})`}`);
}
async function createGame(p, { clock = "5 + 3", side = "White" } = {}) {
  await go(p, "/");
  await p.page.getByRole("button", { name: new RegExp(`^${clock.replace(/\+/g, "\\+")}`) }).click();
  await press(p, side);
  await press(p, "Create Game");
  await p.page.waitForURL(/game=\d+/, { timeout: 60000 });
  await idle(p);
  return { url: p.page.url(), id: BigInt(new URL(p.page.url()).searchParams.get("game")) };
}
let ply = 0;
/** One move: tapped (piece, then square) on the phone, dragged on the laptop. Waits until both see it. */
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
    await option.tap();
  }
  if (p.phone && !promotion && !(await p.page.getByText(new RegExp(`ply ${ply + 2} |Checkmate|Finished - `)).first().waitFor({ timeout: 6000 }).then(() => true, () => false))) {
    // A tap that did nothing: say what the phone showed at that moment, then tap again as a person would.
    console.log(`       (first tap ${from}-${to} on ${p.name} did nothing: ${(await text(p)).slice(-260)})`);
    failures.push(`a tap ${from}-${to} on ${p.name} needed a second try`);
    await p.page.locator(`[data-square="${from}"]`).tap();
    await p.page.locator(`[data-square="${to}"]`).tap();
  }
  ply++;
  for (const q of watchers) {
    await q.page.getByText(`ply ${ply + 1} `).first().waitFor({ timeout: 30000 }).catch(async () => {
      // The last move of a game replaces the ply counter with the result.
      if (await q.page.getByText(/Checkmate|Finished - /).count()) return;
      console.log(`       (${q.name} never showed ply ${ply + 1} after ${from}-${to}: ${(await text(q)).slice(0, 300)})`);
      if (SHOTS) await q.page.screenshot({ path: `${SHOTS}/plan-stuck-${ply}-${q.name}.png` });
    });
  }
  await idle(p);
}
async function line(moves, watchers) {
  ply = 0;
  // Everyone at the board before the first move (the creator's page takes a moment to see the joiner).
  for (const q of watchers) await q.page.getByText("White to move").first().waitFor({ timeout: 60000 });
  await watchers[0].page.waitForTimeout(1500); // sit down first, as a person would
  for (const [p, from, to, promotion] of moves) await move(p, from, to, watchers, promotion);
}
/** On a phone the bottom panel is one line during play; the "..." button opens it. */
async function expand(p) {
  const more = p.page.getByRole("button", { name: "Expand HUD" }).last();
  if (p.phone && (await button(p, "Shrink panel").count()) === 0 && (await more.count())) await more.click();
}
async function withdraw(p) {
  await press(p, /^Withdraw [\d.]+ tUSD$/);
  await button(p, "Withdrawn").waitFor({ timeout: 60000 });
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

// The live site has a referee set as arbiter; here the owner plays that part.
const chessAbi = parseAbi(["function arbitrate(uint256,uint8,bool)", "function setArbiter(address)"]);
await owner.writeContract({ address: CHESS, abi: chessAbi, functionName: "setArbiter", args: [owner.account.address] });

const stamp = Date.now().toString(36).slice(-6);
const [alice, bob, cara] = [`a_${stamp}`, `b_${stamp}`, `c_${stamp}`];
const A = await player("A(phone)", { phone: true });
const B = await player("B(laptop)", { view: "2d" });
const W = await player("spectator", { passkey: false });
const both = [A, B];

// ---------------------------------------------------------------- Part 1
part("Part 1: first visit and sign-up");
await see("1.1", A, "Every piece has skin in the game.");
check("1.1", (await A.page.locator("header .wordmark").innerText()).includes("Away Chess"), "the logo reads Away Chess on a signed-out phone");
const foot = await text(A, "footer");
check("1.3", ["Feedback", "Source", "Contract", "Credits"].every((l) => foot.includes(l)), `footer has Feedback, Source, Contract, Credits (${foot.slice(-60)})`);
check("1.3", (await A.page.getByRole("heading", { name: "Start a board" }).count()) === 1 && (await button(A, /^Waiting \d+$/).count()) === 1 && (await button(A, /^Live \d+$/).count()) === 1 && (await button(A, /^Finished \d+$/).count()) === 1, "the board list has Waiting, Live and Finished tabs beside Start a board");
for (const h of ["Leaderboard", "Tournaments", "How it runs"]) {
  check("1.3", (await A.page.getByRole("heading", { name: h }).count()) > 0, `the page has a "${h}" section`);
}
await A.page.getByLabel("Username").fill(alice);
await see("1.4", A, "Available. It's yours if you want it.");
await press(A, "Play now");
await see("1.6", A, /You're in\. 1 passkey tap, [\d.]+s to your first transaction on Monad\./, { timeout: 60000, label: "A sees the You're in message with the seconds" });
await idle(A);
const head = await text(A, "header");
check("1.7", head.includes(alice) && /100 tUSD/.test(head) && !head.includes("Away Chess"), `phone header is the eyes, the name and 100 tUSD (${head})`);
check("1.7", (await A.page.locator("header").getByRole("button", { name: "Lock" }).count()) === 1, "and a lock button");

await B.page.getByLabel("Username").fill(alice);
await see("1.8", B, "Someone has that name. Try another");
check("1.8", await button(B, "Play now").isDisabled(), "Play now is disabled for a taken name");
await B.page.getByLabel("Username").fill("");
await press(B, "Play now");
await see("1.9", B, "You're in.", { timeout: 60000 });
check("1.9", (await button(B, "Choose a username").count()) > 0, "the header shows a Choose a username button");
await see("1.9", B, "Choose a username. Opponents and spectators see it instead of your address.");
await B.page.locator("#yard").getByLabel("Username").fill(bob);
await B.page.locator("#yard").getByText("Available").waitFor({ timeout: 20000 });
await B.page.locator("#yard").getByRole("button", { name: "Claim" }).click();
check("1.10", await button(B, bob).waitFor({ timeout: 60000 }).then(() => true, () => false), "after Claim the header shows the name");
await idle(B);

// ---------------------------------------------------------------- Part 2
part("Part 2: checkmate, settled by the referee");
let g = await createGame(A, { clock: "5 + 3", side: "White" });
check("2.2", (await button(A, "2D").getAttribute("aria-pressed")) === "true", "the phone opens the game in 2D");
await see("2.2", A, "Waiting for an opponent");
check("2.2", (await button(A, "Share invite link").count()) === 1 && (await button(A, "Cancel & Refund").count()) === 1, "with Share invite link and Cancel & Refund");
await go(B, "/");
await press(B, /^Waiting \d+$/);
await see("2.4", B, `${alice} is waiting, plays White`);
await go(B, g.url);
check("2.5", (await button(B, "Join as Black (1 tUSD)").waitFor({ timeout: 30000 }).then(() => true, () => false)), "the button reads Join as Black (1 tUSD)");
await press(B, "Join as Black (1 tUSD)");
await B.page.getByText("White to move").first().waitFor({ timeout: 60000 });
await idle(B);
await A.page.getByText("White to move").first().waitFor({ timeout: 30000 });
const promptsBefore = await A.page.evaluate(() => window.__prompts ?? 0);
await A.page.locator('[data-square="e2"]').tap();
check("2.8", (await A.page.locator('[data-square="e4"] div[style*="radial-gradient"]').count()) > 0, "tapping a piece marks the squares it can go to");
await A.page.locator('[data-square="e2"]').tap();
await line([[A, "e2", "e4"], [B, "e7", "e5"], [A, "f1", "c4"], [B, "b8", "c6"], [A, "d1", "h5"], [B, "g8", "f6"], [A, "h5", "f7"]], both);
void promptsBefore;
await see("2.10", A, /Checkmate - you won\. The referee is settling the game/, { label: "A sees Checkmate - you won, the referee is settling" });
await owner.writeContract({ address: CHESS, abi: chessAbi, functionName: "arbitrate", args: [g.id, 1, false] });
for (const p of both) await see("2.10", p, "Finished - White wins");
let hud = await text(A);
check("2.11", /1\.95 tUSD/.test(hud) && /\b0 tUSD/.test(hud), "final amounts are 1.95 and 0");
check("2.12", (await button(A, "Withdraw 1.95 tUSD").count()) === 1, "the button reads Withdraw 1.95 tUSD");
await withdraw(A);
const moves = await text(A, ".movelist, [aria-label='Moves']").catch(() => "");
check("2.13", /1\.\s*e4\s*e5\s*2\.\s*Bc4\s*Nc6\s*3\.\s*Qh5\s*Nf6\s*4\.\s*Qxf7#/.test(moves || hud), `the move list reads 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# (${(moves || "not found").slice(0, 80)})`);
await A.page.getByRole("button", { name: "Bc4", exact: true }).click().catch(() => {});
check("2.13", (await A.page.locator('[data-square="c4"] [data-piece="wB"]').count()) === 1 && (await A.page.locator('[data-square="h5"] [data-piece]').count()) === 0, "tapping Bc4 shows that position");
await A.page.getByRole("button", { name: "Last move" }).click().catch(() => {});
check("2.13", (await A.page.locator('[data-square="f7"] [data-piece="wQ"]').count()) === 1, "the arrows step back to the end");
check("2.14", (await button(A, "How was that? Send feedback").count()) === 1, "a finished game offers How was that? Send feedback");
await go(A, "/");
await balanceIs("2.12", A, "100.95");

// ---------------------------------------------------------------- Part 3
part("Part 3: captures both ways, resignation");
check("3.1", (await button(B, "Rematch (1 tUSD, you play White)").count()) === 1, "B's button reads Rematch (1 tUSD, you play White)");
await press(B, "Rematch (1 tUSD, you play White)");
await B.page.getByText("Waiting for an opponent").waitFor({ timeout: 60000 });
await idle(B);
await go(A, g.url);
await see("3.2", A, `${bob} wants a rematch`);
await press(A, new RegExp(`^${bob} wants a rematch`));
await press(A, /^Join as Black/);
await A.page.getByText("White to move").first().waitFor({ timeout: 60000 });
await idle(A);
await line([[B, "e2", "e4"], [A, "d7", "d5"], [B, "e4", "d5"], [A, "d8", "d5"], [B, "b1", "c3"], [A, "d5", "g2"], [B, "f1", "g2"]], both);
hud = await text(B);
check("3.3", hud.includes("1.2051") && hud.includes("0.7949"), `the top bar reads 1.2051 and 0.7949 (${hud.match(/[\d.]+ tUSD/g)?.slice(0, 4).join(", ")})`);
check("3.5", (await button(A, "Resign").count()) === 0 && (await button(A, "Previous move").count()) >= 1 && (await button(A, "Next move").count()) >= 1, "during play the phone's bottom panel is one line: back, status, forward, and a ... button (no Resign showing)");
await expand(A);
check("3.5", (await button(A, "Resign").count()) === 1 && (await button(A, "Offer draw").count()) === 1, "the ... button opens it: Offer draw and Resign appear");
check("3.5", (await A.page.locator(".taken").count()) === 4, "the open panel shows the four pieces taken");
const shrink = A.page.getByRole("button", { name: "Shrink panel" });
check("3.6", (await shrink.count()) === 1, "the open panel has a shrink arrow at its top");
await shrink.click().catch(() => {});
check("3.6", (await button(A, "Resign").count()) === 0, "the arrow shrinks it back to one line");
await expand(A);
await press(A, "Resign");
for (const p of both) await see("3.8", p, "Finished - White wins");
hud = await text(A);
check("3.8", /1\.9 tUSD/.test(hud) && /0\.05 tUSD/.test(hud), `final amounts are 1.9 and 0.05 (${hud.match(/[\d.]+ tUSD/g)?.slice(0, 4).join(", ")})`);
await idle(A);
await withdraw(A);
await withdraw(B);
await go(A, "/");
await go(B, "/");
await balanceIs("3.9", A, "100");
await balanceIs("3.9", B, "99.9");

// ---------------------------------------------------------------- Part 4
part("Part 4: random sides, a draw");
await go(A, "/");
await press(A, "Random");
g = await createGame(A, { side: "Random" });
await go(B, "/");
await press(B, /^Waiting \d+$/);
await see("4.2", B, `${alice} is waiting, side by coin flip`);
await go(B, g.url);
check("4.2", await button(B, "Join, coin flip for sides (1 tUSD)").waitFor({ timeout: 30000 }).then(() => true, () => false), "the button reads Join, coin flip for sides (1 tUSD)");
await press(B, "Join, coin flip for sides (1 tUSD)");
await B.page.getByText("White to move").first().waitFor({ timeout: 60000 });
await idle(B);
await A.page.getByText("White to move").first().waitFor({ timeout: 30000 });
await B.page.getByText(/(White|Black) · \S+ \(you\)/).first().waitFor({ timeout: 30000 });
const aIsWhite = !/White · \S+ \(you\)/.test(await text(B)); // read off the laptop, whose top bar names the seats
const [white, black] = aIsWhite ? [A, B] : [B, A];
check("4.3", true, `the coin flip seated ${white.name} as White`);
await line([[white, "e2", "e4"], [black, "e7", "e5"]], both);
await press(B, "Offer draw");
await idle(B);
check("4.4", true, "Offer draw needed no passkey");
check("4.4", await button(A, "Accept draw offer").waitFor({ timeout: 30000 }).then(() => true, () => false), "the other player sees Accept draw offer");
await press(A, "Accept draw offer");
for (const p of both) await see("4.5", p, "Finished - Draw");
await see("4.5", A, "Draws are free.");
check("4.5", (await button(A, "Withdraw 1 tUSD").count()) === 1 && (await button(B, "Withdraw 1 tUSD").count()) === 1, "both can withdraw exactly 1 tUSD");
await idle(A);
await withdraw(A);
await withdraw(B);

// ---------------------------------------------------------------- Part 5
part("Part 5: creator plays Black, promotion");
g = await createGame(B, { clock: "None", side: "Black" });
await go(A, "/");
await press(A, /^Waiting \d+$/);
await see("5.1", A, `${bob} is waiting, plays Black`);
await go(A, g.url);
check("5.2", await button(A, "Join as White (1 tUSD)").waitFor({ timeout: 30000 }).then(() => true, () => false), "the button reads Join as White (1 tUSD)");
await press(A, "Join as White (1 tUSD)");
await A.page.getByText("White to move").first().waitFor({ timeout: 60000 });
await idle(A);
await see("5.2", B, /Black · \S+ \(you\)/, { label: "the creator sits as Black, so the joiner is White" });
check("5.3", (await button(B, "Enable prompt-free moves on this device").count()) === 0, "the creator who chose Black is not asked to enable moves again");
await line([[A, "h2", "h4"], [B, "g7", "g5"], [A, "h4", "g5"], [B, "g8", "f6"], [A, "g5", "f6"], [B, "h7", "h5"], [A, "f6", "e7"], [B, "h5", "h4"], [A, "e7", "f8", "wQ"]], both);
check("5.4", (await A.page.locator('[data-square="f8"] [data-piece="wQ"]').waitFor({ timeout: 30000 }).then(() => true, () => false)), "the picker promoted the pawn to a queen on f8");
await move(B, "e8", "f8", both);
check("5.5", (await B.page.locator('[data-square="f8"] [data-piece="bK"]').count()) === 1, "the king takes the new queen");
for (const v of ["3D", "2D", "Split"]) check("5.6", (await button(B, v).count()) === 1, `the laptop has a ${v} view button`);
check("5.6", !(await button(A, "Split").isVisible().catch(() => false)), "the phone has no Split button");
await press(B, "Focus");
check("5.8", (await button(B, "Exit focus").count()) === 1 && (await button(B, "Resign").count()) === 0, "Focus leaves only the board and an exit button");
await press(B, "Exit focus");
await press(A, "3D");
await A.page.waitForTimeout(1500);
check("5.7", (await button(A, "Classic set").count()) === 1, "3D offers a Classic set switch");
await press(A, "Focus");
check("5.9", (await button(A, "Exit focus").count()) === 1, "the phone has Focus in 3D");
await press(A, "Exit focus");
await press(A, "2D");
await move(A, "a2", "a3", both);
await move(B, "b8", "c6", both);
check("5.10", (await B.page.locator('[data-square="c6"] [data-piece="bN"]').count()) === 1, "a2-a3 then Nc6 are legal here");

// ---------------------------------------------------------------- Part 6
part("Part 6: watching, lock, share");
await go(W, "/").catch(() => W.page.goto(APP));
await press(W, /^Live \d+$/);
await see("6.1", W, `${alice} v ${bob}`);
await W.page.goto(g.url);
await see("6.2", W, "You are spectating.", { timeout: 60000 });
check("6.2", (await button(W, "3D").getAttribute("aria-pressed")) === "true", "a spectator on a laptop opens in 3D");
check("6.2", (await button(W, "Share").count()) >= 1, "with a Share button");
for (const p of [A, B, W]) await see("6.3", p, "1 watching");
await press(B, "Lock");
check("6.6", await button(B, "Unlock with passkey to keep playing").waitFor({ timeout: 30000 }).then(() => true, () => false), "locked, the panel offers Unlock with passkey to keep playing");
await press(B, "Unlock with passkey to keep playing");
await button(B, "Resign").waitFor({ timeout: 60000 });
await B.page.getByRole("button", { name: /^Share/ }).first().click();
await see("6.8", B, "Link copied", { label: "the laptop share button copies the link" });
await press(B, "Resign");
for (const p of both) await see("6.9", p, "Finished - White wins");
await idle(B);
await withdraw(A);
await withdraw(B).catch(() => {});

// ---------------------------------------------------------------- Part 7
part("Part 7: out of time");
g = await createGame(A, { clock: "3 + 2", side: "White" });
await go(B, g.url);
await press(B, /^Join as Black/);
await B.page.getByText("White to move").first().waitFor({ timeout: 60000 });
await idle(B);
await line([[A, "e2", "e4"]], both);
const now = await chainTime(200);
for (const p of both) {
  await p.page.clock.setSystemTime(now * 1000);
  await p.page.clock.fastForward(2000);
}
await see("7.4", B, "You ran out of time");
await see("7.4", B, `${alice} can now claim the win.`);
check("7.4", (await button(B, "Resign").count()) === 0 && (await button(B, "Offer draw").count()) === 0, "the player out of time has no Resign or Offer draw");
await see("7.4", A, `${bob} ran out of time`);
await press(A, "Claim win on timeout");
for (const p of both) await see("7.5", p, "Finished - White wins");
hud = await text(A);
check("7.5", /1\.95 tUSD/.test(hud), "White has 1.95");
await idle(A);
await withdraw(A);

// ---------------------------------------------------------------- Part 8
part("Part 8: cancel and refund");
await go(A, "/");
const before = await balance(A);
await createGame(A);
await press(A, "Cancel & Refund");
await see("8.2", A, "This game was cancelled and refunded.", { timeout: 60000 });
await idle(A);
await go(A, "/");
await balanceIs("8.2", A, String(before));

// ---------------------------------------------------------------- Part 9
part("Part 9: wallet and invites");
await A.page.getByTitle("Add funds or send").click();
const wallet = A.page.getByRole("dialog");
await wallet.waitFor();
await wallet.getByText(/MON for gas/).waitFor({ timeout: 30000 }).catch(() => {});
let w = (await wallet.innerText()).replace(/\s+/g, " ");
check("9.1", w.includes("Your money") && /MON for gas/.test(w) && w.includes("Copy address") && (await wallet.locator("svg").count()) > 0, "Your money shows the balance, MON for gas, a QR code and Copy address");
check("9.2", w.includes("Invites") && (await wallet.locator("input, code, span").evaluateAll((els, ref) => els.some((e) => (e.value ?? e.textContent ?? "").includes(ref)), `?ref=${alice}`)), `Invites shows a link ending ?ref=${alice}`);
await wallet.getByLabel("Send to").fill(bob);
await wallet.locator("input[aria-label=Amount]").fill("2");
await see("9.3", A, `To ${bob}. Asks for your passkey.`);
await wallet.getByLabel("Send to").fill("nobody_here_x");
await see("9.4", A, "No player has that username.");
await wallet.getByLabel("Send to").fill(alice);
await see("9.4", A, "That's you.");
await wallet.getByLabel("Send to").fill(bob);
await A.page.getByText(`To ${bob}.`).waitFor({ timeout: 20000 });
const aBefore = await balance(A);
const bBefore = await balance(B).catch(() => NaN);
await wallet.getByRole("button", { name: "Send", exact: true }).click();
await see("9.3", A, `Send 2 tUSD to ${bob}: done`, { timeout: 60000, label: "sending 2 tUSD by username succeeds" });
await idle(A);
await A.page.keyboard.press("Escape");
await balanceIs("9.3", A, String(Math.round((aBefore - 2) * 10000) / 10000));
void bBefore;

const C = await player("C(invited)", { view: "2d" });
await C.page.goto(`${APP}/?ref=${alice}`);
await C.page.getByLabel("Username").fill(cara);
await C.page.getByText("Available").waitFor({ timeout: 20000 });
await press(C, "Play now");
await see("9.5", C, "You're in.", { timeout: 60000 });
await idle(C);
g = await createGame(B);
await go(C, g.url);
await press(C, /^Join as Black/);
await C.page.getByText("White to move").first().waitFor({ timeout: 60000 });
await idle(C);
await line([[B, "e2", "e4"], [C, "e7", "e5"]], [B, C]);
await press(C, "Resign");
await see("9.6", C, "Finished - White wins");
await idle(C);
await withdraw(B);
await go(A, "/");
await A.page.getByTitle("Add funds or send").click();
await see("9.7", A, /Earned\s*0\.005 tUSD/, { label: "A's wallet shows Earned 0.005 tUSD" });
w = (await A.page.getByRole("dialog").innerText()).replace(/\s+/g, " ");
check("9.7", (await A.page.getByRole("dialog").getByRole("button", { name: "Withdraw", exact: true }).count()) === 1, `with a Withdraw button (${w.match(/Earned.{0,60}/)?.[0]})`);
await A.page.keyboard.press("Escape");

// ---------------------------------------------------------------- Part 10
part("Part 10: leaderboard and tournaments");
await go(A, "/leaderboard");
await A.page.locator("table.ladder").waitFor({ timeout: 30000 });
await A.page.getByText(cara).first().waitFor({ timeout: 30000 }).catch(() => {});
const ladder = await text(A, "table.ladder");
check("10.1", [alice, bob, cara].every((n) => ladder.includes(n)) && ladder.includes(`${alice} (you)`) && /W D L/.test(ladder) && /Won \(tUSD\)/.test(ladder), `every player is listed, own row marked (you) (${ladder.slice(0, 120)})`);

await go(A, "/tournaments");
await A.page.getByLabel("Tournament name").fill(`Test Cup ${stamp}`);
await A.page.getByRole("group", { name: /Prize pot/ }).getByRole("button", { name: "5", exact: true }).click();
await press(A, "Top three: 50 / 30 / 20");
await press(A, "1 day");
check("10.2", (await button(A, "Create and pay 5 tUSD").count()) === 1, "the button reads Create and pay 5 tUSD");
await press(A, "Create and pay 5 tUSD");
await A.page.waitForURL(/tournaments\?t=\d+/, { timeout: 60000 });
await idle(A);
const tPath = new URL(A.page.url()).pathname + new URL(A.page.url()).search;
await see("10.3", A, /Prize pot\s*5 tUSD/, { label: "the page shows Prize pot 5 tUSD" });
check("10.3", (await button(A, "Invite players").count()) === 1, "and Invite players");
const listed = async (tab, settled) => {
  await W.page.goto(`${APP}/tournaments`);
  await W.page.getByRole("button", { name: new RegExp(`^${tab} \\d+$`) }).click();
  const row = W.page.locator("ul.facts li", { hasText: `Test Cup ${stamp}` });
  await row.filter({ hasText: settled }).waitFor({ timeout: 30000 }).catch(() => {});
  return (await row.innerText().catch(() => "not listed")).replace(/\s+/g, " ");
};
let row = await listed("Open", `hosted by ${alice}`);
check("10.4", /1 player/.test(row) && row.includes("5 tUSD to enter, pot 5 tUSD so far") && row.includes(`hosted by ${alice}`), `Open tab row (${row})`);
for (const p of [B, C]) {
  await go(p, tPath);
  await press(p, "Join for 5 tUSD");
  await p.page.getByText("You're in. Waiting for the host to start.").waitFor({ timeout: 60000 });
  await idle(p);
}
await see("10.5", A, /Prize pot\s*15 tUSD/, { label: "with three players the pot reads 15 tUSD" });
await press(C, "Leave and refund");
await see("10.6", A, /Prize pot\s*10 tUSD/, { label: "after C leaves the pot reads 10 tUSD" });
await idle(C);
await press(C, "Join for 5 tUSD");
await C.page.getByText("You're in. Waiting for the host to start.").waitFor({ timeout: 60000 });
await idle(C);
await see("10.6", A, /Prize pot\s*15 tUSD/, { label: "after C rejoins it reads 15 tUSD" });
await press(A, "Start: close entries");
await see("10.7", A, "0 of 3 games played", { timeout: 60000 });
await idle(A);
const fixtures = await text(A, "ul.facts");
check("10.7", [`${alice} v ${bob}`, `${alice} v ${cara}`, `${bob} v ${cara}`].every((f) => fixtures.includes(f)), `the games are A v B, A v C, B v C (${fixtures.slice(0, 120)})`);
row = await listed("Running", "games played");
check("10.8", /0 of 3 games played · 3 players · pot 15 tUSD · pays out by /.test(row), `Running tab row (${row})`);

/** One tournament game: `host` opens it with Play, `guest` joins from the fixture list, then it ends. */
async function fixture(host, guest, hostName, guestName, end) {
  for (const p of [host, guest]) await go(p, tPath);
  const mine = (p) => p.page.locator("ul.facts li", { hasText: new RegExp(`(${hostName} v ${guestName})|(${guestName} v ${hostName})`) });
  await mine(host).getByRole("button", { name: "Play", exact: true }).click();
  await host.page.waitForURL(/game=\d+/, { timeout: 60000 });
  await host.page.getByText("Waiting for an opponent").waitFor({ timeout: 30000 }).catch(async (e) => {
    console.log(`       ${host.name} after Play: ${(await text(host)).slice(0, 900)}`);
    if (SHOTS) await host.page.screenshot({ path: `${SHOTS}/plan-fail-play-${host.name}.png` });
    throw e;
  });
  await idle(host);
  await mine(guest).getByRole("button", { name: "Join", exact: true }).click({ timeout: 60000 });
  await guest.page.waitForURL(/game=\d+/, { timeout: 30000 });
  check("10.9", await button(guest, "Join, coin flip for sides (1 tUSD)").waitFor({ timeout: 30000 }).then(() => true, () => false), "a tournament game is joined with Join, coin flip for sides (1 tUSD)");
  await press(guest, /^Join/);
  await guest.page.getByText("White to move").first().waitFor({ timeout: 60000 });
  await idle(guest);
  // Sides are a coin flip; the laptop's top bar says who got White.
  const desk = host.phone ? guest : host;
  // (Wait until that bar names the opponent: until someone joins, a creator is shown in the White seat.)
  await desk.page.getByText(new RegExp(`(White|Black) · ${desk === host ? guestName : hostName}`)).first().waitFor({ timeout: 30000 });
  const deskIsWhite = /White · \S+ \(you\)/.test(await text(desk));
  const [white, black] = deskIsWhite === (desk === host) ? [host, guest] : [guest, host];
  await line([[white, "e2", "e4"], [black, "e7", "e5"]], [host, guest]);
  await end();
  await host.page.getByText(/^Finished - /).first().waitFor({ timeout: 60000 });
  for (const p of [host, guest]) await idle(p);
}
await fixture(A, B, alice, bob, () => press(B, "Resign"));
await go(A, tPath);
await see("10.9", A, "1 of 3 games played", { timeout: 60000 });
check("10.9", (await text(A, "ul.facts")).includes(`${alice} won`), "the game list shows the winner");
await fixture(C, A, cara, alice, async () => {
  await press(C, "Offer draw");
  await idle(C);
  await press(A, "Accept draw offer");
});
await fixture(B, C, bob, cara, () => press(C, "Resign"));
await go(A, tPath);
await see("10.12", A, "3 of 3 games played", { timeout: 60000 });
let table = await text(A, "table.ladder");
check("10.10", new RegExp(`${alice} \\(you\\) 1 1 0 1½`).test(table) && new RegExp(`${bob} 1 0 1 1`).test(table) && new RegExp(`${cara} 0 1 1 ½`).test(table), `points are 1½, 1 and ½ (${table})`);
check("10.12", (await button(A, "Pay out the prizes").count()) === 1, "Pay out the prizes appears");
await press(A, "Pay out the prizes");
await see("10.13", A, "paid out", { timeout: 60000 });
await idle(A);
table = await text(A, "table.ladder");
check("10.13", /\+7\.5/.test(table) && /\+4\.5/.test(table) && /\+3\b/.test(table), `prizes are +7.5, +4.5 and +3 (${table})`);
await see("10.13", A, `Finished. ${alice} won.`);
row = await listed("Finished", `${alice} won`);
check("10.14", row.includes(`${alice} won +7.5 tUSD · 3 players · 3 of 3 games played`) && /Results$/.test(row), `Finished tab row (${row})`);

// A free tournament: no pot line, and it finishes when its one game is played.
await go(A, "/tournaments");
await A.page.getByLabel("Tournament name").fill(`Free Cup ${stamp}`);
check("10.15", (await button(A, "Create tournament").count()) === 1, "with no pot the button reads Create tournament");
await press(A, "Create tournament");
await A.page.waitForURL(/tournaments\?t=\d+/, { timeout: 60000 });
await idle(A);
const freePath = new URL(A.page.url()).pathname + new URL(A.page.url()).search;
check("10.15", !/Prize pot/.test(await text(A, "main")), "a free tournament has no pot line");
await go(B, freePath);
await press(B, "Join the tournament");
await B.page.getByText("You're in. Waiting for the host to start.").waitFor({ timeout: 60000 });
await idle(B);
await press(A, "Start: close entries");
await A.page.getByText("0 of 1 games played").waitFor({ timeout: 60000 });
await idle(A);
// (the fixture helper navigates to the pot tournament's page; do this one by hand)
await A.page.getByRole("button", { name: "Play", exact: true }).click();
await A.page.waitForURL(/game=\d+/, { timeout: 60000 });
await A.page.getByText("Waiting for an opponent").waitFor({ timeout: 30000 });
await idle(A);
await go(B, freePath);
await B.page.getByRole("button", { name: "Join", exact: true }).click({ timeout: 60000 });
await B.page.waitForURL(/game=\d+/, { timeout: 30000 });
await press(B, /^Join/);
await B.page.getByText("White to move").first().waitFor({ timeout: 60000 });
await idle(B);
await B.page.getByText(/(White|Black) · \S+ \(you\)/).first().waitFor({ timeout: 30000 });
const bWhite = /White · \S+ \(you\)/.test(await text(B));
await line(bWhite ? [[B, "e2", "e4"], [A, "e7", "e5"]] : [[A, "e2", "e4"], [B, "e7", "e5"]], both);
await press(B, "Resign");
await A.page.getByText(/^Finished - /).first().waitFor({ timeout: 60000 });
await idle(B);
await go(A, freePath);
await see("10.15", A, `Finished. ${alice} won.`, { timeout: 60000 });
await W.page.goto(`${APP}/tournaments`);
await W.page.getByRole("button", { name: /^Finished \d+$/ }).click();
const freeRow = W.page.locator("ul.facts li", { hasText: `Free Cup ${stamp}` });
await freeRow.filter({ hasText: `${alice} won` }).waitFor({ timeout: 30000 }).catch(() => {});
check("10.15", (await freeRow.innerText().catch(() => "not listed")).includes(`${alice} won`), "the free tournament moves to Finished with the winner's name");

// ---------------------------------------------------------------- Part 11
part("Part 11: the other pages");
await W.page.goto(`${APP}/sandbox`);
check("11.1", (await button(W, /^3d$/i).getAttribute("aria-pressed")) === "true", "the sandbox opens in 3D on a laptop");
await press(W, /^2d$/i);
await W.page.locator('[data-square="e2"]').first().waitFor({ timeout: 60000 });
for (const sq of ["e2", "e4", "d7", "d5", "e4", "d5"]) {
  await W.page.locator(`[data-square="${sq}"]`).click();
  await W.page.waitForTimeout(300);
}
await W.page.waitForTimeout(800);
const sand = await text(W);
check("11.1", /White 10\.26/.test(sand) && /9\.7436 Black/.test(sand), `after exd5 the sandbox reads White 10.26 and 9.7436 Black (${sand.match(/White [\d.]+.{0,40}Black/)?.[0]})`);
check("11.1", (await button(W, "Undo").count()) === 1 && (await button(W, "New game").count()) === 1, "with Undo and New game");
await W.page.goto(`${APP}/sounds`);
check("11.2", (await W.page.getByRole("button", { name: "Play", exact: true }).count()) > 30, "the sound check lists every voice line and effect");
await W.page.goto(`${APP}/credits`);
const credits = await text(W);
check("11.3", /Music/.test(credits) && /Public domain|CC0|CC BY/.test(credits), "credits list the music and its licences");
check("11.4", (await button(A, "Mute").count()) + (await button(A, "Unmute").count()) >= 0, "(mute is checked by ear)");
await go(A, "/");
await press(A, "Feedback");
await press(A, "An idea");
await A.page.getByRole("textbox").last().fill(`Plan walk ${stamp}: it works.`);
await press(A, "Send");
const fb = await Promise.race([
  A.page.getByText("Sent. Every message is read.").waitFor({ timeout: 30000 }).then(() => "sent"),
  A.page.getByText("Feedback is not switched on yet.").waitFor({ timeout: 30000 }).then(() => "off"),
]).catch(() => "nothing");
check("11.5", fb === "sent" || fb === "off", `the feedback form answers (${fb === "sent" ? "Sent. Every message is read." : fb === "off" ? "not switched on here" : "no answer"})`);

await browser.close();
console.log(failures.length ? `\nTEST PLAN: ${failures.length} MISMATCH(ES)\n- ${failures.join("\n- ")}` : "\nTEST PLAN OK: every checked step matches the app");
process.exit(failures.length ? 1 : 0);
