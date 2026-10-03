import Head from "next/head";
import Link from "next/link";
import MUSIC from "../lib/music.json";
import { Wordmark } from "../components/Wordmark";

// Everyone whose work is in DegenChess. Several recordings are licensed on condition of credit.

const ART = [
  ["Heroes and Undead armies", "Kay Lousberg, KayKit Character Packs: Adventurers and Skeletons", "CC0", "https://kaylousberg.com"],
  ["Torches and coin piles", "Kay Lousberg, KayKit Dungeon Remastered", "CC0", "https://kaylousberg.com"],
  ["Classic 3D chess set", "Riley Queen, Chess Set, Poly Haven", "CC0", "https://polyhaven.com/a/chess_set"],
  ["Flat chess pieces", "Colin M.L. Burnett (Cburnett), via react-chessboard", "BSD", "https://github.com/Clariity/react-chessboard"],
  ["Voices", "Generated with Kokoro-82M (hexgrad)", "Apache-2.0", "https://huggingface.co/hexgrad/Kokoro-82M"],
] as const;

export default function Credits() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-10">
      <Head>
        <title>Credits | DegenChess</title>
      </Head>
      <Link href="/" aria-label="DegenChess home">
        <Wordmark />
      </Link>
      <h1 className="heading mt-10">Credits</h1>

      <h2 className="field-label mt-10">Music</h2>
      <ul className="facts">
        {MUSIC.map((t) => (
          <li key={t.file} className="py-3">
            <a className="link font-bold" href={t.source} target="_blank" rel="noreferrer">
              {t.title}
            </a>
            <span className="soft block text-sm">
              {t.by}. {t.licence}, via Wikimedia Commons.
            </span>
          </li>
        ))}
      </ul>

      <h2 className="field-label mt-10">Art, models and voices</h2>
      <ul className="facts">
        {ART.map(([what, who, licence, url]) => (
          <li key={what} className="py-3">
            <span className="font-bold">{what}</span>
            <span className="soft block text-sm">
              <a className="link" href={url} target="_blank" rel="noreferrer">
                {who}
              </a>
              . {licence}.
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
