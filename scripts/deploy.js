// Deploys DegenChess, and on Monad the ChessReferee that lets the Chainlink CRE workflow settle games.
// Unless PAYMENT_TOKEN is set, it also deploys MockUSD (tUSD, 6 decimals) as the stake token.
//   npx hardhat run scripts/deploy.js --network localhost
//   PAYMENT_TOKEN=0x... npx hardhat run scripts/deploy.js --network monadTestnet   (key from .env.local)
const hre = require("hardhat");
const { parseUnits } = require("viem");

// Chainlink forwarders on Monad testnet (docs.chain.link/cre/supported-networks).
// The mock forwarder delivers reports from `cre workflow simulate --broadcast`; switch to the
// production KeystoneForwarder with ChessReferee.setForwarder once the workflow is deployed to a DON.
const MONAD_TESTNET_MOCK_FORWARDER = "0xB9F79d863261869B234c481D1f9A7af84AeAd192";

async function main() {
  const local = hre.network.name === "localhost" || hre.network.name === "hardhat";
  const moveTimeout = BigInt(process.env.MOVE_TIMEOUT_SECONDS || (local ? 300 : 24 * 60 * 60));

  let token = process.env.PAYMENT_TOKEN;
  if (!token) {
    const usd = await hre.viem.deployContract("MockUSD");
    token = usd.address;
    if (local) {
      for (const w of await hre.viem.getWalletClients()) {
        await usd.write.mint([w.account.address, parseUnits("1000", 6)]);
      }
    }
  }

  const chess = await hre.viem.deployContract("DegenChess", [token, moveTimeout]);
  console.log(`DegenChess deployed to ${chess.address} (token ${token}, move timeout ${moveTimeout}s)`);

  // Fair-play limits per trust tier, as "maxStake:holdSeconds" for tiers 0..3 ("unlimited" for no cap).
  // Monad testnet defaults keep the holds short so testers are not kept waiting; see docs/MAINNET.md
  // for the mainnet values. Locally nothing is limited unless TIER_POLICY is set.
  const policy = process.env.TIER_POLICY ?? (local ? "" : "25:600,100:0,500:0,unlimited:0");
  if (policy) {
    const pc = await hre.viem.getPublicClient();
    const tiers = policy.split(",");
    for (let tier = 0; tier < tiers.length; tier++) {
      const [cap, hold] = tiers[tier].split(":");
      const maxStake = cap === "unlimited" ? 2n ** 256n - 1n : parseUnits(cap, 6);
      await pc.waitForTransactionReceipt({ hash: await chess.write.setTierPolicy([tier, maxStake, Number(hold)]) });
    }
    console.log(`Tier policy set: ${policy}`);
  }
  // The risk service's key (tools/risk/risk-watch.mjs): sets tiers and freezes accounts, nothing else.
  if (process.env.RISK_OPERATOR) {
    const pc = await hre.viem.getPublicClient();
    await pc.waitForTransactionReceipt({ hash: await chess.write.setRiskOperator([process.env.RISK_OPERATOR]) });
    console.log(`Risk operator: ${process.env.RISK_OPERATOR}`);
  }

  const forwarder = process.env.FORWARDER_ADDRESS || (hre.network.name === "monadTestnet" ? MONAD_TESTNET_MOCK_FORWARDER : null);
  let referee = null;
  if (forwarder) {
    const publicClient = await hre.viem.getPublicClient();
    referee = await hre.viem.deployContract("ChessReferee", [chess.address, forwarder]);
    const hash = await chess.write.setArbiter([referee.address]);
    await publicClient.waitForTransactionReceipt({ hash });
    // While reports come through the mock forwarder (which checks nothing), only these accounts may
    // originate one: the deployer and REFEREE_REPORTERS (comma-separated), e.g. the referee server's key.
    const [deployer] = await hre.viem.getWalletClients();
    for (const r of [deployer.account.address, ...(process.env.REFEREE_REPORTERS || "").split(",").filter(Boolean)]) {
      await publicClient.waitForTransactionReceipt({ hash: await referee.write.setReporter([r, true]) });
    }
    console.log(`ChessReferee deployed to ${referee.address} (forwarder ${forwarder}) and set as arbiter`);
  }

  // Usernames outlive game redeployments: reuse NAMES_ADDRESS when there is one.
  const names = process.env.NAMES_ADDRESS || (await hre.viem.deployContract("PlayerNames")).address;
  console.log(`PlayerNames at ${names}`);
  // Tournaments only reads this game contract's game count, so it is redeployed with it.
  const tournaments = await hre.viem.deployContract("Tournaments", [chess.address]);
  console.log(`Tournaments deployed to ${tournaments.address}`);

  // The chess.com ratings register is independent of the game: deployed here only for local runs.
  let ratings = null;
  let ratingsForwarder = null;
  if (local) {
    ratingsForwarder = await hre.viem.deployContract("OpenForwarder");
    ratings = await hre.viem.deployContract("ChessRatings", [ratingsForwarder.address]);
    const [deployer] = await hre.viem.getWalletClients();
    await ratings.write.setReporter([deployer.account.address, true]);
  }

  console.log("\nFor localhost, put this in .env.local. For Monad testnet, update src/deployments.ts and cre/referee/config.staging.json:");
  console.log(`NEXT_PUBLIC_CHAIN=${local ? "localhost" : hre.network.name}`);
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${chess.address}`);
  console.log(`NEXT_PUBLIC_TOKEN_ADDRESS=${token}`);
  console.log(`NEXT_PUBLIC_NAMES_ADDRESS=${names}`);
  console.log(`NEXT_PUBLIC_TOURNAMENTS_ADDRESS=${tournaments.address}`);
  if (referee) console.log(`REFEREE_ADDRESS=${referee.address}`);
  if (ratings) {
    console.log(`NEXT_PUBLIC_RATINGS_ADDRESS=${ratings.address}`);
    console.log(`RATINGS_FORWARDER=${ratingsForwarder.address}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
