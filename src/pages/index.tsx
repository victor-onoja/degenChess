import type { NextPage } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import type { PieceSymbol } from "chess.js";
import { CONTRACT_ADDRESS, TOKEN_SYMBOL } from "../config";
import { useDegenAccount } from "../lib/account";
import { cleanName, NAME_RULE } from "../lib/names";
import { PIECE_WEIGHT } from "../lib/pieceShapes";
import { AccountBar } from "../components/AccountBar";
import { GameView } from "../components/GameView";
import { PieceIcon } from "../components/PieceIcon";
import { Seo } from "../components/Seo";
import { Wordmark } from "../components/Wordmark";
import { Yard } from "../components/Yard";

const AttractArena = dynamic(() => import("../components/arena/AttractArena"), { ssr: false });

const PIECES: { kind: PieceSymbol; name: string }[] = [
  { kind: "p", name: "Pawn" },
  { kind: "n", name: "Knight" },
  { kind: "b", name: "Bishop" },
  { kind: "r", name: "Rook" },
  { kind: "q", name: "Queen" },
  { kind: "k", name: "King" },
];
const EXAMPLE_STAKES = [1, 10, 50, 100];

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
  const { address, returning, busy, onboarding, signUp, unlock } = useDegenAccount();
  const hasAccount = address !== null || returning;
  const [name, setName] = useState("");
  const [exampleStake, setExampleStake] = useState(10);

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

        <header className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 sm:px-10 sm:py-6">
          <Wordmark />
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
                    placeholder="pick a name"
                    aria-label="Username"
                    maxLength={16}
                    autoComplete="off"
                  />
                  <button type="submit" className="act" disabled={busy !== null || (name !== "" && !NAME_RULE.test(name))}>
                    {busy ?? "Play now"}
                  </button>
                </form>
                <p className="soft mt-3 text-sm">
                  One tap with Face ID or a fingerprint. The name is optional.{" "}
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
          <h2 className="heading">The yard</h2>
          <p className="lead mt-3">Every board out here is a real game. Sit down at one, watch one, or start your own.</p>
          {onboarding && (
            <p className="mt-6 max-w-xl font-bold">
              You&apos;re in. 1 passkey tap, {onboarding.seconds.toFixed(1)}s to your first transaction on Monad. No seed phrase,
              no extension.
            </p>
          )}
          <div className="mt-9">
            {CONTRACT_ADDRESS ? (
              <Yard onOpenGame={openGame} />
            ) : (
              <p>No contract configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local (see README).</p>
            )}
          </div>
        </section>

        <section className="pt-24">
          <h2 className="heading">What each one is worth</h2>
          <p className="lead mt-3">
            Your stake is shared out among your pieces before the first move. When one is taken, its share goes with it.
          </p>
          <p id="example-stake" className="soft mb-1 mt-7 text-sm">
            At a stake of ({TOKEN_SYMBOL})
          </p>
          <div className="rank max-w-sm" role="group" aria-labelledby="example-stake">
            {EXAMPLE_STAKES.map((s) => (
              <button key={s} className="rank__square" aria-pressed={exampleStake === s} onClick={() => setExampleStake(s)}>
                {s}
              </button>
            ))}
          </div>
          <div className="worth mt-5">
            {PIECES.map((p) => (
              <div key={p.kind} className="worth__sq">
                <PieceIcon kind={p.kind} color="w" core={p.kind !== "k"} />
                <span className="mt-2 font-bold">{p.name}</span>
                {p.kind === "k" ? (
                  <span className="soft text-sm">can&apos;t be taken</span>
                ) : (
                  <span className="amount text-lg">{((exampleStake * PIECE_WEIGHT[p.kind]) / 39).toFixed(2)}</span>
                )}
              </div>
            ))}
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
              Running on Monad testnet with test dollars. Nothing here is real money yet. The first game in Degen Yard.
            </p>
          </div>
          <nav className="flex gap-6 text-sm" aria-label="Project links">
            <a className="link" href="https://github.com/victor-onoja/degenChess" target="_blank" rel="noreferrer">
              Source
            </a>
            <a className="link" href={`https://testnet.monadexplorer.com/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
              Contract
            </a>
            <Link className="link" href="/arena">
              Board sandbox
            </Link>
          </nav>
        </footer>
      </main>
      <ToastContainer position="bottom-right" theme="dark" />
    </div>
  );
};

export default Home;
