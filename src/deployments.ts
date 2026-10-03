// Live contract addresses. Update after `npm run deploy:monad-testnet`
// (and keep cre/referee/config.staging.json in step).
export const MONAD_TESTNET = {
  chess: "0x17c898b9814323a5bd364c77b6a41b341cdbda51",
  token: "0xfbf011ba1f7d08651181b5eebabb7048596de9de",
  /** ChessReferee: receives verdicts from the Chainlink CRE workflow and settles games. */
  referee: "0x2a54f9443c84c472488020c878797a2fead78cdf",
  /** PlayerNames: usernames, shared across game redeployments. */
  names: "0xaf87e4ad92ea3cae05f8696f534d43b19a40a5e6",
} as const;
