// Live contract addresses. Update after `npm run deploy:monad-testnet`
// (and keep cre/referee/config.staging.json in step).
export const MONAD_TESTNET = {
  chess: "0x75e210a916fd5acd3bde6e065039cfac19fab2ac",
  token: "0xfbf011ba1f7d08651181b5eebabb7048596de9de",
  /** ChessReferee: receives verdicts from the Chainlink CRE workflow and settles games. */
  referee: "0x7704a19a16ff7e916c2572f0e14c475d09db5062",
  /** PlayerNames: usernames, shared across game redeployments. */
  names: "0xaf87e4ad92ea3cae05f8696f534d43b19a40a5e6",
} as const;
