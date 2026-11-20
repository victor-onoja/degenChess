// A small UCI client for Stockfish, used to measure how closely a player's moves follow the engine.
// The binary comes from STOCKFISH_PATH (default "stockfish" on PATH; `apt install stockfish` on Debian).
// If it cannot start, `openEngine` returns null and the risk service runs without engine checks.
import { spawn } from "node:child_process";

const MATE = 10_000;
const CAP = 1_000; // centipawns: beyond this the exact number says nothing about the move

export async function openEngine({ path = process.env.STOCKFISH_PATH ?? "stockfish", depth = Number(process.env.ENGINE_DEPTH ?? 14) } = {}) {
  let proc;
  try {
    proc = spawn(path, [], { stdio: ["pipe", "pipe", "ignore"] });
  } catch {
    return null;
  }
  const failed = await new Promise((resolve) => {
    proc.once("error", () => resolve(true));
    setTimeout(() => resolve(false), 300);
  });
  if (failed) return null;

  let buffer = "";
  let waiter = null;
  proc.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      waiter?.(line);
    }
  });
  const send = (cmd) => proc.stdin.write(cmd + "\n");
  const until = (match, onLine) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("engine timed out")), 60_000);
      waiter = (line) => {
        onLine?.(line);
        if (match(line)) {
          clearTimeout(timer);
          waiter = null;
          resolve(line);
        }
      };
    });

  send("uci");
  await until((l) => l === "uciok");
  send("setoption name Threads value 1");
  send("isready");
  await until((l) => l === "readyok");

  /** Evaluate the position after `moves` (UCI list): best move and score for the side to move. */
  async function evaluate(moves) {
    let cp = 0;
    send(`position startpos${moves.length ? ` moves ${moves.join(" ")}` : ""}`);
    send(`go depth ${depth}`);
    const last = await until(
      (l) => l.startsWith("bestmove"),
      (l) => {
        const m = l.match(/ score (cp|mate) (-?\d+)/);
        if (!m || / upperbound| lowerbound/.test(l)) return;
        const v = Number(m[2]);
        cp = m[1] === "cp" ? v : v > 0 ? MATE - v : -MATE - v;
      }
    );
    const best = last.split(" ")[1];
    return { best: best === "(none)" ? null : best, cp: Math.max(-CAP, Math.min(CAP, cp)) };
  }

  /** Evaluations of every position in a game: index i is the position before ply i (and after the last). */
  async function analyse(played) {
    send("ucinewgame");
    const evals = [];
    for (let i = 0; i <= played.length; i++) evals.push(await evaluate(played.slice(0, i)));
    return evals;
  }

  return { analyse, close: () => (send("quit"), proc.kill()) };
}
