import Head from "next/head";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://degen-chess.vercel.app";
const TITLE = "DegenChess - chess where every capture pays";
const DESCRIPTION =
  "Stake dollars on a game of chess. Every piece you capture moves its value to you instantly, on Monad. One passkey tap to start: no wallet, no seed phrase.";

export function Seo({ title }: { title?: string }) {
  const fullTitle = title ? `${title} | DegenChess` : TITLE;
  return (
    <Head>
      <title>{fullTitle}</title>
      <meta name="description" content={DESCRIPTION} />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content="#060908" />
      <link rel="canonical" href={SITE} />
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="icon" href="/favicon.png" type="image/png" sizes="64x64" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="DegenChess" />
      <meta property="og:url" content={SITE} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={DESCRIPTION} />
      <meta property="og:image" content={`${SITE}/og.png`} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={DESCRIPTION} />
      <meta name="twitter:image" content={`${SITE}/og.png`} />
    </Head>
  );
}
