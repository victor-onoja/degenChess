import { useState } from "react";
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
import { MiniBoard, waitingBoard } from "./MiniBoard";

const STAKE_PRESETS = ["1", "5", "10"];
const WAITING = waitingBoard();
const START = waitingBoard().map((row) => row.map(() => null));

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

/**
 * The yard: every game is a small living board. Open ones have a king waiting with its stake
 * beating in its chest; live ones show the real position, move by move.
 */
export function Yard({ onOpenGame }: { onOpenGame: (id: bigint) => void }) {
  const { address } = useDegenAccount();
  const { games } = useRecentGames();
  const positions = usePositions(games);
  const { label } = useNames(games.flatMap((g) => [g.white, g.black]));
  const [idInput, setIdInput] = useState("");

  const me = address ?? undefined;
  const mine = (g: ListedGame) => sameAddress(g.white, me) || sameAddress(g.black, me);
  const open = games.filter((g) => g.status === Status.Open);
  const live = games.filter((g) => g.status === Status.Active);
  const finished = games.filter((g) => g.status === Status.Finished).slice(0, 4);
  // Your own boards first, then boards waiting for someone, then games to watch.
  const tables = [...live.filter(mine), ...open, ...live.filter((g) => !mine(g)), ...finished];

  const table = (g: ListedGame) => {
    const isOpen = g.status === Status.Open;
    const isLive = g.status === Status.Active;
    const total = g.whiteBalance + g.blackBalance;
    const share = total > 0n ? Number((g.whiteBalance * 1000n) / total) / 10 : 50;
    const action = isOpen ? (sameAddress(g.white, me) ? "View" : "Join") : isLive ? (mine(g) ? "Resume" : "Watch") : "Review";
    const result = g.result === Result.Draw ? "Drawn" : g.result === Result.WhiteWins ? "White won" : "Black won";
    const who = isOpen ? `${label(g.white)} is waiting` : `${label(g.white)} v ${label(g.black)}`;
    return (
      <div key={g.id.toString()}>
        <button className="table" onClick={() => onOpenGame(g.id)} aria-label={`${action} board ${g.id}: ${who}`}>
          <MiniBoard rows={isOpen ? WAITING : (positions.get(g.id.toString()) ?? START)} waiting={isOpen} />
        </button>
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <span className="font-bold">
            <span className="amount">
              {formatToken(g.stake)} {TOKEN_SYMBOL}
            </span>{" "}
            <span className="soft font-medium">{g.clock === "No clock" ? "no clock" : g.clock}</span>
          </span>
          {isLive && (
            <span className="soft flex items-center gap-1.5 text-sm">
              <span className="live-mark" /> live
            </span>
          )}
          {g.status === Status.Finished && <span className="soft text-sm">{result}</span>}
        </div>
        <p className="truncate text-sm">{who}</p>
        {!isOpen && (
          <div className="split mt-2" title="How the pot is split right now">
            <div style={{ transform: `scaleX(${share / 100})` }} />
          </div>
        )}
        <button className={`act act--sm mt-3 ${isOpen && !sameAddress(g.white, me) ? "" : "act--bone"}`} onClick={() => onOpenGame(g.id)}>
          {action === "Watch" && <Icon name="eye" size={18} />}
          {action}
        </button>
      </div>
    );
  };

  return (
    <>
      <div className="yard">
        <StartBoard onOpenGame={onOpenGame} />
        {tables.map(table)}
      </div>
      {tables.length === 0 && (
        <p className="soft mt-8 max-w-md">
          The yard is empty right now. Start a board and send the link to someone, or open a second window and play yourself.
        </p>
      )}
      <form
        className="mt-10 flex max-w-xs items-stretch"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^\d+$/.test(idInput.trim())) onOpenGame(BigInt(idInput.trim()));
        }}
      >
        <input
          value={idInput}
          onChange={(e) => setIdInput(e.target.value)}
          placeholder="Board number"
          aria-label="Board number"
          inputMode="numeric"
          className="min-h-[44px] flex-1 px-3"
        />
        <button type="submit" className="ghost" style={{ borderRadius: 0 }}>
          Open
        </button>
      </form>
    </>
  );
}
