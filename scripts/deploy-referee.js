// Replaces the ChessReferee of an existing DegenChess deployment and makes it the arbiter.
// Games and balances are untouched. The deployer and REFEREE_REPORTERS (comma-separated) are
// allowed to originate reports while reports arrive through the mock forwarder.
//   CHESS_ADDRESS=0x... REFEREE_REPORTERS=0x...,0x... npx hardhat run scripts/deploy-referee.js --network monadTestnet
const hre = require("hardhat");

const MONAD_TESTNET_MOCK_FORWARDER = "0xB9F79d863261869B234c481D1f9A7af84AeAd192";

async function main() {
  const chessAddress = process.env.CHESS_ADDRESS;
  if (!chessAddress) throw new Error("set CHESS_ADDRESS");
  const forwarder = process.env.FORWARDER_ADDRESS || MONAD_TESTNET_MOCK_FORWARDER;
  const publicClient = await hre.viem.getPublicClient();
  const [deployer] = await hre.viem.getWalletClients();
  const wait = (hash) => publicClient.waitForTransactionReceipt({ hash });

  const referee = await hre.viem.deployContract("ChessReferee", [chessAddress, forwarder]);
  console.log(`ChessReferee deployed to ${referee.address} (forwarder ${forwarder})`);
  const reporters = [deployer.account.address, ...(process.env.REFEREE_REPORTERS || "").split(",").filter(Boolean)];
  for (const r of reporters) {
    await wait(await referee.write.setReporter([r, true]));
    console.log(`  reporter allowed: ${r}`);
  }
  const chess = await hre.viem.getContractAt("DegenChess", chessAddress);
  await wait(await chess.write.setArbiter([referee.address]));
  console.log(`  set as arbiter of ${chessAddress}`);
  console.log(`\nUpdate src/deployments.ts and cre/referee/config.staging.json: REFEREE_ADDRESS=${referee.address}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
