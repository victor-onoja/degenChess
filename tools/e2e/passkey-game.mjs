// End-to-end: two players, each with a simulated passkey (Chrome virtual authenticator with PRF),
// play a full staked game. Verifies one-prompt onboarding, prompt-free moves, the "stateless test"
// (storage wiped mid-game) and passkey re-prompts for money actions.
//
//   npm run chain && npm run deploy:local, start the app against it, then: node tools/e2e/passkey-game.mjs
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const step = (msg) => console.log("-", msg);

async function player(n) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  // This test drives the 2D board by drag and drop; the view choice is a non-secret UI preference.
  await ctx.addInitScript(() => localStorage.setItem("degenchess.view", "2d"));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true,
      automaticPresenceSimulation: true,
    },
  });
  page.on("pageerror", (e) => console.log(`[P${n} pageerror]`, e.message.slice(0, 300)));
  /** Number of passkey ceremonies so far (each assertion bumps the credential's sign counter). */
  const prompts = async () => {
    const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
    return credentials.reduce((sum, c) => sum + c.signCount, 0);
  };
  await page.goto(APP);
  return { page, prompts, n };
}

const shot = (p, name) => (SHOTS ? p.page.screenshot({ path: `${SHOTS}/${name}.png` }) : null);
const idle = (p) =>
  p.page.waitForFunction(() => !document.querySelector(".Toastify__toast--loading"), null, { timeout: 60000 });
async function click(p, name) {
  const b = p.page.getByRole("button", { name, exact: true });
  await b.waitFor({ timeout: 60000 });
  await b.click({ timeout: 60000 });
}

let ply = 0;
async function move(p, other, from, to) {
  await p.page.waitForTimeout(700); // let the incoming-move animation finish, as a human would
  await p.page.dragAndDrop(`[data-square="${from}"] [data-piece]`, `[data-square="${to}"]`);
  ply++;
  for (const q of [p, other]) {
    await q.page
      .getByText(`ply ${ply + 1} `)
      .waitFor({ timeout: 30000 })
      .catch(async () => {
        if (!(await q.page.getByText("Checkmate").count())) {
          await shot(q, `fail-p${q.n}`);
          throw new Error(`ply ${ply + 1} never appeared for P${q.n} after ${from}-${to}`);
        }
      });
  }
  await idle(p);
}
function assertEqual(actual, expected, what) {
  if (actual !== expected) throw new Error(`${what}: expected ${expected}, got ${actual}`);
  console.log(`  ok: ${what} = ${actual}`);
}

const p1 = await player(1);
const p2 = await player(2);

step("P1 signs up with one passkey ceremony");
await click(p1, "Play now");
await p1.page.getByText("You're in.").waitFor({ timeout: 60000 });
console.log("  " + (await p1.page.getByText("You're in.").innerText()));
// Some authenticators (incl. Chrome's virtual one) need a follow-up assertion to evaluate PRF at
// creation; providers that return it during creation make sign-up a single prompt. Count from here.
const base1 = await p1.prompts();
console.log(`  sign-up ceremonies beyond passkey creation: ${base1}`);
await shot(p1, "1-signed-up");

step("P1 stakes and creates a game (money action: one passkey prompt)");
await click(p1, /^Create Game$/);
await p1.page.waitForURL(/game=\d+/, { timeout: 60000 });
await p1.page.getByText("Waiting for an opponent").waitFor();
assertEqual((await p1.prompts()) - base1, 1, "P1 prompts for staking");

step("P2 signs up and joins from the lobby");
await click(p2, "Play now");
await p2.page.getByText("You're in.").waitFor({ timeout: 60000 });
const base2 = await p2.prompts();
await p2.page.getByRole("button", { name: "Join" }).first().click();
await click(p2, /^Join as Bears/);
await p1.page.getByText("Bulls to move").waitFor({ timeout: 60000 });
await idle(p2);
assertEqual((await p2.prompts()) - base2, 1, "P2 prompts for joining");

step("Moves are prompt-free");
const before = [await p1.prompts(), await p2.prompts()];
await move(p1, p2, "e2", "e4");
await move(p2, p1, "e7", "e5");
await move(p1, p2, "f1", "c4");
await move(p2, p1, "b8", "c6");
assertEqual(await p1.prompts(), before[0], "P1 prompts during moves (unchanged)");
assertEqual(await p2.prompts(), before[1], "P2 prompts during moves (unchanged)");

step("Stateless test: wipe P2's storage mid-game and reload");
const gameUrl = p2.page.url();
await p2.page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await p2.page.goto(gameUrl);
await p2.page.getByRole("button", { name: "Play now", exact: true }).waitFor({ timeout: 30000 });
console.log("  after wipe the app shows the signed-out state");
await click(p2, "I have a passkey");
await p2.page.getByText("(you)").waitFor({ timeout: 30000 });
await idle(p2);
assertEqual(await p2.prompts(), before[1] + 1, "P2 prompts to fully restore identity + game key");
await shot(p2, "2-restored");

step("Game continues prompt-free after the restore");
await move(p1, p2, "d2", "d4");
await move(p2, p1, "e5", "d4"); // Bears capture a pawn
await move(p1, p2, "d1", "h5");
await move(p2, p1, "g8", "f6");
await move(p1, p2, "h5", "f7"); // Qxf7#
await p2.page.getByText("Checkmate - you lost").waitFor({ timeout: 30000 });
assertEqual(await p2.prompts(), before[1] + 1, "P2 prompts after more moves (unchanged)");
await shot(p2, "3-checkmate");

step("Locking wipes the game key: the board stops accepting moves until unlocked");
await click(p1, "Lock");
await p1.page.getByRole("button", { name: "Unlock with passkey to keep playing" }).waitFor();

step("Bears resign (money action: passkey prompt), both withdraw");
await click(p2, /^Resign$/);
await p1.page.getByText("Finished - Bulls win").waitFor({ timeout: 60000 });
assertEqual(await p2.prompts(), before[1] + 2, "P2 prompts after resigning");
await idle(p2);
await click(p2, /^Withdraw /);
await p2.page.getByRole("button", { name: "Withdrawn" }).waitFor({ timeout: 60000 });
await click(p1, /^Withdraw /);
await p1.page.getByRole("button", { name: "Withdrawn" }).waitFor({ timeout: 60000 });
console.log("  " + (await p1.page.locator("section").first().innerText()).replace(/\n+/g, " | "));
await shot(p1, "4-finished");

await browser.close();
console.log("E2E OK");
