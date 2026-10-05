import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import { DISCORD_URL } from "../config";
import { useDegenAccount } from "../lib/account";
import { shortAddress } from "../lib/format";
import { useNames } from "../lib/names";

const KINDS = [
  { id: "bug", name: "A bug", ask: "What happened, and what did you expect instead?" },
  { id: "idea", name: "An idea", ask: "What would you like Away Chess to do?" },
  { id: "other", name: "Something else", ask: "What's on your mind?" },
] as const;

/** A link that opens the feedback form. `className` styles the link itself. */
export function FeedbackLink({ className = "link", children = "Feedback" }: { className?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <FeedbackForm onClose={() => setOpen(false)} />}
    </>
  );
}

/** Bugs, ideas and anything else, sent to the team with the player's name and the page they are on. */
function FeedbackForm({ onClose }: { onClose: () => void }) {
  const { address } = useDegenAccount();
  const { nameOf } = useNames([address]);
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("bug");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  async function send() {
    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          message,
          from: address ? (nameOf(address) ?? shortAddress(address)) : "",
          page: window.location.pathname + window.location.search,
          device: `${window.innerWidth}x${window.innerHeight} · ${navigator.userAgent}`,
        }),
      });
      if (res.ok) return setSent(true);
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? "Could not send that just now. Please try again.");
    } catch {
      toast.error("Could not send that just now. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  // Rendered at the top of the page, so no header or board layer can sit over it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(3,2,8,0.72)] sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="slab max-h-[92dvh] w-full max-w-md overflow-y-auto p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="feedback-title" className="text-lg font-bold">
            {sent ? "Thank you" : "Tell us what you think"}
          </h2>
          <button className="link text-sm" onClick={onClose}>
            Close
          </button>
        </div>

        {sent ? (
          <>
            <p className="mt-2">Sent. Every message is read.</p>
            {DISCORD_URL && (
              <a className="act act--bone mt-5 w-full" href={DISCORD_URL} target="_blank" rel="noreferrer">
                Join the Discord
              </a>
            )}
          </>
        ) : (
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div className="rank mb-4" role="group" aria-label="Kind of feedback">
              {KINDS.map((k) => (
                <button type="button" key={k.id} className="rank__square" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
                  {k.name}
                </button>
              ))}
            </div>
            <label htmlFor="feedback-message" className="field-label">
              {KINDS.find((k) => k.id === kind)!.ask}
            </label>
            <textarea
              id="feedback-message"
              className="min-h-[9rem] w-full p-3"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 1500))}
              autoFocus
            />
            <button type="submit" className="act mt-4 w-full" disabled={sending || message.trim().length < 5}>
              {sending ? "Sending..." : "Send"}
            </button>
            <p className="soft mt-2 text-xs">
              Sent with {address ? "your username" : "no name (you are not signed in)"}, the page you are on and your browser type, so a bug can be
              found.
              {DISCORD_URL && (
                <>
                  {" "}
                  Prefer to talk?{" "}
                  <a className="link" href={DISCORD_URL} target="_blank" rel="noreferrer">
                    Join the Discord
                  </a>
                  .
                </>
              )}
            </p>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
