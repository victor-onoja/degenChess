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
import { tournamentsContract, useFixtures, useTournament, useTournaments, type Fixture, type Tournament } from "../lib/tournaments";

// Tournaments: a league where everyone plays everyone once, each game an ordinary staked game.
// Create one, share the link, start it when the players are in, and the table fills itself in.

const STAKES = ["1", "5", "10"];
const points = (p: number) => (p % 2 === 0 ? String(p / 2) : `${Math.floor(p / 2)}½`);

function Create({ onCreated }: { onCreated: (id: bigint) => void }) {
  const { address, returning, busy, sendMoney } = useDegenAccount();
  const [name, setName] = useState("");
  const [stake, setStake] = useState("1");
  const [control, setControl] = useState<(typeof TIME_CONTROLS)[number]>(TIME_CONTROLS[1]);
  const ready = (address !== null || returning) && name.trim().length >= 3;

  async function create() {
    const receipt = await sendMoney(`Create "${name.trim()}"`, () => [
      { ...tournamentsContract, functionName: "create", args: [name.trim(), parseUnits(stake, TOKEN_DECIMALS), control.base, control.increment] },
    ]);
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
      <button className="act w-full" disabled={!ready || busy !== null} onClick={create}>
        {busy ?? "Create tournament"}
      </button>
      <p className="soft mt-2 text-sm">
        Everyone plays everyone once. Creating it is free; each game is staked as usual, and you get a link to invite players.
      </p>
    </div>
  );
}

function List({ onOpen }: { onOpen: (id: bigint) => void }) {
  const { tournaments, loading } = useTournaments();
  if (loading) return <p className="soft">Looking for tournaments...</p>;
  if (tournaments.length === 0) return <p className="soft">No tournaments yet. Start the first one.</p>;
  return (
    <ul className="facts">
      {tournaments.map((t) => (
        <li key={t.id.toString()}>
          <button className="flex w-full items-baseline justify-between gap-3 py-3 text-left" onClick={() => onOpen(t.id)}>
            <span className="min-w-0">
              <span className="block truncate font-bold">{t.name}</span>
              <span className="soft text-sm">
                {t.players.length} {t.players.length === 1 ? "player" : "players"} ·{" "}
                <span className="amount">
                  {formatToken(t.stake)} {TOKEN_SYMBOL}
                </span>{" "}
                a game · {describeClock(t.clockBase, t.clockIncrement).toLowerCase()}
              </span>
            </span>
            <span className="link shrink-0 text-sm">{t.started ? "Standings" : "Join"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Detail({ t, onOpenGame }: { t: Tournament; onOpenGame: (id: bigint) => void }) {
  const { address, busy, sendMoney, gameKeyTopUp } = useDegenAccount();
  const { fixtures, standings } = useFixtures(t);
  const { label, nameOf } = useNames([...t.players, address]);
  const me = address ?? undefined;
  const iAmIn = t.players.some((p) => sameAddress(p, me));
  const isHost = sameAddress(t.host, me);
  const total = (t.players.length * (t.players.length - 1)) / 2;
  const done = fixtures.filter((f) => f.game?.status === Status.Finished).length;
  const ref = (address && nameOf(address)) || address || undefined;

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

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!t.started && !iAmIn && (
          <button
            className="act"
            disabled={!address || busy !== null || t.players.length >= 16}
            onClick={() => sendMoney(`Join "${t.name}"`, () => [{ ...tournamentsContract, functionName: "join", args: [t.id] }])}
          >
            {address ? "Join the tournament" : "Sign in to join"}
          </button>
        )}
        {!t.started && isHost && (
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
        <span className="soft text-sm">
          {t.started ? `${done} of ${total} games played` : iAmIn ? "You're in. Waiting for the host to start." : "Open for entries."}
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
