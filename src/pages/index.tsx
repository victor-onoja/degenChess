import type { NextPage } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { CHAIN, CONTRACT_ADDRESS, TOKEN_SYMBOL } from "../config";
import { useDegenAccount } from "../lib/account";
import { cleanName, NAME_RULE } from "../lib/names";
import { AccountBar } from "../components/AccountBar";
import { Lobby } from "../components/Lobby";
import { GameView } from "../components/GameView";
import { Seo } from "../components/Seo";

const AttractArena = dynamic(() => import("../components/arena/AttractArena"), { ssr: false });

const PIECES = [
  { glyph: "♟", name: "Pawn", weight: 1 },
  { glyph: "♞", name: "Knight", weight: 3 },
  { glyph: "♝", name: "Bishop", weight: 3 },
  { glyph: "♜", name: "Rook", weight: 5 },
  { glyph: "♛", name: "Queen", weight: 9 },
];
const EXAMPLE_STAKES = [1, 10, 50, 100];

const STEPS = [
  { title: "Tap to start", text: "Create your account with Face ID or a fingerprint. No wallet to install, no seed phrase to lose." },
  { title: "Stake and play", text: "Pick a stake and a clock. Your opponent matches it and the game starts. Moves need no confirmation." },
  { title: "Capture to earn", text: "Take a piece and its share of the stake is yours on the spot. Lose the game and you still keep what you captured." },
];

