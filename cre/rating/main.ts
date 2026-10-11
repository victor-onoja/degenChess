import {
  bytesToHex,
  consensusIdenticalAggregation,
  cre,
  EVMClient,
  type EVMLog,
  getNetwork,
  handler,
  hexToBase64,
  type HTTPSendRequester,
  json,
  ok,
  Runner,
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import { decodeAbiParameters, encodeAbiParameters, getAddress, keccak256, toBytes } from "viem";
import { assess, HANDLE_RULE, linkCode, type Profile, type Stats } from "../../src/lib/rating";

// Away Chess: a player's chess.com rating, brought on-chain.
//
// Trigger:  LinkRequested(player, handle) on ChessRatings: a player asks to link a chess.com account.
// Fetch:    that account's public profile and ratings from chess.com's API (every node asks; the
//           answers must agree).
// Decide:   does the profile carry the code derived from the player's address (src/lib/rating.ts)?
// Write:    a signed report through the Chainlink forwarder to ChessRatings: the ratings if the
//           account is theirs, or why not.
//
// The chain cannot read chess.com and chess.com knows nothing about Monad addresses; this workflow is
// the piece that connects them, so a rating shown in the game is one the player could not type in.

type Config = {
  chainSelectorName: string;
  /** ChessRatings: emits LinkRequested and receives the reports. */
  ratingsAddress: `0x${string}`;
  /** chess.com's public player endpoint. */
  apiBase: string;
  gasLimit: string;
};

const LINK_REQUESTED = keccak256(toBytes("LinkRequested(address,string)"));

/** What one node saw on chess.com, reduced to the few plain values the nodes must agree on. */
type Seen = { found: boolean; username: string; name: string; location: string; rapid: number; blitz: number; bullet: number };

const lookUp = (sendRequester: HTTPSendRequester, apiBase: string, handle: string): Seen => {
  const get = (url: string) =>
    sendRequester
      .sendRequest({ url, method: "GET", multiHeaders: { "User-Agent": { values: ["AwayChess/1.0 (rating link)"] }, Accept: { values: ["application/json"] } } })
      .result();
  const nothing: Seen = { found: false, username: "", name: "", location: "", rapid: 0, blitz: 0, bullet: 0 };

  const profileResponse = get(`${apiBase}/${handle}`);
  if (profileResponse.statusCode === 404 || profileResponse.statusCode === 410) return nothing;
  if (!ok(profileResponse)) throw new Error(`chess.com profile request failed: ${profileResponse.statusCode}`);
  const profile = json(profileResponse) as Profile;

  const statsResponse = get(`${apiBase}/${handle}/stats`);
  if (!ok(statsResponse)) throw new Error(`chess.com stats request failed: ${statsResponse.statusCode}`);
  const stats = json(statsResponse) as Stats;
  const last = (s: Stats[keyof Stats]) => Math.round(Number(s?.last?.rating ?? 0)) || 0;

  return {
    found: true,
    username: String(profile.username ?? ""),
    name: String(profile.name ?? ""),
    location: String(profile.location ?? ""),
    rapid: last(stats.chess_rapid),
    blitz: last(stats.chess_blitz),
    bullet: last(stats.chess_bullet),
  };
};

const client = (config: Config) => {
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: config.chainSelectorName });
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`);
  return new EVMClient(network.chainSelector.selector);
};

const onLinkRequested = (runtime: Runtime<Config>, log: EVMLog): string => {
  const config = runtime.config;
  // LinkRequested(address indexed player, string handle): topic 1 is the player, the data is the handle.
  const player = getAddress(`0x${bytesToHex(log.topics[1]).slice(-40)}`);
  const [handle] = decodeAbiParameters([{ type: "string" }], bytesToHex(log.data));
  if (!HANDLE_RULE.test(handle)) throw new Error(`Not a chess.com username: ${handle}`);
  runtime.log(`${player} asks to link chess.com/${handle}; their code is ${linkCode(player)}`);

  const seen = new cre.capabilities.HTTPClient()
    .sendRequest(runtime, lookUp, consensusIdenticalAggregation<Seen>())(config.apiBase, handle)
    .result();
  const verdict = assess(
    player,
    handle,
    seen.found ? { username: seen.username, name: seen.name, location: seen.location } : null,
    { chess_rapid: { last: { rating: seen.rapid } }, chess_blitz: { last: { rating: seen.blitz } }, chess_bullet: { last: { rating: seen.bullet } } }
  );
  runtime.log(
    seen.found
      ? `chess.com/${handle}: location "${seen.location}", rapid ${seen.rapid}, blitz ${seen.blitz}, bullet ${seen.bullet} -> outcome ${verdict.outcome}`
      : `chess.com has no player ${handle} -> outcome ${verdict.outcome}`
  );

  // Matches ChessRatings.onReport's abi.decode.
  const payload = encodeAbiParameters(
    [{ type: "address" }, { type: "string" }, { type: "uint16" }, { type: "uint16" }, { type: "uint16" }, { type: "uint8" }],
    [player, handle, verdict.rapid, verdict.blitz, verdict.bullet, verdict.outcome]
  );
  const report = runtime
    .report({ encodedPayload: hexToBase64(payload), encoderName: "evm", signingAlgo: "ecdsa", hashingAlgo: "keccak256" })
    .result();
  const written = client(config)
    .writeReport(runtime, { receiver: config.ratingsAddress, report, gasConfig: { gasLimit: config.gasLimit } })
    .result();
  if (written.txStatus !== TxStatus.SUCCESS) throw new Error(`Report transaction failed: ${written.txStatus}`);
  const txHash = bytesToHex(written.txHash ?? new Uint8Array(32));
  runtime.log(`Report for ${player} delivered in ${txHash}`);
  return txHash;
};

const initWorkflow = (config: Config) => [
  handler(
    client(config).logTrigger({
      addresses: [hexToBase64(config.ratingsAddress)],
      topics: [{ values: [hexToBase64(LINK_REQUESTED)] }],
    }),
    onLinkRequested
  ),
];

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
