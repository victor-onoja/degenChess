import { createConfig, http } from "wagmi";
import { CHAIN } from "./config";

// wagmi is only used for reading chain state. Accounts and signing are Mera passkeys (src/lib/account.tsx).
export const config = createConfig({
  chains: [CHAIN],
  transports: { [CHAIN.id]: http() } as Record<typeof CHAIN.id, ReturnType<typeof http>>,
  ssr: true,
});
