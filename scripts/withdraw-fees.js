// Shows the fees the game contract is holding for its owner and, with WITHDRAW=1, sends them to the owner.
//   CHESS_ADDRESS=0x... npx hardhat run scripts/withdraw-fees.js --network monadTestnet            (look)
//   WITHDRAW=1 CHESS_ADDRESS=0x... npx hardhat run scripts/withdraw-fees.js --network monadTestnet (collect)
// Must be run with the owner's key (DEPLOYER_PRIVATE_KEY in .env.local).
const hre = require("hardhat");
const { formatUnits } = require("viem");

async function main() {
  const address = process.env.CHESS_ADDRESS;
  if (!address) throw new Error("set CHESS_ADDRESS (the game contract, see src/deployments.ts)");
  const chess = await hre.viem.getContractAt("DegenChess", address);
  const publicClient = await hre.viem.getPublicClient();
  const [me] = await hre.viem.getWalletClients();
  const fees = await chess.read.accruedFees();
  console.log(`owner ${await chess.read.owner()}; fees waiting: ${formatUnits(fees, 6)} (6-decimal stake token)`);
  if (process.env.WITHDRAW !== "1" || fees === 0n) return;
  const hash = await chess.write.withdrawFees({ account: me.account });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`withdrawn to the owner in ${hash}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
