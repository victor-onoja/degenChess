import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { DEV_ACCOUNTS } from "../wagmi";
import { sameAddress } from "../lib/format";

/** Local-chain only: one-click switching between two funded hardhat accounts, no wallet extension needed. */
export function DevAccounts() {
  const { address } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const mocks = connectors.filter((c) => c.type === "mock");
  // The connector list differs between server and client render; only render once mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="opacity-80">Dev:</span>
      {mocks.map((connector, i) => (
        <button
          key={connector.uid}
          className="retro-button-sm"
          disabled={sameAddress(address, DEV_ACCOUNTS[i])}
          onClick={async () => {
            await disconnectAsync();
            connect({ connector });
          }}
        >
          Player {i + 1}
        </button>
      ))}
    </div>
  );
}
