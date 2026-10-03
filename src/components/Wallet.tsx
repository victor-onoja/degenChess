import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { erc20Abi, isAddress, keccak256, parseUnits, toBytes, zeroAddress } from "viem";
import { useBalance, useReadContract } from "wagmi";
import { CHAIN, TOKEN_DECIMALS, TOKEN_SYMBOL } from "../config";
import { useDegenAccount } from "../lib/account";
import { tokenContract, useTokenState } from "../lib/contract";
import { formatToken, sameAddress } from "../lib/format";
import { cleanName, NAME_RULE, namesContract, useNames } from "../lib/names";
import { Icon } from "./Icon";

/**
 * Your money outside a game: what you hold, how to add more, and how to send it to anyone by
 * username or address. Sending asks for your passkey, like every money action.
 */
export function Wallet({ onClose }: { onClose: () => void }) {
  const { address, busy, sendMoney } = useDegenAccount();
  const { balance } = useTokenState();
  const { data: gas } = useBalance({ address: address ?? undefined, chainId: CHAIN.id, query: { enabled: !!address } });
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!address) return;
    QRCode.toString(address, { type: "svg", margin: 0, color: { dark: "#0a0a14", light: "#f1e9d6" } }).then(setQr, () => setQr(""));
  }, [address]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  // The recipient: an address as typed, or the owner of a username.
  const name = to.startsWith("0x") ? "" : cleanName(to);
  const { data: holder } = useReadContract({
    ...namesContract,
    functionName: "ownerOfName",
    args: [keccak256(toBytes(NAME_RULE.test(name) ? name : "_"))],
    query: { enabled: NAME_RULE.test(name) },
  });
  const recipient = isAddress(to) ? to : holder && holder !== zeroAddress ? holder : null;
  const { label } = useNames([recipient]);
  let value: bigint | null = null;
  try {
    value = amount.trim() ? parseUnits(amount.trim(), TOKEN_DECIMALS) : null;
  } catch {}
  const problem = !to
    ? null
    : !recipient
      ? NAME_RULE.test(name) && holder === zeroAddress
        ? "No player has that username."
        : isAddress(to) || NAME_RULE.test(name)
          ? null
          : "Enter a username or a 0x address."
      : sameAddress(recipient, address ?? undefined)
        ? "That's you."
        : value !== null && balance !== undefined && value > balance
          ? `You have ${formatToken(balance)} ${TOKEN_SYMBOL}.`
          : null;
  const canSend = !!recipient && !problem && value !== null && value > 0n && busy === null;

  async function send() {
    if (!recipient || value === null) return;
    const done = await sendMoney(`Send ${amount} ${TOKEN_SYMBOL} to ${label(recipient)}`, () => [
      { address: tokenContract.address, abi: erc20Abi, functionName: "transfer", args: [recipient, value] },
    ]);
    if (done) {
      setTo("");
      setAmount("");
    }
  }

  if (!address) return null;
  // Rendered at the top of the page, so no header or hero layer can sit over it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(3,2,8,0.72)] sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-title"
        className="slab max-h-[92dvh] w-full max-w-md overflow-y-auto p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="wallet-title" className="text-lg font-bold">
              Your money
            </h2>
            <p className="amount text-3xl">
              {formatToken(balance)} {TOKEN_SYMBOL}
            </p>
            <p className="soft text-xs">{gas ? `${Number(gas.formatted).toFixed(3)} MON for gas` : " "}</p>
          </div>
          <button className="ghost" aria-label="Close" onClick={onClose}>
            <Icon name="back" />
          </button>
        </div>

        <section className="mt-6">
          <h3 className="field-label">Add funds</h3>
          <p className="soft text-sm">
            Send {TOKEN_SYMBOL} on Monad to your account address. It arrives in about a second. Only send on Monad: other
            networks won&apos;t reach you.
          </p>
          <div className="mt-3 flex items-center gap-4">
            {qr && <div className="h-28 w-28 shrink-0 rounded-[3px] bg-[var(--bone)] p-2" dangerouslySetInnerHTML={{ __html: qr }} />}
            <div className="min-w-0">
              <code className="block break-all text-xs">{address}</code>
              <button
                className="act act--sm act--bone mt-2"
                onClick={() => {
                  void navigator.clipboard?.writeText(address).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? "Copied" : "Copy address"}
              </button>
            </div>
          </div>
          <p className="soft mt-3 text-xs">
            This is the test network: new players get 100 test dollars at sign-up, and they have no value. On mainnet this is
            also where you will add dollars by card.
          </p>
        </section>

        <section className="mt-6">
          <h3 className="field-label">Send</h3>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSend) void send();
            }}
          >
            <input
              value={to}
              onChange={(e) => setTo(e.target.value.trim())}
              placeholder="username or 0x address"
              aria-label="Send to"
              className="min-h-[44px] px-3"
              autoComplete="off"
            />
            <div className="flex items-stretch">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`amount in ${TOKEN_SYMBOL}`}
                aria-label="Amount"
                inputMode="decimal"
                className="min-h-[44px] w-full min-w-0 px-3"
              />
              <button type="submit" className="act act--sm shrink-0" style={{ minHeight: 44, borderRadius: 0 }} disabled={!canSend}>
                Send
              </button>
            </div>
            <span className="text-xs" style={{ color: problem ? "var(--alert)" : "var(--bone-soft)" }}>
              {problem ?? (recipient ? `To ${label(recipient)}. Asks for your passkey.` : "Asks for your passkey.")}
            </span>
          </form>
        </section>
      </div>
    </div>,
    document.body
  );
}
