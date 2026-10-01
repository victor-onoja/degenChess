import "../styles/globals.css";
import type { AppProps } from "next/app";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

import { config } from "../wagmi";
import { AccountProvider } from "../lib/account";

const client = new QueryClient();

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={client}>
        <AccountProvider>
          <Component {...pageProps} />
        </AccountProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default MyApp;
