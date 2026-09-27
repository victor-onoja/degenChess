// Deploys DegenChess. On a local node it also deploys MockLINK and funds the default accounts.
//   npx hardhat run scripts/deploy.js --network localhost
//   DEPLOYER_PRIVATE_KEY=0x... npx hardhat run scripts/deploy.js --network arbitrumSepolia
const hre = require("hardhat");
const { parseEther } = require("viem");

// Chainlink LINK on Arbitrum Sepolia.
const ARBITRUM_SEPOLIA_LINK = "0xb1D4538B4571d411F07960EF2838Ce337FE1E80E";

async function main() {
  const local = hre.network.name === "localhost" || hre.network.name === "hardhat";
  const moveTimeout = BigInt(process.env.MOVE_TIMEOUT_SECONDS || (local ? 300 : 24 * 60 * 60));

  let token = process.env.PAYMENT_TOKEN || ARBITRUM_SEPOLIA_LINK;
  if (local) {
    const link = await hre.viem.deployContract("MockLINK");
    token = link.address;
    for (const w of await hre.viem.getWalletClients()) {
      await link.write.mint([w.account.address, parseEther("1000")]);
    }
  }

  const chess = await hre.viem.deployContract("DegenChess", [token, moveTimeout]);
  console.log(`DegenChess deployed to ${chess.address} (token ${token}, move timeout ${moveTimeout}s)\n`);
  console.log("Put this in .env.local:");
  console.log(`NEXT_PUBLIC_CHAIN=${local ? "localhost" : "arbitrumSepolia"}`);
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${chess.address}`);
  console.log(`NEXT_PUBLIC_TOKEN_ADDRESS=${token}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
