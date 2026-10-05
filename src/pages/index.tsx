import type { NextPage } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { CONTRACT_ADDRESS } from "../config";
import { useDegenAccount } from "../lib/account";
import { cleanName, NAME_HINT, NAME_RULE, useNames, useNameStatus } from "../lib/names";
import { NameEditor } from "../components/NameEditor";
import { AccountBar } from "../components/AccountBar";
import { GameView } from "../components/GameView";
import { Seo } from "../components/Seo";
import { Wordmark } from "../components/Wordmark";
import { Yard } from "../components/Yard";
import { Leaderboard } from "../components/Leaderboard";
import { TournamentTeaser } from "../components/TournamentTeaser";

const AttractArena = dynamic(() => import("../components/arena/AttractArena"), { ssr: false });

const FACTS = [
  {
    term: "One tap, no wallet",
    text: "Your passkey is your account. Face ID or a fingerprint creates it. There is nothing to install and no phrase to write down.",
  },
  {
    term: "Moves never ask",
    text: "Your passkey makes two keys. One holds your money and asks every time. The other can only move pieces, so playing needs no confirmation at all.",
  },
  {
    term: "Settled as you play",
    text: "Each move is a transaction on Monad, confirmed in under a second. A capture pays the moment it lands, and if you lose you still keep what you took.",
  },
  {
    term: "A referee nobody can lean on",
    text: "A Chainlink workflow replays every game. It pays out checkmates and draws on its own, and anyone who plays an illegal move forfeits everything.",
  },
];

