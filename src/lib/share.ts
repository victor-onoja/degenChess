import { toast } from "react-toastify";

/** The link to a game: it opens straight onto the board, with one-tap sign-up for anyone new. */
export const gameUrl = (id: bigint) => `${window.location.origin}/?game=${id.toString()}`;

/**
 * Shares a game: the phone's share sheet where there is one, otherwise the link is copied.
 * Every shared game is how DegenChess spreads, so this is never more than one tap away.
 */
export async function shareGame(id: bigint, text: string) {
  const url = gameUrl(id);
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "DegenChess", text, url });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // they closed the sheet
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast.success("Link copied. Paste it anywhere.", { autoClose: 2500 });
  } catch {
    toast.info(`Share this link: ${url}`, { autoClose: 8000 });
  }
}
