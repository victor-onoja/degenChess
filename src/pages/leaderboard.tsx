import Link from "next/link";
import { AccountBar } from "../components/AccountBar";
import { Leaderboard } from "../components/Leaderboard";
import { Seo } from "../components/Seo";
import { Wordmark } from "../components/Wordmark";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function LeaderboardPage() {
  return (
    <div className="mx-auto max-w-[1240px] px-5 pb-24 sm:px-10">
      <Seo title="Leaderboard" />
      <header className="flex items-center justify-between gap-4 py-4 sm:py-6">
        <Link href="/" aria-label="Away Chess home">
          <Wordmark compact />
        </Link>
        <AccountBar />
      </header>
      <main className="mt-8 max-w-3xl">
        <h1 className="heading">Leaderboard</h1>
        <p className="lead mb-6 mt-2">Who has taken the most off the board.</p>
        <Leaderboard />
      </main>
      <ToastContainer position="bottom-right" theme="dark" />
    </div>
  );
}
