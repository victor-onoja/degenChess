import dynamic from "next/dynamic";
import Head from "next/head";
import { useState } from "react";
import type { Clip } from "../components/arena/ModelViewer";

const ModelViewer = dynamic(() => import("../components/arena/ModelViewer"), { ssr: false });
const ARMIES = ["bulls", "bears"];
const CLIPS: Clip[] = ["idle", "walk", "attack", "death"];

/**
 * Character check: every model in an army, playing one clip. Use it after `npm run models` to confirm
 * a re-exported animation looks right before it goes into the game. Drag to orbit, scroll to zoom.
 */
export default function Models() {
  const [army, setArmy] = useState(ARMIES[0]);
  const [clip, setClip] = useState<Clip>("idle");
  const [replay, setReplay] = useState(0);

  return (
    <div className="flex h-[100dvh] flex-col">
      <Head>
        <title>DegenChess models</title>
      </Head>
      <div className="flex flex-wrap items-center gap-2 p-3">
        <span className="logo mr-2 text-xs">Models</span>
        {ARMIES.map((a) => (
          <button key={a} className={`btn-ghost capitalize ${army === a ? "!border-[#00ff66]" : ""}`} onClick={() => setArmy(a)}>
            {a}
          </button>
        ))}
        <span className="mx-2 opacity-40">|</span>
        {CLIPS.map((c) => (
          <button
            key={c}
            className={`btn-ghost capitalize ${clip === c ? "!border-[#00ff66]" : ""}`}
            onClick={() => {
              setClip(c);
              setReplay((n) => n + 1); // clicking the current clip again replays it
            }}
          >
            {c}
          </button>
        ))}
        <span className="ml-2 text-sm opacity-70">Click a clip again to replay it. A red note means that clip is missing from the file.</span>
      </div>
      <div className="min-h-0 flex-1">
        <ModelViewer army={army} clip={clip} replay={replay} />
      </div>
    </div>
  );
}
