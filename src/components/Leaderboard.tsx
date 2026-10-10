import { TOKEN_SYMBOL } from "../config";
import { useDegenAccount } from "../lib/account";
import { formatToken, sameAddress } from "../lib/format";
import { useLeaderboard } from "../lib/leaderboard";
import { useNames } from "../lib/names";

/** Who has taken the most money off the board. `limit` shows only the top of the table. */
export function Leaderboard({ limit }: { limit?: number }) {
  const { address } = useDegenAccount();
  const { standings, players, loading } = useLeaderboard();
  const rows = limit ? standings.slice(0, limit) : standings;
  const { label } = useNames(rows.map((s) => s.address));

  if (loading) return <p className="soft">Reading the games...</p>;
  if (rows.length === 0) return <p className="soft">No finished games yet. Win one and this table starts with you.</p>;
  return (
    <div>
      <table className="ladder">
        <thead>
          <tr>
            <th scope="col" className="w-8">
              #
            </th>
            <th scope="col">Player</th>
            <th scope="col" className="text-right" title="Won, drawn, lost">
              W D L
            </th>
            <th scope="col" className="text-right">
              Won ({TOKEN_SYMBOL})
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={s.address} aria-current={sameAddress(s.address, address ?? undefined) ? "true" : undefined}>
              <td className="soft">{i + 1}</td>
              <td className="max-w-0 truncate font-bold">
                {label(s.address)}
                {sameAddress(s.address, address ?? undefined) && <span className="soft font-normal"> (you)</span>}
              </td>
              <td className="whitespace-nowrap text-right">
                {s.wins} {s.draws} {s.losses}
              </td>
              <td className="text-right font-bold" style={{ color: s.net > 0n ? "var(--gold)" : s.net < 0n ? "var(--bone-soft)" : undefined }}>
                {/* No sign on an amount too small to show, so it never reads "-0". */}
                {formatToken(s.net < 0n ? -s.net : s.net) === "0" ? "" : s.net > 0n ? "+" : "-"}
                {formatToken(s.net < 0n ? -s.net : s.net)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!limit && (
        <p className="soft mt-3 text-sm">
          {players} {players === 1 ? "player" : "players"}, every finished game counted. Winnings are payouts minus stakes, after fees.
        </p>
      )}
    </div>
  );
}
