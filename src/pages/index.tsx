import type { NextPage } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { CONTRACT_ADDRESS } from "../config";
import { useDegenAccount } from "../lib/account";
import { AccountBar } from "../components/AccountBar";
import { Lobby } from "../components/Lobby";
import { GameView } from "../components/GameView";

const Home: NextPage = () => {
  const router = useRouter();
  const { onboarding } = useDegenAccount();

  // The game being viewed lives in the URL (?game=3) so it can be shared with an opponent.
  const gameParam = typeof router.query.game === "string" ? router.query.game : null;
  const gameId = gameParam !== null && /^\d+$/.test(gameParam) ? BigInt(gameParam) : null;
  const openGame = (id: bigint | null) =>
    router.push(id === null ? "/" : { pathname: "/", query: { game: id.toString() } }, undefined, { shallow: true });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Head>
        <title>DegenChess</title>
        <meta name="description" content="Staked on-chain chess where every capture pays." />
      </Head>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <button onClick={() => openGame(null)} className="text-left bg-transparent p-0 hover:shadow-none">
          <h1 className="font-retro text-xl text-retroGreen">DegenChess</h1>
        </button>
        <AccountBar />
      </header>

      {!CONTRACT_ADDRESS ? (
        <div className="retro-panel">
          No contract configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local (see README).
        </div>
      ) : (
        <>
          {onboarding && gameId === null && (
            <div className="retro-panel mb-4 text-retroGreenLight">
              You&apos;re in. 1 passkey tap &middot; {onboarding.seconds.toFixed(1)}s to your first transaction on
              Monad. No seed phrase, no extension.
            </div>
          )}
          {gameId !== null ? (
            <>
              <button onClick={() => openGame(null)} className="retro-button-sm mb-4">
                &larr; Lobby
              </button>
              <GameView key={gameId.toString()} gameId={gameId} />
            </>
          ) : (
            <Lobby onOpenGame={openGame} />
          )}
        </>
      )}
      <ToastContainer position="bottom-right" theme="dark" />
    </div>
  );
};

export default Home;
