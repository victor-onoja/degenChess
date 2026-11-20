import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { AccountBar } from "../components/AccountBar";
import { Seo } from "../components/Seo";
import { Wordmark } from "../components/Wordmark";
import { TOKEN_SYMBOL } from "../config";
import { formatToken } from "../lib/format";
import type { Metrics } from "../lib/metrics";

/** Open numbers: everything here is read from the game contract, so anyone can check it. */
export default function StatsPage() {
  const { data: m, isError } = useQuery<Metrics>({
    queryKey: ["metrics"],
    queryFn: async () => {
      const res = await fetch("/api/metrics");
      if (!res.ok) throw new Error("metrics unavailable");
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });
  const peak = m ? Math.max(1, ...m.byHourUtc) : 1;

  return (
    <div className="mx-auto max-w-[1240px] px-5 pb-24 sm:px-10">
      <Seo title="Open stats" />
      <header className="flex items-center justify-between gap-4 py-4 sm:py-6">
        <Link href="/" aria-label="Away Chess home">
          <Wordmark compact />
        </Link>
        <AccountBar />
      </header>
      <main className="mt-8 max-w-3xl">
        <h1 className="heading">Open stats</h1>
        <p className="lead mb-6 mt-2">Every number here is read from the game contract, so anyone can check it.</p>
        {isError && <p className="soft">The stats could not be read just now. Try again in a minute.</p>}
        {!m && !isError && <p className="soft">Reading the chain...</p>}
        {m && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Players", String(m.players.total), `${m.players.returning} came back`],
                ["Games", String(m.games.finished), `${m.games.active} live now`],
                ["Staked", `${formatToken(BigInt(m.money.staked))}`, TOKEN_SYMBOL],
                ["Came back next week", m.retention === null ? "n/a" : `${Math.round(m.retention * 100)}%`, "of each week's players"],
              ].map(([label, value, note]) => (
                <div key={label} className="slab p-4">
                  <p className="soft text-xs">{label}</p>
                  <p className="amount text-2xl font-bold">{value}</p>
                  <p className="soft text-xs">{note}</p>
                </div>
              ))}
            </div>

            <h2 className="panel-title mt-8">By week</h2>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="soft text-left">
                  <th className="py-1 font-normal">Week</th>
                  <th className="py-1 text-right font-normal">Players</th>
                  <th className="py-1 text-right font-normal">New</th>
                  <th className="py-1 text-right font-normal">Games</th>
                  <th className="py-1 text-right font-normal">From last week</th>
                </tr>
              </thead>
              <tbody>
                {[...m.weekly].reverse().map((w) => (
                  <tr key={w.week} className="border-t border-white/10">
                    <td className="py-1">{w.week}</td>
                    <td className="py-1 text-right">{w.activePlayers}</td>
                    <td className="py-1 text-right">{w.newPlayers}</td>
                    <td className="py-1 text-right">{w.games}</td>
                    <td className="py-1 text-right">{w.retainedFromPrevious ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 className="panel-title mt-8">When people play (UTC)</h2>
            <div className="mt-2 flex h-24 items-end gap-[3px]" role="img" aria-label="Games by hour of the day, UTC">
              {m.byHourUtc.map((n, h) => (
                <div key={h} className="flex-1 rounded-t-sm bg-[var(--gold,#ffc233)]" style={{ height: `${(n / peak) * 100}%`, minHeight: n ? 2 : 0 }} title={`${h}:00 UTC: ${n} games`} />
              ))}
            </div>
            <div className="soft mt-1 flex justify-between text-xs">
              <span>00:00</span>
              <span>12:00</span>
              <span>23:00</span>
            </div>
            <p className="soft mt-6 text-xs">Updated {new Date(m.generatedAt).toLocaleString()}. Fees shown are gross, before invite shares.</p>
          </>
        )}
      </main>
      <ToastContainer position="bottom-right" theme="dark" />
    </div>
  );
}
