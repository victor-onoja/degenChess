import { hardhat, monadTestnet } from "wagmi/chains";

// Configure via .env.local (see .env.example).
export const CHAIN = process.env.NEXT_PUBLIC_CHAIN === "localhost" ? hardhat : monadTestnet;
export const IS_LOCAL = CHAIN.id === hardhat.id;

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as `0x${string}`;
export const TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? "") as `0x${string}`;
export const TOKEN_SYMBOL = process.env.NEXT_PUBLIC_TOKEN_SYMBOL ?? "tUSD";
export const TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS ?? 6);
/** The testnet stake token (MockUSD) lets anyone mint; hide the faucet for a real stablecoin. */
export const TOKEN_MINTABLE = process.env.NEXT_PUBLIC_TOKEN_MINTABLE !== "false";

export const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "637dc6b08ddd56005484d930c03d17d7";
