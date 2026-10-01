// Live contract addresses. Update after `npm run deploy:monad-testnet`
// (and keep cre/referee/config.staging.json in step).
export const MONAD_TESTNET = {
  chess: "0x7ae0bbe6747b4571990088d2522bf7da62297c48",
  token: "0xfbf011ba1f7d08651181b5eebabb7048596de9de",
  /** ChessReferee: receives verdicts from the Chainlink CRE workflow and settles games. */
  referee: "0xa44cb8a45c17094782c8b04ca252639525b61a20",
  /** PlayerNames: usernames, shared across game redeployments. */
  names: "0xaf87e4ad92ea3cae05f8696f534d43b19a40a5e6",
} as const;
