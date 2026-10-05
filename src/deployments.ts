// Live contract addresses. Update after `npm run deploy:monad-testnet`
// (and keep cre/referee/config.staging.json in step).
export const MONAD_TESTNET = {
  chess: "0xb035514b25f72bc329529551b5177079ea54c4d9",
  token: "0xfbf011ba1f7d08651181b5eebabb7048596de9de",
  /** ChessReferee: receives verdicts from the Chainlink CRE workflow and settles games. */
  referee: "0xd34e5e6b1c8d0825a1468713d5764d6070fe5d0d",
  /** PlayerNames: usernames, shared across game redeployments. */
  names: "0xeeff1b2601b45472ea746527e9482a882a36f114",
  /** Tournaments: a register of round-robin leagues (holds no money). */
  tournaments: "0xe7a1bac8f11ae9d36ad462a7d0256f544f4df173",
} as const;
