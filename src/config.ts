import { hardhat, monadTestnet } from "wagmi/chains";
import { MONAD_TESTNET } from "./deployments";

// NEXT_PUBLIC_CHAIN=localhost points the app at `npx hardhat node` (addresses from .env.local, see
// .env.example). Anything else uses the Monad testnet deployment recorded in src/deployments.ts.
export const IS_LOCAL = process.env.NEXT_PUBLIC_CHAIN === "localhost";
export const CHAIN = IS_LOCAL ? hardhat : monadTestnet;

const address = (local: string | undefined, live: string) => ((IS_LOCAL ? local : live) ?? "") as `0x${string}`;
export const CONTRACT_ADDRESS = address(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS, MONAD_TESTNET.chess);
export const TOKEN_ADDRESS = address(process.env.NEXT_PUBLIC_TOKEN_ADDRESS, MONAD_TESTNET.token);

export const TOKEN_SYMBOL = process.env.NEXT_PUBLIC_TOKEN_SYMBOL ?? "tUSD";
export const TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS ?? 6);
/** The testnet stake token (MockUSD) lets anyone mint; hide the faucet for a real stablecoin. */
export const TOKEN_MINTABLE = process.env.NEXT_PUBLIC_TOKEN_MINTABLE !== "false";
