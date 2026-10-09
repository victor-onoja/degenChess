import Link from "next/link";
import { TOKEN_SYMBOL, TOURNAMENTS_ADDRESS } from "../config";
import { formatToken } from "../lib/format";
import { useNames } from "../lib/names";
import { useTournamentList } from "../lib/tournaments";

/** The newest tournaments on the landing page: three lines and a way in. */
export function TournamentTeaser() {
  const { list, loading } = useTournamentList(3);
  const { label } = useNames(list.flatMap((x) => x.winners));
  if (!TOURNAMENTS_ADDRESS) return <p className="soft">Coming to this network soon.</p>;
  if (loading) return <p className="soft">Looking for tournaments...</p>;
  if (list.length === 0)
    return (
      <p className="soft">
        A league where everyone plays everyone once, each game staked as usual.{" "}
        <Link className="link" href="/tournaments">
          Start the first one
        </Link>
        .
      </p>
    );
  return (
    <ul className="facts">
      {list.map(({ t, state, cancelled, winners, done, total }) => (
        <li key={t.id.toString()}>
          <Link className="flex items-baseline justify-between gap-3 py-3" href={`/tournaments?t=${t.id}`}>
            <span className="min-w-0">
              <span className="block truncate font-bold">{t.name}</span>
              <span className="soft text-sm">
                {t.players.length} {t.players.length === 1 ? "player" : "players"} ·{" "}
                <span className="amount">
                  {formatToken(t.stake)} {TOKEN_SYMBOL}
                </span>{" "}
                a game
                {state === "running" && ` · ${done} of ${total} games played`}
                {state === "finished" && (cancelled ? " · cancelled" : winners.length === 1 ? ` · ${label(winners[0])} won` : winners.length > 1 ? " · first place shared" : "")}
              </span>
            </span>
            <span className="link shrink-0 text-sm">{state === "open" ? "Join" : state === "running" ? "Standings" : "Results"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
