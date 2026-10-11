import {
  bytesToHex,
  consensusIdenticalAggregation,
  cre,
  encodeCallMsg,
  EVMClient,
  type EVMLog,
  getNetwork,
  handler,
  hexToBase64,
  type HTTPSendRequester,
  LATEST_BLOCK_NUMBER,
  Runner,
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import { decodeFunctionResult, encodeAbiParameters, encodeFunctionData, keccak256, parseAbi, toBytes, zeroAddress } from "viem";
import { judge } from "./judge";

// Away Chess referee.
//
// Trigger:  every MoveMade event emitted by the Away Chess contract.
// Read:     the game's status and full move list.
// Compute:  replay the game with a chess engine (judge.ts). Is it checkmate, a draw by rule, or was
//           a move illegal?
// Write:    if so, a DON-signed verdict goes through the Chainlink forwarder to ChessReferee, which
//           settles the game by calling DegenChess.arbitrate.
// Tell:     the result is then reported to the team's Discord through the app's announce endpoint
//           (an HTTP call), so every game the referee ends shows up where people are watching.
//
// The contract deliberately does not validate chess legality (too expensive per move); this workflow
// is what makes cheating unprofitable and ends finished games without waiting on the loser.

type Config = {
  chainSelectorName: string;
  /** Away Chess: emits MoveMade and holds the games. */
  chessAddress: `0x${string}`;
  /** ChessReferee: the consumer contract that receives verdicts. */
  refereeAddress: `0x${string}`;
  gasLimit: string;
  /** Where to report a settled game (the app's /api/announce). Optional: no report when unset. */
  announceUrl?: string;
};

/** Asks the app to report a game. Each node asks; the status they get back must agree. */
const announce = (sendRequester: HTTPSendRequester, url: string, gameId: string): number =>
  sendRequester.sendRequest({ url: `${url}?game=${gameId}`, method: "GET" }).result().statusCode;

const chessAbi = parseAbi([
  "function getMoves(uint256 gameId) view returns (uint16[])",
  "function getGame(uint256 gameId) view returns (address white, address black, uint256 stake, uint256 whiteBalance, uint256 blackBalance, uint8 status, uint8 result, address drawOfferedBy, uint64 lastMoveAt, uint256 moveCount)",
]);
const MOVE_MADE = keccak256(toBytes("MoveMade(uint256,address,uint16,uint8,uint256)"));
const STATUS_ACTIVE = 2;

const client = (config: Config) => {
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: config.chainSelectorName });
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`);
  return new EVMClient(network.chainSelector.selector);
};

const onMoveMade = (runtime: Runtime<Config>, log: EVMLog): string => {
  const config = runtime.config;
  const evm = client(config);
  // MoveMade(uint256 indexed gameId, address indexed player, ...): topic 1 is the game.
  const gameId = BigInt(bytesToHex(log.topics[1]));

  const call = (data: `0x${string}`) =>
    bytesToHex(
      evm
        .callContract(runtime, {
          call: encodeCallMsg({ from: zeroAddress, to: config.chessAddress, data }),
          blockNumber: LATEST_BLOCK_NUMBER,
        })
        .result().data
    );

  const game = decodeFunctionResult({
    abi: chessAbi,
    functionName: "getGame",
    data: call(encodeFunctionData({ abi: chessAbi, functionName: "getGame", args: [gameId] })),
  });
  if (game[5] !== STATUS_ACTIVE) {
    runtime.log(`Game ${gameId}: already settled, nothing to do`);
    return "settled";
  }

  const moves = decodeFunctionResult({
    abi: chessAbi,
    functionName: "getMoves",
    data: call(encodeFunctionData({ abi: chessAbi, functionName: "getMoves", args: [gameId] })),
  });
  const verdict = judge(moves);
  if (!verdict) {
    runtime.log(`Game ${gameId}: ${moves.length} moves, all legal, game continues`);
    return "continues";
  }
  runtime.log(
    `Game ${gameId}: verdict after move ${verdict.ply}: result=${verdict.result} reason=${verdict.reason} forfeit=${verdict.forfeit}`
  );

  // Matches ChessReferee.onReport's abi.decode.
  const payload = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint8" }, { type: "bool" }, { type: "uint256" }, { type: "uint8" }],
    [gameId, verdict.result, verdict.forfeit, BigInt(verdict.ply), verdict.reason]
  );
  const report = runtime
    .report({ encodedPayload: hexToBase64(payload), encoderName: "evm", signingAlgo: "ecdsa", hashingAlgo: "keccak256" })
    .result();
  const written = evm
    .writeReport(runtime, { receiver: config.refereeAddress, report, gasConfig: { gasLimit: config.gasLimit } })
    .result();

  if (written.txStatus !== TxStatus.SUCCESS) throw new Error(`Verdict transaction failed: ${written.txStatus}`);
  const txHash = bytesToHex(written.txHash ?? new Uint8Array(32));
  runtime.log(`Game ${gameId}: verdict delivered in ${txHash}`);

  // The game is settled whatever happens next: a failed report is logged, never thrown.
  if (config.announceUrl) {
    try {
      const status = new cre.capabilities.HTTPClient()
        .sendRequest(runtime, announce, consensusIdenticalAggregation<number>())(config.announceUrl, gameId.toString())
        .result();
      runtime.log(`Game ${gameId}: result reported to the team channel (HTTP ${status})`);
    } catch (e) {
      runtime.log(`Game ${gameId}: could not report the result: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return txHash;
};

const initWorkflow = (config: Config) => [
  handler(
    client(config).logTrigger({
      addresses: [hexToBase64(config.chessAddress)],
      topics: [{ values: [hexToBase64(MOVE_MADE)] }],
    }),
    onMoveMade
  ),
];

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
