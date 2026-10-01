// Live contract addresses. Update after `npm run deploy:monad-testnet`
// (and keep cre/referee/config.staging.json in step).
export const MONAD_TESTNET = {
  chess: "0x7dd1ca9c5992e4e4af60039abeecbbb2e5c51d95",
  token: "0xfbf011ba1f7d08651181b5eebabb7048596de9de",
  /** ChessReferee: receives verdicts from the Chainlink CRE workflow and settles games. */
  referee: "0x7bb28b305f3df3c9b7ae080f18b43ac902547076",
} as const;
