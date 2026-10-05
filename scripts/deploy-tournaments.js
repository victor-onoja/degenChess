// Deploys the Tournaments register for an existing DegenChess deployment (it only reads the game count).
//   CHESS_ADDRESS=0x... npx hardhat run scripts/deploy-tournaments.js --network monadTestnet
const hre = require("hardhat");

async function main() {
  const chess = process.env.CHESS_ADDRESS;
  if (!chess) throw new Error("set CHESS_ADDRESS");
  const tournaments = await hre.viem.deployContract("Tournaments", [chess]);
  console.log(`Tournaments deployed to ${tournaments.address} (games from ${chess})`);
  console.log("Put it in src/deployments.ts as `tournaments`.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
