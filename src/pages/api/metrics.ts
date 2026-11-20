import type { NextApiRequest, NextApiResponse } from "next";
import { createPublicClient, http } from "viem";
import { CHAIN, CONTRACT_ADDRESS } from "../../config";
import { degenChessAbi } from "../../contracts/abi";
import { computeMetrics, type GameRow, type Metrics } from "../../lib/metrics";

// Public business metrics, computed from the game contract (all of it public on-chain data).
// Cached at the edge for five minutes so a busy stats page costs one read of the chain.
const BATCH = 150;

export default async function handler(_req: NextApiRequest, res: NextApiResponse<Metrics | { error: string }>) {
  try {
    const client = createPublicClient({ chain: CHAIN, transport: http() });
    const contract = { address: CONTRACT_ADDRESS, abi: degenChessAbi } as const;
    const count = Number(await client.readContract({ ...contract, functionName: "gameCount" }));
    const rows: GameRow[] = [];
    for (let from = 0; from < count; from += BATCH) {
      const ids = Array.from({ length: Math.min(BATCH, count - from) }, (_, i) => BigInt(from + i));
      const calls = ids.map((id) => ({ ...contract, functionName: "getGame" as const, args: [id] as const }));
      const results = CHAIN.contracts?.multicall3
        ? await client.multicall({ contracts: calls, allowFailure: true })
        : await Promise.all(calls.map((c) => client.readContract(c).then((result) => ({ status: "success" as const, result }), () => ({ status: "failure" as const }))));
      results.forEach((r, i) => {
        if (r.status !== "success" || !r.result) return;
        const [white, black, stake, , , status, result, , lastMoveAt, moveCount] = r.result as readonly [string, string, bigint, bigint, bigint, number, number, string, bigint, bigint];
        rows.push({ id: Number(ids[i]), white, black, stake, status, result, lastMoveAt: Number(lastMoveAt), moveCount: Number(moveCount) });
      });
    }
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.status(200).json(computeMetrics(rows));
  } catch {
    res.status(502).json({ error: "could not read the games" });
  }
}
