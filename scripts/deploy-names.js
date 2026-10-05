// Deploys a fresh PlayerNames (usernames) contract, e.g. when the app moves to a new web address and
// every account starts again.   npx hardhat run scripts/deploy-names.js --network monadTestnet
const hre = require("hardhat");

async function main() {
  const names = await hre.viem.deployContract("PlayerNames");
  console.log(`PlayerNames deployed to ${names.address}`);
  console.log("Put it in src/deployments.ts as `names`.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
