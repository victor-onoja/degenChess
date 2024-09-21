import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { PROJECT_ID } from "./keys";
import {
  arbitrum,
  base,
  mainnet,
  optimism,
  polygon,
  sepolia,
  arbitrumSepolia,
} from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "web3chess",
  projectId: PROJECT_ID,
  chains: [
    mainnet,
    polygon,
    optimism,
    arbitrum,
    arbitrumSepolia,
    base,
    ...(process.env.NEXT_PUBLIC_ENABLE_TESTNETS === "true" ? [sepolia] : []),
  ],
  ssr: true,
});