const Home: NextPage = () => {
  const router = useRouter();
  const { address, unlocked, returning, busy, onboarding, signUp, unlock, signOut } = useDegenAccount();
  const { nameOf } = useNames([address]);
  const lockedName = nameOf(address);
  const hasAccount = address !== null || returning;
  const [name, setName] = useState("");
  const nameStatus = useNameStatus(name, null);
  const nameBlocked = name !== "" && nameStatus !== "available";

  // The game being viewed lives in the URL (?game=3) so it can be shared with an opponent.
  const gameParam = typeof router.query.game === "string" ? router.query.game : null;
  const gameId = gameParam !== null && /^\d+$/.test(gameParam) ? BigInt(gameParam) : null;
  const openGame = (id: bigint | null) =>
    router.push(id === null ? "/" : { pathname: "/", query: { game: id.toString() } }, undefined, { shallow: true });

  if (gameId !== null && CONTRACT_ADDRESS) {
    return (
      <>
        <Seo title={`Board ${gameId}`} />
        <GameView key={gameId.toString()} gameId={gameId} onExit={() => openGame(null)} onOpenGame={openGame} />
        <ToastContainer position="top-center" theme="dark" />
      </>
    );
  }

  return (
    <div>
      <Seo />

      {/* The first viewport is the board itself: alive, watching, and paying on every capture. */}
      <section className={`stage ${hasAccount ? "stage--short h-[54dvh] min-h-[400px]" : "h-[100dvh] min-h-[620px]"}`}>
        <AttractArena />
        <div className="stage__ground" />

        <header className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-5 py-4 sm:px-10 sm:py-6">
          <Wordmark compact={hasAccount} />
          {hasAccount ? (
            <AccountBar />
          ) : (
            <a href="#yard" className="link text-sm">
              See who is playing
            </a>
          )}
        </header>

        <div className="absolute inset-x-0 bottom-0 z-10 mx-auto max-w-[1240px] px-5 pb-8 sm:px-10 sm:pb-12">
          <div className="max-w-[46rem]">
            <h1 className="statement" style={hasAccount ? { fontSize: "clamp(2rem, 6vw, 3.6rem)" } : undefined}>
              Every piece has skin in the game.
            </h1>
            {hasAccount && !unlocked && (
              <p className="soft mt-3 text-sm">
                Locked in this tab{lockedName ? ` as ${lockedName}` : ""}.{" "}
                <button className="link" disabled={busy !== null} onClick={signOut}>
                  Switch account
                </button>
              </p>
            )}
            {!hasAccount && (
              <>
                <p className="lead mt-4">
                  Chess where each piece carries a share of your stake. Take one, and its share is yours.
                </p>
                <form
                  className="entry mt-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void signUp(NAME_RULE.test(name) ? name : undefined);
                  }}
                >
                  <input
                    value={name}
                    onChange={(e) => setName(cleanName(e.target.value))}
                    placeholder="pick a username"
                    aria-label="Username"
                    maxLength={16}
                    autoComplete="off"
                  />
                  <button type="submit" className="act" disabled={busy !== null || nameBlocked}>
                    {busy ?? "Play now"}
                  </button>
                </form>
                {name !== "" && (
                  <p
                    className="mt-2 text-sm"
                    style={{ color: nameStatus === "taken" ? "var(--alert)" : nameStatus === "available" ? "var(--gold)" : "var(--bone-soft)" }}
                  >
                    {NAME_HINT[nameStatus]}.
                  </p>
                )}
                <p className="soft mt-3 text-sm">
                  One tap with Face ID or a fingerprint. Opponents see your username, never your address.{" "}
                  <button className="link" disabled={busy !== null} onClick={() => void unlock()}>
                    I have a passkey
                  </button>
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1240px] px-5 pb-24 sm:px-10">
        <section id="yard" className="scroll-mt-6 pt-16">
          {onboarding && (
            <p className="mt-6 max-w-xl font-bold">
              You&apos;re in. 1 passkey tap, {onboarding.seconds.toFixed(1)}s to your first transaction on Monad. No seed phrase,
              no extension.
            </p>
          )}
          {/* Signed in without a username: picking one is the next step, before anyone sees an address. */}
          {address && unlocked && !lockedName && (
            <div className="mt-6 max-w-md">
              <p className="mb-2 font-bold">Choose a username. Opponents and spectators see it instead of your address.</p>
              <NameEditor />
            </div>
          )}
          <div className={onboarding || (address && unlocked && !lockedName) ? "mt-9" : ""}>
            {CONTRACT_ADDRESS ? (
              <Yard onOpenGame={openGame} />
            ) : (
              <p>No contract configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local (see README).</p>
            )}
          </div>
        </section>

        {/* Who is winning, and where to play a whole league: each a short list and a way in. */}
        <section className="grid gap-x-16 gap-y-14 pt-24 lg:grid-cols-2">
          <div>
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <h2 className="heading">Leaderboard</h2>
              <Link className="link text-sm" href="/leaderboard">
                Full table
              </Link>
            </div>
            <Leaderboard limit={5} />
          </div>
          <div>
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <h2 className="heading">Tournaments</h2>
              <Link className="link text-sm" href="/tournaments">
                Start or join one
              </Link>
            </div>
            <TournamentTeaser />
          </div>
        </section>

        <section className="pt-24">
          <h2 className="heading">How it runs</h2>
          <dl className="facts mt-8">
            {FACTS.map((f) => (
              <div key={f.term}>
                <dt>{f.term}</dt>
                <dd>{f.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className="mt-24 flex flex-wrap items-end justify-between gap-6">
          <div>
            <Wordmark />
            <p className="soft mt-2 max-w-sm text-sm">
              Running on Monad testnet with test dollars. Nothing here is real money yet.
            </p>
          </div>
          <nav className="flex gap-6 text-sm" aria-label="Project links">
            <a className="link" href="https://github.com/victor-onoja/degenChess" target="_blank" rel="noreferrer">
              Source
            </a>
            <a className="link" href={`https://testnet.monadexplorer.com/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
              Contract
            </a>
            <Link className="link" href="/credits">
              Credits
            </Link>
          </nav>
        </footer>
      </main>
      <ToastContainer position="bottom-right" theme="dark" />
    </div>
  );
};

export default Home;
