import { useEffect, useState } from "react";
import { parseEventLogs, parseUnits } from "viem";
import { degenChessAbi } from "../contracts/abi";
import { TOKEN_DECIMALS, TOKEN_MINTABLE, TOKEN_SYMBOL } from "../config";
import { useDegenAccount } from "../lib/account";
import { TIME_CONTROLS } from "../lib/clock";
import { chessContract, Result, Status, tokenContract, useTokenState } from "../lib/contract";
import { formatToken, sameAddress } from "../lib/format";
import { type ListedGame, usePositions, useRecentGames } from "../lib/games";
import { useNames } from "../lib/names";
import { withApproval } from "../lib/stake";
import { Icon } from "./Icon";
import { type Cell, MiniBoard, waitingBoard } from "./MiniBoard";

const STAKE_PRESETS = ["1", "5", "10"];
const WAITING = waitingBoard();
const START: Cell[][] = waitingBoard().map((row) => row.map(() => null));

function parseStake(value: string): bigint | null {
  try {
    const v = parseUnits(value.trim(), TOKEN_DECIMALS);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** Start a board: the stake and the clock, each a rank of squares. */
function StartBoard({ onOpenGame }: { onOpenGame: (id: bigint) => void }) {
  const { address, returning, busy, sendMoney, gameKeyTopUp } = useDegenAccount();
  const { balance } = useTokenState();
  const [stakeInput, setStakeInput] = useState("1");
  const [control, setControl] = useState<(typeof TIME_CONTROLS)[number]>(TIME_CONTROLS[1]);

  const hasAccount = address !== null || returning;
  const stake = parseStake(stakeInput);
  const short = stake !== null && balance !== undefined && balance < stake;
  const custom = !STAKE_PRESETS.includes(stakeInput);

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

  return (
    <div className="yard__start">
      <h3 className="panel-title">Start a board</h3>

      <p id="stake-label" className="soft mb-1 text-sm">
        Your stake, in {TOKEN_SYMBOL}. Your opponent matches it.
      </p>
      <div className="rank mb-4" role="group" aria-labelledby="stake-label">
        {STAKE_PRESETS.map((preset) => (
          <button key={preset} className="rank__square" aria-pressed={stakeInput === preset} onClick={() => setStakeInput(preset)}>
            {preset}
          </button>
        ))}
        <input
          className="rank__square"
          value={custom ? stakeInput : ""}
          onChange={(e) => setStakeInput(e.target.value)}
          placeholder="other"
          inputMode="decimal"
          aria-label="Another stake amount"
        />
      </div>

      <p id="clock-label" className="soft mb-1 text-sm">
        Minutes each, plus seconds added per move.
      </p>
      <div className="rank mb-4" role="group" aria-labelledby="clock-label">
        {TIME_CONTROLS.map((c) => (
          <button key={c.label} className="rank__square" aria-pressed={control.label === c.label} onClick={() => setControl(c)}>
            {c.label}
            <small>{c.hint}</small>
          </button>
        ))}
      </div>

      <button onClick={createGame} disabled={!hasAccount || stake === null || short || busy !== null} className="act w-full">
        {busy ?? (hasAccount ? "Create Game" : "Press Play now to get started")}
      </button>
      <p className="soft mt-2 text-sm">
        {short ? (
          <span style={{ color: "var(--alert)" }}>You have {formatToken(balance)} {TOKEN_SYMBOL}. Lower the stake or mint more.</span>
        ) : hasAccount ? (
          "Staking asks for your passkey. Moves never do."
        ) : (
          "You play White and move first."
        )}
      </p>
      {TOKEN_MINTABLE && address && (
        <button
          className="link mt-1 text-sm"
          disabled={busy !== null}
          onClick={() =>
            sendMoney(`Mint test ${TOKEN_SYMBOL}`, (id) => [
              { ...tokenContract, functionName: "mint", args: [id.address, parseUnits("100", TOKEN_DECIMALS)] },
            ])
          }
        >
          Mint 100 test {TOKEN_SYMBOL}
        </button>
      )}
    </div>
  );
}

type Tab = "open" | "live" | "done";
const TABS: { id: Tab; name: string; empty: string }[] = [
  { id: "open", name: "Waiting", empty: "Nobody is waiting for an opponent. Start a board and send the link to someone." },
  { id: "live", name: "Live", empty: "No games are being played right now." },
  { id: "done", name: "Finished", empty: "No finished games yet." },
];

/** True on phone-width screens, where the yard shows two boards at a time instead of three. */
function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 560px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

/**
 * The yard: start a board on the left; on the right, the games out there, a few at a time.
 * Each game is a small board at its real position, and the board is the button.
 */
export function Yard({ onOpenGame }: { onOpenGame: (id: bigint) => void }) {
  const { address } = useDegenAccount();
  const { games } = useRecentGames();
  const { label } = useNames(games.flatMap((g) => [g.white, g.black]));
  const narrow = useNarrow();
  const [picked, setPicked] = useState<Tab | null>(null);
  const [page, setPage] = useState(0);

  const me = address ?? undefined;
  const mine = (g: ListedGame) => sameAddress(g.white, me) || sameAddress(g.black, me);
  const live = games.filter((g) => g.status === Status.Active);
  const lists: Record<Tab, ListedGame[]> = {
    open: games.filter((g) => g.status === Status.Open),
    live: [...live.filter(mine), ...live.filter((g) => !mine(g))],
    done: games.filter((g) => g.status === Status.Finished),
  };
  // Until a tab is chosen, show the first that has anything in it.
  const tab = picked ?? TABS.find((t) => lists[t.id].length > 0)?.id ?? "open";
  const perPage = narrow ? 2 : 3;
  const pages = Math.max(Math.ceil(lists[tab].length / perPage), 1);
  const current = Math.min(page, pages - 1);
  const visible = lists[tab].slice(current * perPage, (current + 1) * perPage);
  const positions = usePositions(visible);

  const table = (g: ListedGame) => {
    const isOpen = g.status === Status.Open;
    const isLive = g.status === Status.Active;
    const total = g.whiteBalance + g.blackBalance;
    const share = total > 0n ? Number((g.whiteBalance * 1000n) / total) / 10 : 50;
    const action = isOpen ? (sameAddress(g.white, me) ? "View" : "Join") : isLive ? (mine(g) ? "Resume" : "Watch") : "Review";
    const result = g.result === Result.Draw ? "drawn" : g.result === Result.WhiteWins ? "White won" : "Black won";
    const who = isOpen ? `${label(g.white)} is waiting` : `${label(g.white)} v ${label(g.black)}`;
    return (
      <button key={g.id.toString()} className="table" onClick={() => onOpenGame(g.id)} aria-label={`${action} board ${g.id}: ${who}`}>
        <MiniBoard rows={isOpen ? WAITING : (positions.get(g.id.toString()) ?? START)} waiting={isOpen} />
        <span className="mt-3 flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate font-bold">
            <span className="amount">
              {formatToken(g.stake)} {TOKEN_SYMBOL}
            </span>{" "}
            <span className="soft font-medium">{g.clock === "No clock" ? "no clock" : g.clock}</span>
          </span>
          <span className="link shrink-0 text-sm">{action}</span>
        </span>
        <span className="soft block truncate text-sm">{g.status === Status.Finished ? `${who}, ${result}` : who}</span>
        {isLive && (
          <span className="split mt-2 block" title="How the pot is split right now">
            <span className="block" style={{ transform: `scaleX(${share / 100})` }} />
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="yard">
      <StartBoard onOpenGame={onOpenGame} />
      <div>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              className="ghost"
              aria-pressed={tab === t.id}
              onClick={() => {
                setPicked(t.id);
                setPage(0);
              }}
            >
              {t.name} <span className={tab === t.id ? "" : "soft"}>{lists[t.id].length}</span>
            </button>
          ))}
        </div>

        {visible.length > 0 ? <div className="yard__boards">{visible.map(table)}</div> : <p className="soft max-w-md">{TABS.find((t) => t.id === tab)?.empty}</p>}

        {pages > 1 && (
          <div className="mt-6 flex items-center gap-3">
            <button className="ghost" aria-label="Previous boards" disabled={current === 0} onClick={() => setPage(current - 1)}>
              <Icon name="back" />
            </button>
            <span className="soft text-sm">
              {current + 1} of {pages}
            </span>
            <button className="ghost" aria-label="More boards" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>
              <span style={{ display: "inline-flex", transform: "scaleX(-1)" }}>
                <Icon name="back" />
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