const STACK = [
  { name: "Mera passkeys", text: "One passkey makes two keys: one for your money that asks every time, one for moves that never does." },
  { name: "Monad", text: "Every move is a transaction, confirmed in under a second. Fast enough for blitz." },
  { name: "Chainlink referee", text: "A Chainlink workflow replays every game, pays out checkmates and forfeits anyone who cheats." },
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
        <Seo title={`Game #${gameId}`} />
        <GameView key={gameId.toString()} gameId={gameId} onExit={() => openGame(null)} onOpenGame={openGame} />
        <ToastContainer position="top-center" theme="dark" />
      </>
    );
  }

  const stats = [
    { value: "1 tap", label: "to start" },
    { value: "<1s", label: "per move" },
    { value: "0", label: "pop-ups" },
  ];

  return (
    <div>
      <Seo />

      {/* Hero: the arena plays a live game behind the pitch. */}
      <section className={`relative overflow-hidden ${hasAccount ? "h-[46dvh] min-h-[340px]" : "h-[100dvh] min-h-[640px]"}`}>
        <AttractArena />
        <div className="hero-scrim pointer-events-none absolute inset-0" />

        <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 p-4 sm:px-8">
          <span className="logo text-sm sm:text-base">DegenChess</span>
          {hasAccount ? (
            <AccountBar />
          ) : (
            <a href="#how" className="chip hidden sm:inline-flex">
              How it works
            </a>
          )}
        </header>

        <div className="absolute inset-x-0 bottom-0 z-10 mx-auto flex max-w-4xl flex-col items-center px-4 pb-6 text-center sm:pb-10">
          {!hasAccount && (
            <span className="chip mb-4">
              <span className="live-dot" /> Live on {CHAIN.name}
            </span>
          )}
          <h1 className="hero-title">
            Every capture <span className="gradient-text">pays.</span>
          </h1>
          {!hasAccount && (
            <>
              <p className="mt-3 max-w-xl text-base text-white/80 sm:text-xl">
                Staked chess where taking a piece takes its value. Bulls against Bears, settled on-chain before your
                opponent can blink.
              </p>

              <div className="cta mt-6">
                <input
                  value={name}
                  onChange={(e) => setName(cleanName(e.target.value))}
                  placeholder="username (optional)"
                  aria-label="Username"
                  maxLength={16}
                />
                <button
                  className="btn"
                  disabled={busy !== null || (name !== "" && !NAME_RULE.test(name))}
                  onClick={() => void signUp(NAME_RULE.test(name) ? name : undefined)}
                >
                  {busy ?? "Play now"}
                </button>
              </div>
              <button className="mt-3 text-sm text-white/70 underline" disabled={busy !== null} onClick={() => void unlock()}>
                I have a passkey
              </button>

              <dl className="mt-7 grid w-full max-w-xl grid-cols-3 gap-2">
                {stats.map((s) => (
                  <div key={s.label} className="glass px-2 py-3">
                    <dt className="text-xl font-bold text-white sm:text-2xl">{s.value}</dt>
                    <dd className="text-[11px] uppercase tracking-wider text-white/60 sm:text-xs">{s.label}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 pb-20">
        {!CONTRACT_ADDRESS ? (
          <div className="retro-panel">No contract configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local (see README).</div>
        ) : (
          <section id="play" className="pt-6">
            {onboarding && (
              <div className="retro-panel mb-4 text-center text-[#3dff8b]">
                You&apos;re in. 1 passkey tap &middot; {onboarding.seconds.toFixed(1)}s to your first transaction on Monad. No
                seed phrase, no extension.
              </div>
            )}
            <Lobby onOpenGame={openGame} />
          </section>
        )}

        <section className="pt-16">
          <p className="eyebrow">The twist</p>
          <h2 className="section-title">Every piece has a price</h2>
          <p className="section-lead">
            Your stake is split across your pieces. When one is captured, its share moves to your opponent, right then.
          </p>
          <p className="mt-5 text-sm text-white/60">At a stake of ({TOKEN_SYMBOL})</p>
          <div className="mt-2 grid max-w-md grid-cols-4 gap-2">
            {EXAMPLE_STAKES.map((s) => (
              <button
                key={s}
                className={`btn-ghost !min-w-0 ${exampleStake === s ? "!border-[#00ff66] text-[#3dff8b]" : ""}`}
                onClick={() => setExampleStake(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {PIECES.map((p) => (
              <div key={p.name} className="price-card">
                <span className="text-5xl leading-none text-[#ffd23f]">{p.glyph}</span>
                <span className="mt-2 font-bold text-white">{p.name}</span>
                <span className="text-2xl font-bold text-[#3dff8b]">{((exampleStake * p.weight) / 39).toFixed(2)}</span>
                <span className="text-xs text-white/50">{p.weight}/39 of the stake</span>
              </div>
            ))}
            <div className="price-card sm:hidden">
              <span className="text-5xl leading-none text-white/40">♚</span>
              <span className="mt-2 font-bold text-white">King</span>
              <span className="text-2xl font-bold text-white/60">0.00</span>
              <span className="text-xs text-white/50">can&apos;t be captured</span>
            </div>
          </div>
        </section>

        <section id="how" className="pt-16">
          <p className="eyebrow">How it works</p>
          <h2 className="section-title">In a game in seconds</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="info-card">
                <span className="step-number">{i + 1}</span>
                <h3 className="mt-3 text-lg font-bold text-white">{s.title}</h3>
                <p className="mt-1 text-sm text-white/70">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="pt-16">
          <p className="eyebrow">Under the hood</p>
          <h2 className="section-title">Built so you never see the chain</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {STACK.map((s) => (
              <div key={s.name} className="info-card">
                <h3 className="text-lg font-bold text-[#3dff8b]">{s.name}</h3>
                <p className="mt-1 text-sm text-white/70">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-16 flex flex-col items-center gap-3 border-t border-white/10 pt-6 text-center text-xs text-white/50">
          <span className="logo text-[10px]">DegenChess</span>
          <p>Running on Monad testnet with test dollars. The first game in Degen Yard.</p>
          <div className="flex gap-4">
            <a className="underline" href="https://github.com/victor-onoja/degenChess" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a
              className="underline"
              href={`https://testnet.monadexplorer.com/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
            >
              Contract
            </a>
            <Link className="underline" href="/arena">
              3D sandbox
            </Link>
          </div>
        </footer>
      </main>
      <ToastContainer position="bottom-right" theme="dark" />
    </div>
  );
};

export default Home;
