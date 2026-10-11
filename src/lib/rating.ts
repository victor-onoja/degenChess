// Linking a chess.com account: the rules shared by the Chainlink CRE workflow (cre/rating), the
// app's own delivery route (/api/rating) and the interface. No imports, so the workflow can bundle it.

/** chess.com usernames as the contract accepts them: lower case, 3 to 25 of a-z, 0-9, "_" and "-". */
export const HANDLE_RULE = /^[a-z0-9_-]{3,25}$/;
export const cleanHandle = (input: string) => input.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 25);

/**
 * The code a player puts on their chess.com profile (in Location) to show the account is theirs.
 * It is derived from their Away Chess address, so nobody else's code fits their account.
 */
export const linkCode = (player: string) => `away-${player.slice(-6).toLowerCase()}`;

export const Outcome = { Verified: 1, CodeMissing: 2, NoAccount: 3, HandleTaken: 4 } as const;
export const OUTCOME_TEXT: Record<number, string> = {
  [Outcome.CodeMissing]: "Your code was not on that chess.com profile. Put it in Location, save, and try again.",
  [Outcome.NoAccount]: "chess.com has no player with that username.",
  [Outcome.HandleTaken]: "Another Away Chess player has already linked that chess.com account.",
};

export interface Assessment {
  outcome: number;
  rapid: number;
  blitz: number;
  bullet: number;
}

/** What chess.com's public API returns for a player (the parts used here). */
export interface Profile {
  username?: string;
  name?: string;
  location?: string;
}
type Stat = { last?: { rating?: number } } | undefined;
export interface Stats {
  chess_rapid?: Stat;
  chess_blitz?: Stat;
  chess_bullet?: Stat;
}

const rating = (s: Stat) => {
  const r = Math.round(Number(s?.last?.rating ?? 0));
  return Number.isFinite(r) && r > 0 ? Math.min(r, 65535) : 0;
};

/**
 * Decides a link request from what chess.com says. `profile` is null when there is no such account.
 * The account counts as the player's when its Location (or Name) carries their code.
 */
export function assess(player: string, handle: string, profile: Profile | null, stats: Stats | null): Assessment {
  const none = { rapid: 0, blitz: 0, bullet: 0 };
  if (!profile || String(profile.username ?? "").toLowerCase() !== handle) return { outcome: Outcome.NoAccount, ...none };
  const code = linkCode(player);
  const shown = `${profile.location ?? ""} ${profile.name ?? ""}`.toLowerCase();
  if (!shown.includes(code)) return { outcome: Outcome.CodeMissing, ...none };
  return { outcome: Outcome.Verified, rapid: rating(stats?.chess_rapid), blitz: rating(stats?.chess_blitz), bullet: rating(stats?.chess_bullet) };
}

/** The one number shown next to a name: rapid if they have one, else blitz, else bullet. */
export const headline = (r: { rapid: number; blitz: number; bullet: number }) => r.rapid || r.blitz || r.bullet;
