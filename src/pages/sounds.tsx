import Head from "next/head";
import Link from "next/link";
import { useRef, useState } from "react";
import { Wordmark } from "../components/Wordmark";
import MUSIC from "../lib/music.json";
import VOICES from "../lib/voiceLines.json";
import { setMuted, sfx } from "../lib/sound";

// The sound check: every sound the game uses, played exactly as the game plays it, with where it is
// heard. For reviewing and choosing what stays. Not linked from the site.

const EFFECTS: { name: string; when: string; play: () => void }[] = [
  { name: "Pick up", when: "You select one of your pieces on the 3D board.", play: () => sfx.select() },
  { name: "Land", when: "A piece arrives on its square after a quiet move.", play: () => sfx.land() },
  { name: "Strike", when: "A capture lands.", play: () => sfx.hit() },
  { name: "Coins", when: "Just after a capture, as the stake flies to the capturer.", play: () => sfx.coins() },
  { name: "Footsteps: Heroes", when: "A Hero walks or runs to its square (armies only).", play: () => sfx.steps(0.9, false) },
  { name: "Footsteps: Undead", when: "A skeleton walks or runs to its square (armies only).", play: () => sfx.steps(0.9, true) },
  { name: "Win", when: "The game ends and you won or drew, or you were watching.", play: () => sfx.win() },
  { name: "Lose", when: "The game ends and you lost.", play: () => sfx.lose() },
];

const MOMENTS: Record<string, string> = {
  start: "A new game begins (each army calls out once).",
  capture: "They capture a pawn, knight or bishop (about 7 times in 10).",
  bigCapture: "They capture a rook or a queen.",
  rally: "They have just lost a rook or a queen.",
  check: "They give check.",
  mate: "They deliver checkmate.",
  promotion: "Their pawn promotes.",
  castle: "They castle (about 6 times in 10).",
  lowTime: "Your own clock drops under 10 seconds.",
};

export default function Sounds() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  /** Plays a file the way the game does; pressing the same one again stops it. */
  function play(id: string, src: string, { volume = 1, undead = false } = {}) {
    audio.current?.pause();
    if (playing === id) return setPlaying(null);
    const a = new Audio(src);
    a.volume = volume;
    if (undead) {
      a.preservesPitch = false;
      a.playbackRate = 0.84;
    }
    a.onended = () => setPlaying((p) => (p === id ? null : p));
    audio.current = a;
    setPlaying(id);
    void a.play().catch(() => setPlaying(null));
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-10">
      <Head>
        <title>Sound check | Away Chess</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Link href="/" aria-label="Away Chess home">
        <Wordmark />
      </Link>
      <h1 className="heading mt-10">Sound check</h1>
      <p className="lead mt-2">Every sound in the game, played the way the game plays it. Turn your volume up.</p>

      <h2 className="field-label mt-10">Music ({MUSIC.length} tracks, shuffled, played quietly under a game)</h2>
      <ul className="facts">
        {MUSIC.map((t) => (
          <li key={t.file} className="flex items-center justify-between gap-4 py-3">
            <span className="min-w-0">
              <span className="block truncate font-bold">{t.title}</span>
              <span className="soft block truncate text-sm">
                {t.by} · {t.kind === "orchestra" ? "orchestra" : "world"} · {t.licence}
              </span>
            </span>
            <span className="flex shrink-0 gap-2">
              <button className="ghost text-sm" aria-pressed={playing === `m-${t.file}`} onClick={() => play(`m-${t.file}`, `/music/${t.file}`, { volume: 0.22 })}>
                {playing === `m-${t.file}` ? "Stop" : "In-game volume"}
              </button>
              <button className="ghost text-sm" aria-pressed={playing === `M-${t.file}`} onClick={() => play(`M-${t.file}`, `/music/${t.file}`)}>
                {playing === `M-${t.file}` ? "Stop" : "Full"}
              </button>
            </span>
          </li>
        ))}
      </ul>

      {(["heroes", "undead"] as const).map((army) => (
        <section key={army}>
          <h2 className="field-label mt-10">
            Voices: {army === "heroes" ? "Heroes (White)" : "Undead (Black), slowed and lowered as in the game"}
          </h2>
          <ul className="facts">
            {Object.entries(VOICES[army]).flatMap(([moment, lines]) =>
              lines.map((line) => (
                <li key={line.file} className="flex items-center justify-between gap-4 py-3">
                  <span className="min-w-0">
                    <span className="block font-bold">&ldquo;{line.text}&rdquo;</span>
                    <span className="soft block text-sm">{MOMENTS[moment] ?? moment}</span>
                  </span>
                  <button
                    className="ghost shrink-0 text-sm"
                    aria-pressed={playing === line.file}
                    onClick={() => play(line.file, `/voices/${line.file}`, { volume: 0.9, undead: army === "undead" })}
                  >
                    {playing === line.file ? "Stop" : "Play"}
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>
      ))}

      <h2 className="field-label mt-10">Effects (made in the browser, no files)</h2>
      <ul className="facts">
        {EFFECTS.map((e) => (
          <li key={e.name} className="flex items-center justify-between gap-4 py-3">
            <span className="min-w-0">
              <span className="block font-bold">{e.name}</span>
              <span className="soft block text-sm">{e.when}</span>
            </span>
            <button
              className="ghost shrink-0 text-sm"
              onClick={() => {
                setMuted(false); // the sound check always makes sound
                e.play();
              }}
            >
              Play
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
