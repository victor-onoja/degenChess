import { toast } from "react-toastify";

/** The link to a game: it opens straight onto the board, with one-tap sign-up for anyone new. */
export const gameUrl = (id: bigint, ref?: string) =>
  `${window.location.origin}/?game=${id.toString()}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}`;

/**
 * Shares a game: the share sheet on touch devices, otherwise the link is copied.
 * Every shared game is how Away Chess spreads, so this is never more than one tap away.
 */
export async function shareGame(id: bigint, text: string, ref?: string) {
  const url = gameUrl(id, ref);
  // The share sheet belongs on phones and tablets; on a desktop, copying the link is what people expect.
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Away Chess", text, url });
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

/** Your own invite link: the Yard, carrying your name, so sign-ups through it count as your invites. */
export const inviteUrl = (ref: string) => `${window.location.origin}/?ref=${encodeURIComponent(ref)}`;

export async function shareInvite(ref: string) {
  const url = inviteUrl(ref);
  const text = "Play me at chess on Away Chess: every piece you take pays.";
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Away Chess", text, url });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied.", { autoClose: 2500 });
  } catch {
    toast.info(`Your invite link: ${url}`, { autoClose: 8000 });
  }
}
