import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { parseEventLogs, parseUnits } from "viem";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { AccountBar } from "../components/AccountBar";
import { Icon } from "../components/Icon";
import { Seo } from "../components/Seo";
import { Wordmark } from "../components/Wordmark";
import { TOKEN_DECIMALS, TOKEN_SYMBOL, TOURNAMENTS_ADDRESS } from "../config";
import { degenChessAbi, tournamentsAbi } from "../contracts/abi";
import { useDegenAccount } from "../lib/account";
import { describeClock, TIME_CONTROLS } from "../lib/clock";
import { chessContract, Result, Status } from "../lib/contract";
import { formatToken, sameAddress } from "../lib/format";
import { useNames } from "../lib/names";
import { shareLink } from "../lib/share";
import { withApproval } from "../lib/stake";
import { tournamentsContract, useFixtures, usePrize, useTournament, useTournamentList, type Fixture, type ListedTournament, type Tournament } from "../lib/tournaments";

// Tournaments: a league where everyone plays everyone once, each game an ordinary staked game.
// Create one, share the link, start it when the players are in, and the table fills itself in.

const STAKES = ["1", "5", "10"];
const FEES = ["0", "1", "5", "10"]; // entry fee into the prize pot; 0 = no pot
const SPLITS = ["Winner takes all", "Top three: 50 / 30 / 20"];
const LENGTHS = [
  { label: "1 day", seconds: 86_400 },
  { label: "3 days", seconds: 259_200 },
  { label: "7 days", seconds: 604_800 },
];
const points = (p: number) => (p % 2 === 0 ? String(p / 2) : `${Math.floor(p / 2)}½`);

function Create({ onCreated }: { onCreated: (id: bigint) => void }) {
  const { address, returning, busy, sendMoney } = useDegenAccount();
  const [name, setName] = useState("");
  const [stake, setStake] = useState("1");
  const [control, setControl] = useState<(typeof TIME_CONTROLS)[number]>(TIME_CONTROLS[1]);
  const [fee, setFee] = useState("0");
  const [split, setSplit] = useState(0);
  const [length, setLength] = useState(LENGTHS[1]);
  const ready = (address !== null || returning) && name.trim().length >= 3;
  const pot = fee !== "0";

  async function create() {
    const entry = parseUnits(fee, TOKEN_DECIMALS);
    const call = {
      ...tournamentsContract,
      functionName: "create" as const,
      args: [name.trim(), parseUnits(stake, TOKEN_DECIMALS), control.base, control.increment, entry, pot ? split : 0, pot ? length.seconds : 0] as const,
    };
    const receipt = await sendMoney(pot ? `Create "${name.trim()}" and pay ${fee} ${TOKEN_SYMBOL}` : `Create "${name.trim()}"`, async (id) =>
      pot ? withApproval(id.address, entry, call, TOURNAMENTS_ADDRESS) : [call]
    );
    const created = receipt && parseEventLogs({ abi: tournamentsAbi, logs: receipt.logs, eventName: "Created" })[0];
    if (created) onCreated(created.args.id);
  }

  return (
    <div className="max-w-sm">
      <h2 className="panel-title">Start a tournament</h2>
      <p className="field-label">Name</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 40))}
        placeholder="Friday night blitz"
        aria-label="Tournament name"
        className="mb-4 min-h-[44px] w-full px-3"
      />
      <p id="t-stake" className="field-label">
        Stake per game <span className="soft font-normal">in {TOKEN_SYMBOL}</span>
      </p>
      <div className="rank mb-4" role="group" aria-labelledby="t-stake">
        {STAKES.map((s) => (
          <button key={s} className="rank__square" aria-pressed={stake === s} onClick={() => setStake(s)}>
            {s}
          </button>
        ))}
      </div>
      <p id="t-clock" className="field-label">
        Clock
      </p>
      <div className="rank mb-4" role="group" aria-labelledby="t-clock">
        {TIME_CONTROLS.map((c) => (
          <button key={c.label} className="rank__square" aria-pressed={control.label === c.label} onClick={() => setControl(c)}>
            {c.label}
            <small>{c.hint}</small>
          </button>
        ))}
      </div>

      <p id="t-fee" className="field-label">
        Prize pot <span className="soft font-normal">entry fee each player pays in</span>
      </p>
      <div className="rank mb-4" role="group" aria-labelledby="t-fee">
        {FEES.map((f) => (
          <button key={f} className="rank__square" aria-pressed={fee === f} onClick={() => setFee(f)}>
            {f === "0" ? "None" : f}
          </button>
        ))}
      </div>
      {pot && (
        <>
          <p id="t-split" className="field-label">
            Prizes
          </p>
          <div className="mb-4 grid gap-1.5" role="group" aria-labelledby="t-split">
            {SPLITS.map((label, i) => (
              <button key={label} className="rank__square !min-h-[44px]" aria-pressed={split === i} onClick={() => setSplit(i)}>
                {label}
              </button>
            ))}
          </div>
          <p id="t-length" className="field-label">
            Runs for <span className="soft font-normal">then the pot pays on the results so far</span>
          </p>
          <div className="rank mb-4" role="group" aria-labelledby="t-length">
            {LENGTHS.map((l) => (
              <button key={l.label} className="rank__square" aria-pressed={length.label === l.label} onClick={() => setLength(l)}>
                {l.label}
              </button>
            ))}
          </div>
        </>
      )}

      <button className="act w-full" disabled={!ready || busy !== null} onClick={create}>
        {busy ?? (address === null && !returning ? "Sign in to create" : pot ? `Create and pay ${fee} ${TOKEN_SYMBOL}` : "Create tournament")}
      </button>
      <p className="soft mt-2 text-sm">
        Everyone plays everyone once, each game staked as usual. {pot ? "The whole pot goes to the players: nobody takes a cut, and it is refunded if you cancel before starting." : "Without a pot, creating and joining are free."}
      </p>
    </div>
  );
}

