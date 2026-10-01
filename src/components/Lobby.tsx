import { useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { maxUint256, parseEventLogs, parseUnits } from "viem";
import { degenChessAbi } from "../contracts/abi";
import { TOKEN_DECIMALS, TOKEN_MINTABLE, TOKEN_SYMBOL } from "../config";
import { publicClient, useDegenAccount, type Call } from "../lib/account";
import { describeClock, TIME_CONTROLS } from "../lib/clock";
import { chessContract, POLL_MS, Status, toGameInfo, tokenContract, useTokenState } from "../lib/contract";
import { formatToken, sameAddress } from "../lib/format";
import { useNames } from "../lib/names";

const RECENT_GAMES = 25;
const STAKE_PRESETS = ["1", "5", "10"];

function parseStake(value: string): bigint | null {
  try {
    const v = parseUnits(value.trim(), TOKEN_DECIMALS);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** Approve (only if needed) + the staking call, signed together under one passkey prompt. */
export async function withApproval(owner: `0x${string}`, amount: bigint, call: Call): Promise<Call[]> {
  const allowance = await publicClient.readContract({
    ...tokenContract,
    functionName: "allowance",
    args: [owner, chessContract.address],
  });
  const approve: Call = { ...tokenContract, functionName: "approve", args: [chessContract.address, maxUint256] };
  return allowance < amount ? [approve, call] : [call];
}

export function Lobby({ onOpenGame }: { onOpenGame: (id: bigint) => void }) {
  const { address, returning, busy, sendMoney, gameKeyTopUp } = useDegenAccount();
  const { balance } = useTokenState();
  const [stakeInput, setStakeInput] = useState("1");
  const [control, setControl] = useState<(typeof TIME_CONTROLS)[number]>(TIME_CONTROLS[1]);
  const [idInput, setIdInput] = useState("");

  const hasAccount = address !== null || returning;
  const stake = parseStake(stakeInput);
  const insufficient = stake !== null && balance !== undefined && balance < stake;

  const { data: gameCount } = useReadContract({
    ...chessContract,
    functionName: "gameCount",
    query: { refetchInterval: POLL_MS },
  });
  const ids: bigint[] = [];
  for (let i = gameCount ?? 0n; i > 0n && ids.length < RECENT_GAMES; i--) ids.push(i - 1n);
  const { data: recent } = useReadContracts({
    contracts: ids.flatMap((id) => [
      { ...chessContract, functionName: "getGame" as const, args: [id] as const },
      { ...chessContract, functionName: "getClock" as const, args: [id] as const },
    ]),
    query: { enabled: ids.length > 0, refetchInterval: POLL_MS },
  });
  const games = ids
    .map((id, i) => {
      const game = recent?.[i * 2];
      const clock = recent?.[i * 2 + 1];
      if (game?.status !== "success") return null;
      const [base, increment] = clock?.status === "success" ? (clock.result as readonly number[]) : [0, 0];
      return { id, clock: describeClock(base, increment), ...toGameInfo(game.result as any) };
    })
    .filter((g) => g !== null);
  const openGames = games.filter((g) => g.status === Status.Open);
  const myGames = games.filter(
    (g) => g.status !== Status.Cancelled && (sameAddress(g.white, address ?? undefined) || sameAddress(g.black, address ?? undefined))
  );
  const { label } = useNames(games.map((g) => g.white));

  async function createGame() {
    if (stake === null) return;
    const receipt = await sendMoney(`Stake ${stakeInput} ${TOKEN_SYMBOL} & create game`, async (id) =>
      withApproval(id.address, stake, {
        ...chessContract,
        functionName: "createGame",
        args: [stake, id.gameKey, control.base, control.increment],
        value: await gameKeyTopUp(id.gameKey),
      })
    );
    const created = receipt && parseEventLogs({ abi: degenChessAbi, logs: receipt.logs, eventName: "GameCreated" })[0];
    if (created) onOpenGame(created.args.gameId);
  }

  const gameRow = (g: (typeof games)[number], action: string) => (
    <li key={g.id.toString()} className="flex items-center justify-between gap-2 border-b border-white/5 py-2 last:border-0">
      <span className="min-w-0 truncate">
        <span className="font-bold text-[#ffd23f]">
          {formatToken(g.stake)} {TOKEN_SYMBOL}
        </span>{" "}
        &middot; {g.clock} &middot; <span className="text-white">{label(g.white)}</span>{" "}
        <span className="opacity-50">#{g.id.toString()}</span>
      </span>
      <button onClick={() => onOpenGame(g.id)} className="retro-button-sm shrink-0">
        {action}
      </button>
    </li>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="retro-panel">
        <h2 className="panel-title">Create Game</h2>
        <p className="mb-3 text-sm opacity-80">
          You play the Bulls and move first. Your opponent matches your stake. Every capture moves that piece&apos;s share
          of the stake (pawn 1, knight or bishop 3, rook 5, queen 9, out of 39) to the capturer.
        </p>

        <label className="mb-1 block text-sm font-bold">Stake ({TOKEN_SYMBOL})</label>
        <div className="mb-3 flex gap-2">
          {STAKE_PRESETS.map((preset) => (
            <button
              key={preset}
              className={`btn-ghost ${stakeInput === preset ? "!border-[#00ff66]" : ""}`}
              onClick={() => setStakeInput(preset)}
            >
              {preset}
            </button>
          ))}
          <input
            value={stakeInput}
            onChange={(e) => setStakeInput(e.target.value)}
            className="min-w-0 flex-1"
            inputMode="decimal"
            aria-label="Stake amount"
          />
        </div>

        <label className="mb-1 block text-sm font-bold">Time control</label>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIME_CONTROLS.map((c) => (
            <button
              key={c.label}
              className={`btn-ghost !h-auto flex-col !gap-0 py-2 ${control.label === c.label ? "!border-[#00ff66]" : ""}`}
              onClick={() => setControl(c)}
            >
              <span>{c.label}</span>
              <span className="text-xs font-normal opacity-60">{c.hint}</span>
            </button>
          ))}
        </div>

        {address && (
          <p className="mb-2 text-sm opacity-80">
            Balance: {formatToken(balance)} {TOKEN_SYMBOL}
          </p>
        )}
        <button
          onClick={createGame}
          disabled={!hasAccount || stake === null || insufficient || busy !== null}
          className="retro-button w-full"
        >
          {busy ?? (hasAccount ? "Create Game" : "Press Play now to get started")}
        </button>
        {hasAccount && <p className="mt-2 text-sm opacity-80">Staking asks for your passkey. Moves never do.</p>}
        {insufficient && <p className="mt-2 text-red-400">Not enough {TOKEN_SYMBOL}.</p>}
        {TOKEN_MINTABLE && address && (
          <button
            onClick={() =>
              sendMoney(`Mint test ${TOKEN_SYMBOL}`, (id) => [
                { ...tokenContract, functionName: "mint", args: [id.address, parseUnits("100", TOKEN_DECIMALS)] },
              ])
            }
            disabled={busy !== null}
            className="mt-3 text-sm underline opacity-80"
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
          <ul>{openGames.map((g) => gameRow(g, sameAddress(g.white, address ?? undefined) ? "View" : "Join"))}</ul>
        )}

        {myGames.length > 0 && (
          <>
            <h2 className="panel-title mt-5">Your Games</h2>
            <ul>{myGames.map((g) => gameRow(g, Status[g.status]))}</ul>
          </>
        )}

        <h2 className="panel-title mt-5">Go to Game</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d+$/.test(idInput.trim())) onOpenGame(BigInt(idInput.trim()));
          }}
        >
          <input value={idInput} onChange={(e) => setIdInput(e.target.value)} placeholder="Game ID" className="min-w-0 flex-1" />
          <button type="submit" className="retro-button-sm">
            Open
          </button>
        </form>
      </section>
    </div>
  );
}
