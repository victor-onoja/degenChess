import type { NextPage } from "next";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useState } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { CONTRACT_ADDRESS } from "../config";
import { useDegenAccount } from "../lib/account";
import { AccountBar } from "../components/AccountBar";
import { Lobby } from "../components/Lobby";
import { GameView } from "../components/GameView";
import { Seo } from "../components/Seo";
import { cleanName, NAME_RULE } from "../lib/names";

const AttractArena = dynamic(() => import("../components/arena/AttractArena"), { ssr: false });

const STEPS = [
  { icon: "👆", title: "One tap to start", text: "Create a passkey with Face ID or your fingerprint. No wallet, no seed phrase, no extension." },
  { icon: "⚔️", title: "Every capture pays", text: "Take a piece and its share of your opponent's stake moves to you on the spot." },
  { icon: "💸", title: "Lose and still earn", text: "The winner takes the pot, but whatever you captured along the way is yours to keep." },
];

const Home: NextPage = () => {
  const router = useRouter();
  const { address, returning, busy, onboarding, signUp, unlock } = useDegenAccount();
  const hasAccount = address !== null || returning;
  const [name, setName] = useState("");

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

  return (
    <div>
      <Seo />

      <section className={`relative overflow-hidden ${hasAccount ? "h-[44dvh] min-h-[320px]" : "h-[78dvh] min-h-[520px]"}`}>
        <AttractArena />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 14%, rgba(0,0,0,0) 42%, rgba(6,9,8,0.88) 62%, #060908 92%)",
          }}
        />

        <header className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-3 p-4">
          <span className="logo text-sm sm:text-base">DegenChess</span>
          {hasAccount && <AccountBar />}
        </header>

        <div className="absolute inset-x-0 bottom-0 z-10 mx-auto max-w-3xl px-4 pb-8 text-center">
          <h1 className="text-3xl font-bold leading-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-5xl">
            Chess where every capture <span className="text-[#ffd23f]">pays</span>.
          </h1>
          {!hasAccount && (
            <>
              <p className="mx-auto mt-3 max-w-xl text-base text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)] sm:text-lg">
                Bulls vs Bears, for real stakes. Take a piece, take its value, settled on Monad in under a second.
              </p>
              <div className="mt-5 flex flex-col items-center gap-3">
                <input
                  value={name}
                  onChange={(e) => setName(cleanName(e.target.value))}
                  placeholder="Pick a username (optional)"
                  aria-label="Username"
                  maxLength={16}
                  className="w-64 text-center"
                />
                <button
                  className="btn !px-10 !py-4 text-lg"
                  disabled={busy !== null || (name !== "" && !NAME_RULE.test(name))}
                  onClick={() => void signUp(NAME_RULE.test(name) ? name : undefined)}
                >
                  {busy ?? "Play now"}
                </button>
                <button className="text-sm text-white/80 underline" disabled={busy !== null} onClick={() => void unlock()}>
                  I have a passkey
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        {!CONTRACT_ADDRESS ? (
          <div className="retro-panel">No contract configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local (see README).</div>
        ) : (
          <>
            {onboarding && (
              <div className="retro-panel mb-4 text-center text-[#3dff8b]">
                You&apos;re in. 1 passkey tap &middot; {onboarding.seconds.toFixed(1)}s to your first transaction on Monad. No
                seed phrase, no extension.
              </div>
            )}
            <Lobby onOpenGame={openGame} />
          </>
        )}

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.title} className="retro-panel">
              <div className="text-3xl">{s.icon}</div>
              <h3 className="mt-2 text-lg font-bold text-white">{s.title}</h3>
              <p className="mt-1 text-sm opacity-80">{s.text}</p>
            </div>
          ))}
        </section>
        <p className="mt-8 text-center text-xs opacity-60">
          Running on Monad testnet with test dollars. The first game in Degen Yard.
        </p>
      </main>
      <ToastContainer position="bottom-right" theme="dark" />
    </div>
  );
};

export default Home;