const TABS = [
  { id: "open", name: "Open", empty: "No tournament is taking entries right now. Start one: it takes a name and a tap." },
  { id: "running", name: "Running", empty: "No tournament is being played right now." },
  { id: "finished", name: "Finished", empty: "No tournament has finished yet." },
] as const;
const day = (seconds: bigint) => new Date(Number(seconds) * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function List({ onOpen }: { onOpen: (id: bigint) => void }) {
  const { list, loading } = useTournamentList();
  const { label } = useNames(list.flatMap((x) => [x.t.host, ...x.winners]));
  const [picked, setPicked] = useState<(typeof TABS)[number]["id"] | null>(null);
  if (loading && list.length === 0) return <p className="soft">Looking for tournaments...</p>;
  if (list.length === 0) return <p className="soft">No tournaments yet. Start the first one.</p>;
  // Until a tab is chosen, show the first that has anything in it.
  const tab = picked ?? TABS.find((t) => list.some((x) => x.state === t.id))?.id ?? "open";
  const shown = list.filter((x) => x.state === tab);
  const money = (v: bigint) => `${formatToken(v)} ${TOKEN_SYMBOL}`;

  // The second line of a row: what a visitor needs to know about a tournament in that state.
  const facts = (x: ListedTournament) => {
    const players = `${x.t.players.length} ${x.t.players.length === 1 ? "player" : "players"}`;
    if (x.state === "open")
      return (
        <>
          {players} · <span className="amount">{money(x.t.stake)}</span> a game · {describeClock(x.t.clockBase, x.t.clockIncrement).toLowerCase()} ·{" "}
          {x.entryFee > 0n ? (
            <>
              <span className="amount">{money(x.entryFee)}</span> to enter, pot <span className="amount">{money(x.pot)}</span> so far
            </>
          ) : (
            "free to enter"
          )}{" "}
          · hosted by {label(x.t.host)}
        </>
      );
    if (x.state === "running")
      return (
        <>
          {x.done} of {x.total} games played · {players}
          {x.entryFee > 0n && (
            <>
              {" "}
              · pot <span className="amount">{money(x.pot)}</span> · {x.payable ? "ready to pay out" : `pays out by ${day(x.deadline)}`}
            </>
          )}
        </>
      );
    if (x.cancelled) return <>Cancelled before it started{x.entryFee > 0n ? ", entry fees refunded" : ""}</>;
    const who = x.winners.map(label);
    const names = who.length > 1 ? `${who.slice(0, -1).join(", ")} and ${who[who.length - 1]}` : who[0];
    return (
      <>
        {who.length === 0 ? "No games were played" : who.length > 1 ? `${names} shared first place` : `${names} won`}
        {x.firstPrize > 0n && (
          <>
            {" "}
            <span className="amount">+{money(x.firstPrize)}</span>
            {who.length > 1 ? " each" : ""}
          </>
        )}{" "}
        · {players} · {x.done} of {x.total} games played
      </>
    );
  };

  return (
    <div>
      <div className="mb-3 grid grid-flow-col auto-cols-fr gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
        {TABS.map((t) => (
          <button key={t.id} className="ghost justify-center !px-2 text-sm sm:!px-4 sm:text-base" aria-pressed={tab === t.id} onClick={() => setPicked(t.id)}>
            {t.name} <span className={tab === t.id ? "" : "soft"}>{list.filter((x) => x.state === t.id).length}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="soft py-3">{TABS.find((t) => t.id === tab)!.empty}</p>
      ) : (
        <ul className="facts">
          {shown.map((x) => (
            <li key={x.t.id.toString()}>
              <button className="flex w-full items-baseline justify-between gap-3 py-3 text-left" onClick={() => onOpen(x.t.id)}>
                <span className="min-w-0">
                  <span className="block truncate font-bold">{x.t.name}</span>
                  <span className="soft block text-sm">{facts(x)}</span>
                </span>
                <span className="link shrink-0 text-sm">{x.state === "open" ? "Join" : x.state === "running" ? "Standings" : "Results"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Detail({ t, onOpenGame }: { t: Tournament; onOpenGame: (id: bigint) => void }) {
  const { address, busy, sendMoney, gameKeyTopUp } = useDegenAccount();
  const { fixtures, standings } = useFixtures(t);
  const prize = usePrize(t);
  const fee = prize?.entryFee ?? 0n;
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const { label, nameOf } = useNames([...t.players, address]);
  const me = address ?? undefined;
  const iAmIn = t.players.some((p) => sameAddress(p, me));
  const isHost = sameAddress(t.host, me);
  const total = (t.players.length * (t.players.length - 1)) / 2;
  const done = fixtures.filter((f) => f.game?.status === Status.Finished).length;
  const ref = (address && nameOf(address)) || address || undefined;
  const finishedIds = fixtures.flatMap((f) => (f.game?.status === Status.Finished ? [f.game.id] : []));
  const canPayOut = !!prize && fee > 0n && t.started && !prize.settled && (done === total || BigInt(now) >= prize.deadline);
  // Over: the pot is paid, or (with no pot) every game is played. First place is whoever was paid most, or tops the table.
  const over = !!prize && t.started && !prize.cancelled && (fee > 0n ? prize.settled : total > 0 && done === total);
  const topPrize = prize ? [...prize.prizes.values()].reduce((max, x) => (x > max ? x : max), 0n) : 0n;
  const champions = (
    fee > 0n ? t.players.filter((p) => topPrize > 0n && prize?.prizes.get(p.toLowerCase()) === topPrize) : standings.filter((s) => s.points === standings[0]?.points).map((s) => s.address)
  ).map(label);
  const ends = prize && prize.deadline > 0n ? new Date(Number(prize.deadline) * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

  async function play() {
    // A coin flip picks the colours, so nobody can claim White in every game.
    const receipt = await sendMoney(`Stake ${formatToken(t.stake)} ${TOKEN_SYMBOL} & open a tournament game`, async (id) =>
      withApproval(id.address, t.stake, {
        ...chessContract,
        functionName: "createGameAs",
        args: [t.stake, id.gameKey, t.clockBase, t.clockIncrement, 2],
        value: await gameKeyTopUp(id.gameKey),
      })
    );
    const created = receipt && parseEventLogs({ abi: degenChessAbi, logs: receipt.logs, eventName: "GameCreated" })[0];
    if (created) onOpenGame(created.args.gameId);
  }

  const fixtureAction = (f: Fixture) => {
    const mine = sameAddress(f.a, me) || sameAddress(f.b, me);
    if (f.game?.status === Status.Finished) {
      const text = f.game.result === Result.Draw ? "Draw" : `${label(f.game.result === Result.WhiteWins ? f.game.white : f.game.black)} won`;
      return (
        <button className="link text-sm" onClick={() => onOpenGame(f.game!.id)}>
          {text}
        </button>
      );
    }
    if (f.game)
      return (
        <button className="act act--sm act--bone" onClick={() => onOpenGame(f.game!.id)}>
          {mine ? "Resume" : "Watch"}
        </button>
      );
    if (f.open)
      return (
        <button className={`act act--sm ${mine && !sameAddress(f.open.white, me) ? "" : "act--bone"}`} onClick={() => onOpenGame(f.open!.id)}>
          {sameAddress(f.open.white, me) ? "Waiting" : mine ? "Join" : "Open"}
        </button>
      );
    if (mine && t.started)
      return (
        <button className="act act--sm" disabled={busy !== null} onClick={play}>
          Play
        </button>
      );
    return <span className="soft text-sm">To play</span>;
  };

  return (
    <div>
      <h1 className="heading">{t.name}</h1>
      <p className="lead mt-2">
        {t.players.length} {t.players.length === 1 ? "player" : "players"} ·{" "}
        <span className="amount">
          {formatToken(t.stake)} {TOKEN_SYMBOL}
        </span>{" "}
        a game · {describeClock(t.clockBase, t.clockIncrement).toLowerCase()} · hosted by {label(t.host)}
      </p>
      {prize && fee > 0n && (
        <p className="mt-2">
          Prize pot{" "}
          <span className="amount">
            {formatToken(prize.settled ? fee * BigInt(t.players.length) : prize.pot)} {TOKEN_SYMBOL}
          </span>{" "}
          <span className="soft">
            · {formatToken(fee)} {TOKEN_SYMBOL} to enter · {SPLITS[prize.mode]?.toLowerCase()}
            {prize.settled ? " · paid out" : t.started ? ` · pays out when every game is played, or after ${ends}` : ""}
          </span>
        </p>
      )}
      {prize?.cancelled && <p className="mt-2 font-bold">This tournament was cancelled and every entry fee was refunded.</p>}
      {over && champions.length > 0 && (
        <p className="mt-2 font-bold">
          Finished. {champions.length > 1 ? `${champions.slice(0, -1).join(", ")} and ${champions[champions.length - 1]} shared first place.` : `${champions[0]} won.`}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!t.started && !iAmIn && !prize?.cancelled && (
          <button
            className="act"
            disabled={!address || busy !== null || t.players.length >= 16}
            onClick={() =>
              sendMoney(fee > 0n ? `Join "${t.name}" for ${formatToken(fee)} ${TOKEN_SYMBOL}` : `Join "${t.name}"`, async (id) => {
                const call = { ...tournamentsContract, functionName: "join" as const, args: [t.id] as const };
                return fee > 0n ? withApproval(id.address, fee, call, TOURNAMENTS_ADDRESS) : [call];
              })
            }
          >
            {!address ? "Sign in to join" : fee > 0n ? `Join for ${formatToken(fee)} ${TOKEN_SYMBOL}` : "Join the tournament"}
          </button>
        )}
        {canPayOut && (
          <button
            className="act"
            disabled={!address || busy !== null}
            onClick={() => sendMoney("Pay out the prizes", () => [{ ...tournamentsContract, functionName: "settle", args: [t.id, finishedIds] }])}
          >
            Pay out the prizes
          </button>
        )}
        {!t.started && isHost && !prize?.cancelled && (
          <button
            className="act"
            disabled={busy !== null || t.players.length < 2}
            onClick={() => sendMoney(`Start "${t.name}"`, () => [{ ...tournamentsContract, functionName: "start", args: [t.id] }])}
          >
            {t.players.length < 2 ? "Waiting for players" : "Start: close entries"}
          </button>
        )}
        <button
          className="ghost"
          onClick={() => void shareLink(`/tournaments?t=${t.id}`, t.started ? `Follow "${t.name}" on Away Chess.` : `Join "${t.name}" on Away Chess: ${formatToken(t.stake)} ${TOKEN_SYMBOL} a game, everyone plays everyone.`, ref)}
        >
          <Icon name="share" size={18} /> {t.started ? "Share" : "Invite players"}
        </button>
        {!t.started && !prize?.cancelled && iAmIn && !isHost && (
          <button className="ghost" disabled={busy !== null} onClick={() => sendMoney(`Leave "${t.name}"`, () => [{ ...tournamentsContract, functionName: "leave", args: [t.id] }])}>
            {fee > 0n ? "Leave and refund" : "Leave"}
          </button>
        )}
        {!t.started && !prize?.cancelled && isHost && (
          <button className="ghost" disabled={busy !== null} onClick={() => sendMoney(`Cancel "${t.name}"`, () => [{ ...tournamentsContract, functionName: "cancel", args: [t.id] }])}>
            {fee > 0n ? "Cancel and refund all" : "Cancel"}
          </button>
        )}
        <span className="soft text-sm">
          {prize?.cancelled ? "" : t.started ? `${done} of ${total} games played` : iAmIn ? "You're in. Waiting for the host to start." : "Open for entries."}
        </span>
      </div>

      <h2 className="field-label mt-10">{t.started ? "Standings" : "Players"}</h2>
      <table className="ladder">
        <thead>
          <tr>
            <th scope="col" className="w-8">
              #
            </th>
            <th scope="col">Player</th>
            {t.started && (
              <>
                <th scope="col" className="text-right" title="Won, drawn, lost">
                  W D L
                </th>
                <th scope="col" className="text-right">
                  Points
                </th>
                {prize?.settled && (
                  <th scope="col" className="text-right">
                    Prize
                  </th>
                )}
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {(t.started ? standings.map((s) => s.address) : t.players).map((p, i) => {
            const s = standings.find((x) => sameAddress(x.address, p));
            return (
              <tr key={p} aria-current={sameAddress(p, me) ? "true" : undefined}>
                <td className="soft">{i + 1}</td>
                <td className="max-w-0 truncate font-bold">
                  {label(p)}
                  {sameAddress(p, me) && <span className="soft font-normal"> (you)</span>}
                </td>
                {t.started && s && (
                  <>
                    <td className="whitespace-nowrap text-right">
                      {s.wins} {s.draws} {s.losses}
                    </td>
                    <td className="text-right font-bold">{points(s.points)}</td>
                    {prize?.settled && (
                      <td className="amount text-right">{(prize.prizes.get(p.toLowerCase()) ?? 0n) > 0n ? `+${formatToken(prize.prizes.get(p.toLowerCase()))}` : ""}</td>
                    )}
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {t.started && (
        <>
          <h2 className="field-label mt-10">Games</h2>
          <ul className="facts">
            {fixtures.map((f) => (
              <li key={`${f.a}-${f.b}`} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0 truncate">
                  <span className="font-bold">{label(f.a)}</span> <span className="soft">v</span> <span className="font-bold">{label(f.b)}</span>
                </span>
                {fixtureAction(f)}
              </li>
            ))}
          </ul>
          <p className="soft mt-3 text-sm">
            Press Play to open your next game, then your opponent joins it from here. A win is 1 point, a draw ½. The first game
            each pair plays is the one that counts.
          </p>
        </>
      )}
    </div>
  );
}

export default function Tournaments() {
  const router = useRouter();
  const param = Array.isArray(router.query.t) ? router.query.t[0] : router.query.t;
  const id = param !== undefined && /^\d+$/.test(param) ? BigInt(param) : null;
  const { tournament, loading } = useTournament(id);
  const open = (t: bigint | null) => router.push(t === null ? "/tournaments" : { pathname: "/tournaments", query: { t: t.toString() } }, undefined, { shallow: true });
  const openGame = (game: bigint) => router.push({ pathname: "/", query: { game: game.toString() } });

  return (
    <div className="mx-auto max-w-[1240px] px-5 pb-24 sm:px-10">
      <Seo title={tournament ? tournament.name : "Tournaments"} />
      <header className="flex items-center justify-between gap-4 py-4 sm:py-6">
        <Link href="/" aria-label="Away Chess home">
          <Wordmark compact />
        </Link>
        <AccountBar />
      </header>

      {!TOURNAMENTS_ADDRESS ? (
        <p className="mt-10">Tournaments are not set up on this network yet.</p>
      ) : id === null ? (
        <main className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div>
            <h1 className="heading">Tournaments</h1>
            <p className="lead mb-6 mt-2">Leagues of staked games: everyone plays everyone once, and the table keeps itself.</p>
            <List onOpen={open} />
          </div>
          <Create onCreated={open} />
        </main>
      ) : (
        <main className="mt-8 max-w-3xl">
          <button className="link mb-6 inline-flex items-center gap-1 text-sm" onClick={() => open(null)}>
            <Icon name="back" size={16} /> All tournaments
          </button>
          {tournament ? <Detail t={tournament} onOpenGame={openGame} /> : <p className="soft">{loading ? "Loading the tournament..." : "That tournament does not exist."}</p>}
        </main>
      )}
      <ToastContainer position="bottom-right" theme="dark" />
    </div>
  );
}
