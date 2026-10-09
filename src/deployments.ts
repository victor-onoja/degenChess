// Live contract addresses. Update after `npm run deploy:monad-testnet`
// (and keep cre/referee/config.staging.json in step).
export const MONAD_TESTNET = {
  chess: "0x2e44f61ea3616a1b1ff5393ddccdb2fac58b2f00",
  token: "0xfbf011ba1f7d08651181b5eebabb7048596de9de",
  /** ChessReferee: receives verdicts from the Chainlink CRE workflow and settles games. */
  referee: "0xba90386c49ebdbe1f4ae572e5081421a909f8617",
  /** PlayerNames: usernames, shared across game redeployments. */
  names: "0xeeff1b2601b45472ea746527e9482a882a36f114",
  /** Tournaments: a register of round-robin leagues (holds no money). */
  tournaments: "0x5b311b1e143f44404077e4521279148b4a2e8cfa",
} as const;
