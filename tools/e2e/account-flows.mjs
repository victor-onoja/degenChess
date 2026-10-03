// End-to-end checks for usernames and the wallet: a taken name blocks sign-up, a player who skipped the
// name is asked for one and claims it, and money is sent to another player by username.
//   (app running against a local chain or testnet) node tools/e2e/account-flows.mjs
//   With NEXT_PUBLIC_CONTRACT_ADDRESS (and RPC_URL) set it also checks the invite was recorded on-chain.
import { chromium } from "playwright";
import { createPublicClient, http, parseAbi } from "viem";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const check = (cond, what) => {
  if (!cond) throw new Error(`FAILED: ${what}`);
  console.log(`  ok: ${what}`);
};

async function player(phone) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true } : { viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem("degenchess.set", "classic")); // the 3D board is not under test
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
  });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 300)));
  await page.goto(APP);
  return page;
}

const taken = `a_${Date.now().toString(36).slice(-7)}`;
const first = await player(false);
await first.getByLabel("Username").fill(taken);
await first.getByText("Available").waitFor({ timeout: 20000 });
await first.getByRole("button", { name: "Play now", exact: true }).click();
await first.getByText("You're in.").waitFor({ timeout: 60000 });
await first.getByRole("button", { name: taken }).waitFor({ timeout: 30000 });
check(true, `first player signed up as ${taken}`);

// The second player arrives through the first one's invite link.
const p = await player(true);
await p.goto(`${APP}/?ref=${taken}`);
await p.getByLabel("Username").fill(taken);
await p.getByText("Someone has that name").waitFor({ timeout: 20000 });
check(await p.getByRole("button", { name: "Play now", exact: true }).isDisabled(), "a taken name blocks Play now");
await p.getByLabel("Username").fill("");
await p.getByRole("button", { name: "Play now", exact: true }).click();
await p.getByText("You're in.").waitFor({ timeout: 60000 });
await p.getByRole("button", { name: "Choose a username" }).waitFor();
check(true, "without a name, the header asks for one");
if (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS) {
  const client = createPublicClient({ transport: http(process.env.RPC_URL ?? "http://127.0.0.1:8545") });
  const [referrerSet] = parseAbi(["event ReferrerSet(address indexed player, address indexed referrer)"]);
  const logs = await client.getLogs({ address: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS, event: referrerSet, fromBlock: 0n });
  check(logs.length > 0, `signing up through ${taken}'s link recorded them as the referrer`);
}

const mine = `b_${Date.now().toString(36).slice(-7)}`;
await p.locator("#yard").getByLabel("Username").fill(mine);
await p.locator("#yard").getByText("Available").waitFor({ timeout: 20000 });
await p.locator("#yard").getByRole("button", { name: "Claim" }).click();
await p.getByRole("button", { name: mine }).waitFor({ timeout: 60000 });
check(true, `claimed ${mine}; the header shows it instead of the address`);
if (SHOTS) await p.screenshot({ path: `${SHOTS}/account-named.png` });

await p.getByTitle("Add funds or send").click();
await p.getByRole("dialog").waitFor();
await p.getByLabel("Send to").fill(taken);
await p.locator("input[aria-label=Amount]").fill("2");
await p.getByText(`To ${taken}.`).waitFor({ timeout: 20000 });
if (SHOTS) await p.screenshot({ path: `${SHOTS}/account-wallet.png` });
await p.getByRole("button", { name: "Send", exact: true }).click();
await p.getByText(`Send 2 tUSD to ${taken}: done`).waitFor({ timeout: 60000 });
check(true, `sent 2 tUSD to ${taken} by username`);

await browser.close();
console.log("ACCOUNT FLOWS OK");
