// Deploys DegenChess. Unless PAYMENT_TOKEN is set, it also deploys MockUSD (tUSD, 6 decimals) as the stake token.
//   npx hardhat run scripts/deploy.js --network localhost
//   DEPLOYER_PRIVATE_KEY=0x... npx hardhat run scripts/deploy.js --network monadTestnet
const hre = require("hardhat");
const { parseUnits } = require("viem");

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
  console.log(`DegenChess deployed to ${chess.address} (token ${token}, move timeout ${moveTimeout}s)\n`);
  console.log("Put this in .env.local:");
  console.log(`NEXT_PUBLIC_CHAIN=${local ? "localhost" : hre.network.name}`);
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${chess.address}`);
  console.log(`NEXT_PUBLIC_TOKEN_ADDRESS=${token}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
