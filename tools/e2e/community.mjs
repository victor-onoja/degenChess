// End-to-end checks for the community features: a tournament with a prize pot from creation to
// payout (and where it sits in the Open / Running / Finished lists), the audience count on a live
// game, the leaderboard, and the feedback form.
//   (app running against a local chain or testnet) node tools/e2e/community.mjs
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR;
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const step = (msg) => console.log("-", msg);
const errors = [];
const check = (cond, what) => {
  if (!cond) throw new Error(`FAILED: ${what}`);
  console.log(`  ok: ${what}`);
};

async function player(n, passkey = true) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem("degenchess.view", "2d");
    localStorage.setItem("degenchess.watchView", "2d");
  });
  const page = await ctx.newPage();
  if (passkey) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
    });
  }
  page.on("pageerror", (e) => errors.push(`P${n}: ${e.message.slice(0, 200)}`));
  await page.goto(APP);
  return page;
}
const idle = (page) => page.waitForFunction(() => !document.querySelector(".Toastify__toast--loading"), null, { timeout: 60000 });
const go = async (page, path) => {
  await page.evaluate((p) => window.next.router.push(p), path);
  await page.waitForTimeout(600);
};
async function signUp(page, name) {
  await page.getByLabel("Username").fill(name);
  await page.getByText("Available").waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Play now", exact: true }).click();
  await page.getByText("You're in.").waitFor({ timeout: 60000 });
  await idle(page);
}

const stamp = Date.now().toString(36).slice(-6);
const [alice, bob] = [`al_${stamp}`, `bo_${stamp}`];
const a = await player(1);
const b = await player(2);
const watcher = await player(3, false);

step("Two players sign up");
await signUp(a, alice);
await signUp(b, bob);

step("Alice creates a tournament; Bob joins from its link; Alice starts it");
await go(a, "/tournaments");
await a.getByLabel("Tournament name").fill(`Cup ${stamp}`);
// The host's choices: a 5 tUSD entry fee into a pot, winner takes all (the default split), one day.
await a.getByRole("group", { name: /Prize pot/ }).getByRole("button", { name: "5", exact: true }).click();
await a.getByRole("button", { name: "1 day" }).click();
await a.getByRole("button", { name: "Create and pay 5 tUSD" }).click();
await a.waitForURL(/tournaments\?t=\d+/, { timeout: 60000 });
await idle(a);
const tournamentPath = new URL(a.url()).pathname + new URL(a.url()).search;
// The list as a visitor sees it: one row for this cup, under the tab for its state.
// (Waits for `settled` text, since usernames arrive a moment after the row on a real network.)
const listed = async (tab, settled) => {
  await watcher.goto(`${APP}/tournaments`);
  await watcher.getByRole("button", { name: new RegExp(`^${tab} \\d+$`) }).click();
  const row = watcher.locator("ul.facts li", { hasText: `Cup ${stamp}` });
  await row.filter({ hasText: settled }).waitFor({ timeout: 30000 }).catch(() => {});
  return (await row.innerText()).replace(/\s+/g, " ");
};
let row = await listed("Open", `hosted by ${alice}`);
check(/1 player/.test(row) && /5 tUSD to enter, pot 5 tUSD so far/.test(row) && row.includes(`hosted by ${alice}`) && /Join$/.test(row), `listed under Open (${row})`);
await go(b, tournamentPath);
await b.getByRole("button", { name: "Join for 5 tUSD" }).click();
await b.getByText("You're in. Waiting for the host to start.").waitFor({ timeout: 60000 });
await idle(b);
await a.getByRole("button", { name: "Start: close entries" }).click();
await a.getByText("0 of 1 games played").waitFor({ timeout: 60000 });
await idle(a);
await a.getByText(/Prize pot\s*10 tUSD/).waitFor({ timeout: 30000 });
check(true, "tournament created with a 5 tUSD entry fee, joined and started: the pot is 10 tUSD");
row = await listed("Running", "games played");
check(/0 of 1 games played · 2 players · pot 10 tUSD · pays out by /.test(row) && /Standings$/.test(row), `listed under Running (${row})`);

