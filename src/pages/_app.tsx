import "../styles/globals.css";
import type { AppProps } from "next/app";
import { useEffect } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

import { config } from "../wagmi";
import { AccountProvider } from "../lib/account";
import { rememberReferrer } from "../lib/referral";

const client = new QueryClient();

function MyApp({ Component, pageProps }: AppProps) {
  useEffect(rememberReferrer, []);
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
