import { useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { parseEventLogs, parseUnits, zeroAddress } from "viem";
import { degenChessAbi } from "../contracts/abi";
import { TOKEN_DECIMALS, TOKEN_MINTABLE, TOKEN_SYMBOL } from "../config";
import { chessContract, POLL_MS, Status, toGameInfo, tokenContract, useTokenState } from "../lib/contract";
import { formatToken, sameAddress, shortAddress } from "../lib/format";
import { useTx } from "../lib/useTx";

const RECENT_GAMES = 25;

function parseStake(value: string): bigint | null {
  try {
    const v = parseUnits(value.trim(), TOKEN_DECIMALS);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

export function Lobby({ onOpenGame }: { onOpenGame: (id: bigint) => void }) {
  const { address, isConnected } = useAccount();
  const { balance, allowance } = useTokenState();
  const { send, pending } = useTx();
  const [stakeInput, setStakeInput] = useState("1");
  const [idInput, setIdInput] = useState("");

  const stake = parseStake(stakeInput);
  const needsApproval = stake !== null && (allowance ?? 0n) < stake;
  const insufficient = stake !== null && balance !== undefined && balance < stake;

  const { data: gameCount } = useReadContract({
    ...chessContract,
    functionName: "gameCount",
    query: { refetchInterval: POLL_MS },
  });
  const ids: bigint[] = [];
  for (let i = gameCount ?? 0n; i > 0n && ids.length < RECENT_GAMES; i--) ids.push(i - 1n);
  const { data: recent } = useReadContracts({
    contracts: ids.map((id) => ({ ...chessContract, functionName: "getGame" as const, args: [id] as const })),
    query: { enabled: ids.length > 0, refetchInterval: POLL_MS },
  });
  const games = ids
    .map((id, i) => {
      const r = recent?.[i];
      return r?.status === "success" ? { id, ...toGameInfo(r.result) } : null;
    })
    .filter((g) => g !== null);
  const openGames = games.filter((g) => g.status === Status.Open);
  const myGames = games.filter(
    (g) => g.status !== Status.Cancelled && (sameAddress(g.white, address) || sameAddress(g.black, address))
  );

  async function createGame() {
    if (stake === null) return;
    if (needsApproval) {
      await send(`Approve ${TOKEN_SYMBOL}`, { ...tokenContract, functionName: "approve", args: [chessContract.address, stake] });
      return;
    }
    const receipt = await send("Create game", { ...chessContract, functionName: "createGame", args: [stake, zeroAddress] });
    const created = receipt && parseEventLogs({ abi: degenChessAbi, logs: receipt.logs, eventName: "GameCreated" })[0];
    if (created) onOpenGame(created.args.gameId);
  }

  const gameRow = (g: (typeof games)[number], label: string) => (
    <li key={g.id.toString()} className="flex items-center justify-between gap-2 py-1">
      <span>
        #{g.id.toString()} &middot; {formatToken(g.stake)} {TOKEN_SYMBOL} &middot; {shortAddress(g.white)}
      </span>
      <button onClick={() => onOpenGame(g.id)} className="retro-button-sm">
        {label}
      </button>
    </li>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="retro-panel">
        <h2 className="panel-title">Create Game</h2>
        <p className="mb-2 opacity-80">
          You play White. Your opponent matches your stake. Every capture moves that piece&apos;s value
          (pawn 1, knight/bishop 3, rook 5, queen 9 out of 39) from the victim to the capturer.
        </p>
        <label className="block mb-1">Stake ({TOKEN_SYMBOL})</label>
        <input value={stakeInput} onChange={(e) => setStakeInput(e.target.value)} className="w-full mb-2" inputMode="decimal" />
        <p className="mb-2 text-sm opacity-80">
          Balance: {formatToken(balance)} {TOKEN_SYMBOL}
        </p>
        <button
          onClick={createGame}
          disabled={!isConnected || stake === null || insufficient || pending !== null}
          className="retro-button w-full"
        >
          {pending ?? (needsApproval ? `Approve ${stakeInput} ${TOKEN_SYMBOL}` : "Create Game")}
        </button>
        {insufficient && <p className="mt-2 text-red-400">Not enough {TOKEN_SYMBOL}.</p>}
        {TOKEN_MINTABLE && isConnected && (
          <button
            onClick={() =>
              send(`Mint test ${TOKEN_SYMBOL}`, {
                ...tokenContract,
                functionName: "mint",
                args: [address!, parseUnits("100", TOKEN_DECIMALS)],
              })
            }
            disabled={pending !== null}
            className="retro-button-sm mt-3"
          >
            Mint 100 test {TOKEN_SYMBOL}
          </button>
        )}
      </section>

      <section className="retro-panel">
        <h2 className="panel-title">Open Games</h2>
        {openGames.length === 0 ? (
          <p className="opacity-80">No open games. Create one!</p>
        ) : (
          <ul>{openGames.map((g) => gameRow(g, sameAddress(g.white, address) ? "View" : "Join"))}</ul>
        )}

        {myGames.length > 0 && (
          <>
            <h2 className="panel-title mt-4">Your Games</h2>
            <ul>{myGames.map((g) => gameRow(g, Status[g.status]))}</ul>
          </>
        )}

        <h2 className="panel-title mt-4">Go to Game</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d+$/.test(idInput.trim())) onOpenGame(BigInt(idInput.trim()));
          }}
        >
          <input value={idInput} onChange={(e) => setIdInput(e.target.value)} placeholder="Game ID" className="flex-1" />
          <button type="submit" className="retro-button-sm">
            Open
          </button>
        </form>
      </section>
    </div>
  );
}
