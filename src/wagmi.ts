import { connectorsForWallets, getDefaultWallets } from "@rainbow-me/rainbowkit";
import { createConfig, http } from "wagmi";
import { mock } from "wagmi/connectors";
import { CHAIN, IS_LOCAL, WALLETCONNECT_PROJECT_ID } from "./config";

// Unlocked accounts of `npx hardhat node` (#1 and #2; #0 deploys and owns the contract).
export const DEV_ACCOUNTS = [
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
] as const;

const { wallets } = getDefaultWallets();
const walletConnectors = connectorsForWallets(wallets, {
  appName: "DegenChess",
  projectId: WALLETCONNECT_PROJECT_ID,
});

export const config = createConfig({
  chains: [CHAIN],
  connectors: IS_LOCAL
    ? [...walletConnectors, ...DEV_ACCOUNTS.map((a) => mock({ accounts: [a], features: { reconnect: true } }))]
    : walletConnectors,
  transports: { [CHAIN.id]: http() } as Record<typeof CHAIN.id, ReturnType<typeof http>>,
  ssr: true,
});
