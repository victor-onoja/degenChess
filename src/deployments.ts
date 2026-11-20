// Live contract addresses. Update after `npm run deploy:monad-testnet`
// (and keep cre/referee/config.staging.json in step).
export const MONAD_TESTNET = {
  chess: "0x956481c2f626b3a212ad42a77eddc2823c80c53b",
  token: "0xfbf011ba1f7d08651181b5eebabb7048596de9de",
  /** ChessReferee: receives verdicts from the Chainlink CRE workflow and settles games. */
  referee: "0xafbd77a9fa6787dd343cdee4b2bf34fee6bfb946",
  /** PlayerNames: usernames, shared across game redeployments. */
  names: "0xeeff1b2601b45472ea746527e9482a882a36f114",
  /** Tournaments: a register of round-robin leagues (holds no money). */
  tournaments: "0xbff8837f028d848a7f58e159a83dde308931cfb5",
  /** ChessRatings: chess.com ratings brought on-chain by the rating workflow (Chainlink CRE). */
  ratings: "0xd06d7d6c4de3aedd13c781e1fb3580464c863c60",
} as const;
