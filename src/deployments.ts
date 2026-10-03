// Live contract addresses. Update after `npm run deploy:monad-testnet`
// (and keep cre/referee/config.staging.json in step).
export const MONAD_TESTNET = {
  chess: "0x917b22e817906c3f04d3b60092e87bf3473953d6",
  token: "0xfbf011ba1f7d08651181b5eebabb7048596de9de",
  /** ChessReferee: receives verdicts from the Chainlink CRE workflow and settles games. */
  referee: "0x498d7dc71e6ac9d9556a347fc2fac92bd7569cda",
  /** PlayerNames: usernames, shared across game redeployments. */
  names: "0xaf87e4ad92ea3cae05f8696f534d43b19a40a5e6",
} as const;
