import { useState } from "react";
import { toast } from "react-toastify";
import { useDegenAccount } from "../lib/account";
import { cleanHandle, HANDLE_RULE, linkCode, Outcome, OUTCOME_TEXT } from "../lib/rating";
import { ratingsContract, useMyRating } from "../lib/ratings";

/**
 * Link a chess.com account, so opponents see a rating you could not have typed in yourself. The
 * player proves the account is theirs by putting a short code on its profile; a Chainlink workflow
 * reads chess.com and writes the result on-chain.
 */
export function RatingLink() {
  const { address, busy, sendMoney } = useDegenAccount();
  const [draft, setDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const { rating, pending, failure, refetch } = useMyRating(address, checking);
  if (!address) return null;
  const code = linkCode(address);

  /** Has chess.com checked for the request that is open on-chain, then shows what came back. */
  async function check() {
    setChecking(true);
    try {
      const res = await fetch("/api/rating", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ player: address }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) toast.error(body?.error ?? "Could not check chess.com just now. Please try again.");
      else if (body?.outcome === Outcome.Verified) toast.success("chess.com account linked.");
      await refetch();
    } catch {
      toast.error("Could not check chess.com just now. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }
  async function link(handle: string) {
    const done = await sendMoney(`Link chess.com/${handle}`, () => [{ ...ratingsContract, functionName: "requestLink", args: [handle] }]);
    if (done) await check();
  }
  const show = (n: number) => (n > 0 ? n : "–");

  return (
    <section className="mt-6">
      <h3 className="field-label">Chess.com rating</h3>
      {rating ? (
        <>
          <p>
            <a className="link font-bold" href={`https://www.chess.com/member/${rating.handle}`} target="_blank" rel="noreferrer">
              chess.com/{rating.handle}
            </a>
            <span className="soft"> · verified</span>
          </p>
          <p className="mt-1 text-sm">
            Rapid <span className="font-bold">{show(rating.rapid)}</span> · Blitz <span className="font-bold">{show(rating.blitz)}</span> · Bullet{" "}
            <span className="font-bold">{show(rating.bullet)}</span>
          </p>
          <p className="soft mt-1 text-xs">Opponents see this next to your name. You can take the code off your chess.com profile now.</p>
          <div className="mt-3 flex gap-2">
            <button className="act act--sm act--bone" disabled={busy !== null || checking} onClick={() => void link(rating.handle)}>
              {checking ? "Checking..." : "Refresh"}
            </button>
            <button
              className="ghost text-sm"
              disabled={busy !== null || checking}
              onClick={async () => {
                if (await sendMoney("Unlink chess.com", () => [{ ...ratingsContract, functionName: "unlink" }])) await refetch();
              }}
            >
              Unlink
            </button>
          </div>
          {failure > 0 && <p className="mt-2 text-sm" style={{ color: "var(--alert)" }}>Refresh failed: {OUTCOME_TEXT[failure]} (It needs the code on your profile again.)</p>}
        </>
      ) : (
        <>
          <p className="soft text-sm">Show opponents your real strength. Link your chess.com account and your rating glows next to your name on every board you open, so people know who they are sitting down with.</p>
          <ol className="mt-3 grid gap-2 text-sm">
            <li>
              <span className="font-bold">1.</span> On chess.com, open your profile settings and put this code in <span className="font-bold">Location</span>:
              <span className="mt-1 flex items-stretch">
                <code className="flex min-h-[44px] min-w-0 flex-1 items-center rounded-l-[3px] bg-[var(--field)] px-3">{code}</code>
                <button
                  className="act act--sm act--bone shrink-0"
                  style={{ minHeight: 44, borderRadius: "0 3px 3px 0" }}
                  onClick={() => {
                    void navigator.clipboard?.writeText(code).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                >
                  {copied ? "Copied" : "Copy code"}
                </button>
              </span>
            </li>
            <li>
              <span className="font-bold">2.</span> Type your chess.com username and press Link.
              <form
                className="mt-1 flex items-stretch"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (HANDLE_RULE.test(draft)) void link(draft);
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(cleanHandle(e.target.value))}
                  placeholder="chess.com username"
                  aria-label="chess.com username"
                  className="min-h-[44px] min-w-0 flex-1 px-3"
                  autoComplete="off"
                />
                <button type="submit" className="act act--sm shrink-0" style={{ minHeight: 44, borderRadius: 0 }} disabled={!HANDLE_RULE.test(draft) || busy !== null || checking}>
                  {checking ? "Checking..." : "Link"}
                </button>
              </form>
            </li>
          </ol>
          {pending && failure > 0 && (
            <div className="mt-3">
              <p className="text-sm" style={{ color: "var(--alert)" }}>
                chess.com/{pending}: {OUTCOME_TEXT[failure]}
              </p>
              {failure === Outcome.CodeMissing && (
                <button className="act act--sm act--bone mt-2" disabled={checking} onClick={() => void check()}>
                  {checking ? "Checking..." : "I've added it. Check again"}
                </button>
              )}
            </div>
          )}
          {pending && failure === 0 && !checking && (
            <p className="soft mt-3 text-sm">
              A check of chess.com/{pending} is waiting.{" "}
              <button className="link" onClick={() => void check()}>
                Check now
              </button>
            </p>
          )}
          <p className="soft mt-3 text-xs">A Chainlink workflow reads your public chess.com profile and writes your rating on Monad. Linking asks for your passkey.</p>
        </>
      )}
    </section>
  );
}
