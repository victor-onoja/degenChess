// Deploys ChessRatings, the consumer for the chess.com rating workflow (cre/rating). It holds no
// money and the game contracts do not depend on it, so it can be redeployed on its own.
// The deployer and RATING_REPORTERS (comma-separated) may originate reports while they arrive
// through the mock forwarder: the key that runs `cre workflow simulate --broadcast`, and the key
// the app's /api/rating route sends with (the faucet key).
//   RATING_REPORTERS=0x...,0x... npx hardhat run scripts/deploy-ratings.js --network monadTestnet
const hre = require("hardhat");

const MONAD_TESTNET_MOCK_FORWARDER = "0xB9F79d863261869B234c481D1f9A7af84AeAd192";

async function main() {
  const local = hre.network.name === "localhost" || hre.network.name === "hardhat";
  const publicClient = await hre.viem.getPublicClient();
  const [deployer] = await hre.viem.getWalletClients();
  const wait = (hash) => publicClient.waitForTransactionReceipt({ hash });
  // Locally there is no Chainlink forwarder: a stand-in with the same entry point is deployed.
  const forwarder = process.env.FORWARDER_ADDRESS || (local ? (await hre.viem.deployContract("OpenForwarder")).address : MONAD_TESTNET_MOCK_FORWARDER);
  const ratings = await hre.viem.deployContract("ChessRatings", [forwarder]);
  console.log(`ChessRatings deployed to ${ratings.address} (forwarder ${forwarder})`);
  for (const r of [deployer.account.address, ...(process.env.RATING_REPORTERS || "").split(",").filter(Boolean)]) {
    await wait(await ratings.write.setReporter([r, true]));
    console.log(`  reporter allowed: ${r}`);
  }
  console.log("\nPut it in src/deployments.ts as `ratings` and in cre/rating/config.staging.json as `ratingsAddress`.");
  console.log(`NEXT_PUBLIC_RATINGS_ADDRESS=${ratings.address}`);
  console.log(`RATINGS_FORWARDER=${forwarder}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
