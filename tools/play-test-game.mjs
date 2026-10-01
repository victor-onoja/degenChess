// Plays a scripted game on the live Monad testnet contract and prints the last move's transaction
// hash, for feeding the Chainlink CRE referee workflow (see cre/README.md).
//
//   node tools/play-test-game.mjs mate      Scholar's mate: white wins by checkmate
//   node tools/play-test-game.mjs cheat     White teleports the queen onto black's queen
//   node tools/play-test-game.mjs stalemate Sam Loyd's ten-move stalemate
//
// White is the deployer (DEPLOYER_PRIVATE_KEY in .env.local); black is a throwaway key it funds.
import nextEnv from "@next/env";
import { Chess } from "chess.js";
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, parseEventLogs, parseUnits, zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { readFileSync } from "node:fs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const cfg = JSON.parse(readFileSync("cre/referee/config.staging.json", "utf8"));
const CHESS = cfg.chessAddress;
const TOKEN = process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? "0xfbf011ba1f7d08651181b5eebabb7048596de9de";

const LINES = {
  mate: "e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#".split(" "),
  cheat: ["e4", "e5", { from: "d1", to: "d8" }],
  stalemate: "e3 a5 Qh5 Ra6 Qxa5 h5 h4 Rah6 Qxc7 f6 Qxd7+ Kf7 Qxb7 Qd3 Qxb8 Qh7 Qxc8 Kg6 Qe6".split(" "),
};
const line = LINES[process.argv[2] ?? "mate"];
if (!line) throw new Error(`unknown line; use one of ${Object.keys(LINES).join(", ")}`);

const abi = parseAbi([
  "function createGame(uint256 stake, address gameKey, uint32 clockSeconds, uint32 incrementSeconds) payable returns (uint256)",
  "function joinGame(uint256 gameId, address gameKey) payable",
  "function makeMove(uint256 gameId, uint16 move)",
  "event GameCreated(uint256 indexed gameId, address indexed white, uint256 stake)",
]);
const erc20 = parseAbi(["function mint(address,uint256)", "function approve(address,uint256) returns (bool)"]);

const key = process.env.DEPLOYER_PRIVATE_KEY;
const white = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
const black = privateKeyToAccount(generatePrivateKey());
const pub = createPublicClient({ chain: monadTestnet, transport: http() });
const wallet = (account) => createWalletClient({ account, chain: monadTestnet, transport: http() });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Monad: funds are spendable, and a sub-10-MON account may send value again, 3 blocks later.
const settle = async (receipt) => {
  while ((await pub.getBlockNumber()) < receipt.blockNumber + 4n) await sleep(250);
};
async function send(account, request) {
  const hash = await wallet(account).writeContract(request);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${request.functionName} reverted`);
  return receipt;
}

const stake = parseUnits("1", 6);
const sq = (s) => (Number(s[1]) - 1) * 8 + (s.charCodeAt(0) - 97);
const PROMO = { n: 2, b: 3, r: 4, q: 5 };

await settle({ blockNumber: await pub.getBlockNumber() }); // the deployer may have just sent something
const fund = await wallet(white).sendTransaction({ to: black.address, value: parseEther("0.25") });
await settle(await pub.waitForTransactionReceipt({ hash: fund }));
await send(white, { address: TOKEN, abi: erc20, functionName: "mint", args: [white.address, stake] });
await send(black, { address: TOKEN, abi: erc20, functionName: "mint", args: [black.address, stake] });
await send(white, { address: TOKEN, abi: erc20, functionName: "approve", args: [CHESS, stake] });
await send(black, { address: TOKEN, abi: erc20, functionName: "approve", args: [CHESS, stake] });
const created = await send(white, { address: CHESS, abi, functionName: "createGame", args: [stake, zeroAddress, 0, 0] });
const gameId = parseEventLogs({ abi, logs: created.logs, eventName: "GameCreated" })[0].args.gameId;
await send(black, { address: CHESS, abi, functionName: "joinGame", args: [gameId, zeroAddress] });

const game = new Chess();
let last;
for (let ply = 0; ply < line.length; ply++) {
  const step = line[ply];
  // Legal moves go through chess.js; a raw {from,to} is sent as-is (the cheat).
  const move = typeof step === "string" ? game.move(step) : step;
  const encoded = sq(move.from) | (sq(move.to) << 6) | ((move.promotion ? PROMO[move.promotion] : 0) << 12);
  last = await send(ply % 2 === 0 ? white : black, { address: CHESS, abi, functionName: "makeMove", args: [gameId, encoded] });
}
console.log(`game ${gameId} (${process.argv[2] ?? "mate"}): last move tx ${last.transactionHash}`);
