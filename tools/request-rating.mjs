// Asks ChessRatings to link a chess.com username for the deployer's address, and prints the
// transaction to feed the rating workflow (see cre/README.md).
//   node tools/request-rating.mjs <chess.com username>
// The code to put in that chess.com profile's Location is printed first.
import nextEnv from "@next/env";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { readFileSync } from "node:fs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { ratingsAddress } = JSON.parse(readFileSync("cre/rating/config.staging.json", "utf8"));
const handle = (process.argv[2] ?? "").toLowerCase();
if (!/^[a-z0-9_-]{3,25}$/.test(handle)) throw new Error("usage: node tools/request-rating.mjs <chess.com username>");
const key = process.env.DEPLOYER_PRIVATE_KEY;
if (!key) throw new Error("DEPLOYER_PRIVATE_KEY missing from .env.local");
const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
const pub = createPublicClient({ chain: monadTestnet, transport: http() });
const wallet = createWalletClient({ account, chain: monadTestnet, transport: http() });

console.log(`player ${account.address}; code for the chess.com profile's Location: away-${account.address.slice(-6).toLowerCase()}`);
const hash = await wallet.writeContract({ address: ratingsAddress, abi: parseAbi(["function requestLink(string handle)"]), functionName: "requestLink", args: [handle] });
await pub.waitForTransactionReceipt({ hash });
console.log(`requestLink("${handle}") tx ${hash}`);
