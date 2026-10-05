// End-to-end: two players, each with a simulated passkey (Chrome virtual authenticator with PRF),
// play a full staked game. Verifies one-prompt onboarding, prompt-free moves, the "stateless test"
// (storage wiped mid-game) and passkey re-prompts for money actions.
//
//   npm run chain && npm run deploy:local, start the app against it, then: node tools/e2e/passkey-game.mjs
import { chromium } from "playwright";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR;
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
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
  page.on("console", (m) => m.type() === "error" && !/404|Failed to load resource/.test(m.text()) && console.log(`[P${n} console]`, m.text().slice(0, 400)));
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
  await b.waitFor({ timeout: 60000 }).catch(async (e) => {
    await shot(p, `fail-p${p.n}`);
    console.log(`  P${p.n} page text:`, (await p.page.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 500));
    throw e;
  });
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
        // The last move ends the game: the ply counter gives way to "Checkmate", or straight to
        // "Finished" when the referee settles it within a second or two.
        if (!(await q.page.getByText(/Checkmate|Finished - /).count())) {
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

step("P1 signs up with one passkey ceremony, claiming a username");
const username = `bull_${Date.now().toString(36).slice(-6)}`;
await p1.page.getByLabel("Username").fill(username);
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
await click(p2, /^Join as Black/);
await p1.page.getByText("White to move").waitFor({ timeout: 60000 });
await idle(p2);
assertEqual((await p2.prompts()) - base2, 1, "P2 prompts for joining");
await p2.page.getByText(username).first().waitFor({ timeout: 30000 });
console.log(`  ok: P2 sees the opponent's username (${username}) and a running clock`);
await p2.page.getByText(/^\d:\d\d$/).first().waitFor({ timeout: 30000 });

step("Moves are prompt-free");
const before = [await p1.prompts(), await p2.prompts()];
await move(p1, p2, "e2", "e4");
await move(p2, p1, "e7", "e5");
await move(p1, p2, "f1", "c4");
await move(p2, p1, "b8", "c6");
assertEqual(await p1.prompts(), before[0], "P1 prompts during moves (unchanged)");
assertEqual(await p2.prompts(), before[1], "P2 prompts during moves (unchanged)");

if (SHOTS) {
  step("Side-by-side view on desktop (screenshot only)");
  await click(p1, "Split");
  await p1.page.waitForFunction(() => document.querySelector("canvas") && !document.body.innerText.includes("Setting the board"), null, { timeout: 90000 });
  await p1.page.waitForTimeout(2500);
  await shot(p1, "desktop-split");
  await click(p1, "2D");

  step("Phone-sized window: minimized HUD in 2D and 3D (screenshots only)");
  await p2.page.setViewportSize({ width: 390, height: 844 });
  await p2.page.waitForTimeout(600);
  await shot(p2, "phone-2d-full");
  await click(p2, "Minimize HUD");
  await p2.page.waitForTimeout(600);
  await shot(p2, "phone-2d-min");
  await click(p2, "3D");
  await p2.page.waitForFunction(() => document.querySelector("canvas") && !document.body.innerText.includes("Setting the board"), null, { timeout: 90000 });
  await p2.page.waitForTimeout(3000);
  await shot(p2, "phone-3d-min");
  await p2.page.getByRole("button", { name: "Expand HUD" }).first().click();
  await p2.page.waitForTimeout(1500);
  await shot(p2, "phone-3d-full");
  await click(p2, "2D");
  await p2.page.setViewportSize({ width: 1300, height: 900 });
  await p2.page.waitForTimeout(600);
}

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
await move(p2, p1, "e5", "d4"); // Black captures a pawn
await move(p1, p2, "d1", "h5");
await move(p2, p1, "g8", "f6");
await move(p1, p2, "h5", "f7"); // Qxf7#
if (process.env.REFEREE !== "1") {
  await p2.page.getByText("Checkmate - you lost").waitFor({ timeout: 30000 });
  assertEqual(await p2.prompts(), before[1] + 1, "P2 prompts after more moves (unchanged)");
  await shot(p2, "3-checkmate");

  step("Locking wipes the game key: the board stops accepting moves until unlocked");
  await click(p1, "Lock");
  await p1.page.getByRole("button", { name: "Unlock with passkey to keep playing" }).waitFor();
}

if (process.env.REFEREE === "1") {
  // With the Chainlink referee running, checkmate settles itself: nobody has to resign.
  step("The referee settles the checkmate automatically, both withdraw");
  await p1.page.getByText("Finished - White wins").waitFor({ timeout: 120000 });
  await p2.page.getByText("Finished - White wins").waitFor({ timeout: 60000 });
  assertEqual(await p2.prompts(), before[1] + 1, "P2 prompts at settlement (no resignation needed)");
} else {
  step("Black resigns (money action: passkey prompt), both withdraw");
  await click(p2, /^Resign$/);
  await p1.page.getByText("Finished - White wins").waitFor({ timeout: 60000 });
  assertEqual(await p2.prompts(), before[1] + 2, "P2 prompts after resigning");
}
await idle(p2);
await click(p2, /^Withdraw /);
await p2.page.getByRole("button", { name: "Withdrawn" }).waitFor({ timeout: 60000 });
await click(p1, /^Withdraw /);
await p1.page.getByRole("button", { name: "Withdrawn" }).waitFor({ timeout: 60000 });
console.log("  " + (await p1.page.locator("section").first().innerText()).replace(/\n+/g, " | "));
await shot(p1, "4-finished");

step("Rematch: P1 offers, P2 is shown the offer");
await idle(p1);
await click(p1, /^Rematch /);
await p1.page.getByText("Waiting for an opponent").waitFor({ timeout: 60000 });
await click(p2, /wants a rematch/);
// A rematch swaps colours: White offered it, so the other player is offered White.
await p2.page.getByRole("button", { name: /^Join as White/ }).waitFor({ timeout: 30000 });
await shot(p2, "5-rematch");

await browser.close();
console.log("E2E OK");
