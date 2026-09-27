import { arbitrumSepolia, hardhat } from "wagmi/chains";

// Configure via .env.local (see .env.example). Defaults point at the Arbitrum Sepolia deployment.
const chainName = process.env.NEXT_PUBLIC_CHAIN ?? "arbitrumSepolia";

export const CHAIN = chainName === "localhost" ? hardhat : arbitrumSepolia;
export const IS_LOCAL = CHAIN.id === hardhat.id;

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as `0x${string}`;
export const TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ??
  "0xb1D4538B4571d411F07960EF2838Ce337FE1E80E") as `0x${string}`; // LINK on Arbitrum Sepolia
export const TOKEN_SYMBOL = "LINK";

export const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "637dc6b08ddd56005484d930c03d17d7";
