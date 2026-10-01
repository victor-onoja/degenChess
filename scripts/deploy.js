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

  const forwarder = process.env.FORWARDER_ADDRESS || (hre.network.name === "monadTestnet" ? MONAD_TESTNET_MOCK_FORWARDER : null);
  let referee = null;
  if (forwarder) {
    const publicClient = await hre.viem.getPublicClient();
    referee = await hre.viem.deployContract("ChessReferee", [chess.address, forwarder]);
    const hash = await chess.write.setArbiter([referee.address]);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`ChessReferee deployed to ${referee.address} (forwarder ${forwarder}) and set as arbiter`);
  }

  console.log("\nFor localhost, put this in .env.local. For Monad testnet, update src/deployments.ts and cre/referee/config.staging.json:");
  console.log(`NEXT_PUBLIC_CHAIN=${local ? "localhost" : hre.network.name}`);
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${chess.address}`);
  console.log(`NEXT_PUBLIC_TOKEN_ADDRESS=${token}`);
  if (referee) console.log(`REFEREE_ADDRESS=${referee.address}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