step("They play their game from the tournament page");
await a.getByRole("button", { name: "Play", exact: true }).click();
await a.waitForURL(/game=\d+/, { timeout: 60000 });
await a.getByText("Waiting for an opponent").waitFor({ timeout: 30000 });
await idle(a);
const gameUrl = a.url();
await b.getByRole("button", { name: "Join", exact: true }).click();
await b.waitForURL(/game=\d+/, { timeout: 30000 });
await b.getByRole("button", { name: /^Join/ }).first().click();
await b.getByText(/(White|Black) to move/).first().waitFor({ timeout: 60000 });
await idle(b);
check(true, "the opponent joined the game from the tournament's fixture list");

step("A spectator opens the game: the players see someone watching");
await watcher.goto(gameUrl);
await watcher.getByText("You are spectating.").waitFor({ timeout: 60000 });
await a.getByText("1 watching").waitFor({ timeout: 30000 });
await watcher.getByText("1 watching").waitFor({ timeout: 30000 });
check(true, "players and the spectator see \"1 watching\"");
if (SHOTS) await a.screenshot({ path: `${SHOTS}/community-watching.png` });

step("Bob resigns; the standings and the leaderboard pick it up");
await b.getByRole("button", { name: "Resign", exact: true }).click();
await a.getByText(/^Finished - /).waitFor({ timeout: 60000 });
await idle(b);
await go(a, tournamentPath);
await a.getByText("1 of 1 games played").waitFor({ timeout: 60000 });
const table = await a.locator("table.ladder").innerText();
check(new RegExp(`${alice}[\\s\\S]*1 0 0[\\s\\S]*1`).test(table), `standings credit the winner (${table.replace(/\s+/g, " ").slice(0, 90)})`);
await a.getByRole("button", { name: "Pay out the prizes" }).click();
await a.getByText("paid out").waitFor({ timeout: 60000 });
await idle(a);
const paid = await a.locator("table.ladder").innerText();
check(/\+10/.test(paid), `the winner is paid the whole pot (${paid.replace(/\s+/g, " ").slice(0, 100)})`);
await a.getByText(`Finished. ${alice} won.`).waitFor({ timeout: 30000 });
check(true, "the tournament page names the winner");
if (SHOTS) await a.screenshot({ path: `${SHOTS}/community-tournament.png`, fullPage: true });
row = await listed("Finished", `${alice} won`);
check(row.includes(`${alice} won +10 tUSD`) && /1 of 1 games played/.test(row) && /Results$/.test(row), `listed under Finished (${row})`);
if (SHOTS) await watcher.screenshot({ path: `${SHOTS}/community-tournament-list.png` });
await go(a, "/leaderboard");
await a.getByText(alice).first().waitFor({ timeout: 60000 });
const ladder = await a.locator("table.ladder").innerText();
check(ladder.indexOf(alice) < ladder.indexOf(bob) && ladder.indexOf(bob) > 0, "the leaderboard ranks the winner above the loser");
if (SHOTS) await a.screenshot({ path: `${SHOTS}/community-leaderboard.png` });

step("Feedback: a signed-in player sends a bug report from the footer");
await go(a, "/");
await a.getByRole("button", { name: "Feedback", exact: true }).click();
await a.getByRole("button", { name: "An idea" }).click();
check(await a.getByRole("button", { name: "Send", exact: true }).isDisabled(), "an empty message cannot be sent");
await a.getByRole("textbox").last().fill(`Test idea ${stamp}: knockout tournaments @everyone`);
await a.getByRole("button", { name: "Send", exact: true }).click();
// Without a webhook configured the form says so; with one, it thanks the player.
const outcome = await Promise.race([
  a.getByText("Sent. Every message is read.").waitFor({ timeout: 30000 }).then(() => "sent"),
  a.getByText("Feedback is not switched on yet.").waitFor({ timeout: 30000 }).then(() => "off"),
]);
check(outcome === "sent" || process.env.FEEDBACK !== "1", `feedback ${outcome === "sent" ? "was delivered" : "is not switched on here (set FEEDBACK=1 to require it)"}`);
if (SHOTS) await a.screenshot({ path: `${SHOTS}/community-feedback.png` });

await browser.close();
check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" / ") : ""}`);
console.log("COMMUNITY OK");
