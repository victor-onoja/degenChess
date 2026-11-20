# Mainnet readiness checklist

Nothing real goes into the contracts until every box here is ticked. Owner: the founder. Status as of 20 November 2026.

## Contracts

- [x] Trust layer: tier caps, payout holds, bounded freeze, penalize (DegenChess v9, 50 contract tests)
- [ ] v9 deployed to Monad testnet and run there for at least four weeks with the risk service live
- [ ] Independent audit of DegenChess, ChessReferee, Tournaments, PlayerNames and ChessRatings, with findings fixed
- [ ] Tournament prize pots go through the payout hold (today they are paid directly at settlement)
- [ ] A contract-wide cap on total value held, raised by the owner as confidence grows
- [ ] Owner moved to a multisig (`transferOwnership` then `acceptOwnership`), keys held by different people/devices
- [ ] Risk operator is a separate key that can only set tiers, freeze and penalize (it already cannot touch fees or ownership)

## Money

- [ ] Stake token: USDC on Monad (take the address from Circle's official list, never from a search result)
- [ ] No faucet on mainnet: no free money for new accounts, because anything free gets farmed by fake accounts
- [ ] A way in for people without crypto: a card-to-USDC on-ramp that allows skill-gaming merchants (check their terms first: many refuse gambling)
- [ ] Fee withdrawals to the multisig only

## Gas: decide before launch

On testnet a full game was about 80 transactions, ~0.3 MON of move gas per player at ~102 gwei. Measure the real mainnet figure with `tools/play-test-game.mjs` and fill in:

| | value |
| --- | --- |
| Gas per game, both players, in MON | _measure_ |
| MON price on the day | _look up_ |
| Gas per game in USD (G) | _calculate_ |

Our fee on a decisive game is 5% of one player's stake (2.5% of a pot of two stakes). If we sponsor gas, **the break-even stake is about 20 × G**, more once referral shares and draws are counted. Options:

1. **Players pay their own gas.** Simplest, but every player needs MON as well as USDC.
2. **Sponsor gas, with a minimum stake** above the break-even.
3. **Moves signed off-chain**, with on-chain settlement of captures, results and disputes. Cuts gas about 40 times but changes the "every capture settles on-chain" story. A big change: do it only if 1 and 2 fail.

## Fair play

- [ ] Risk service running on the server with Stockfish (deploy/risk), alerts going to a channel someone reads daily
- [ ] Mainnet tier policy, set with `risk-watch.mjs policy`:

  | Tier | Who | Max stake | Payout hold |
  | --- | --- | --- | --- |
  | 0 | new account | $10 | 24 hours |
  | 1 | 10 clean games, 5 opponents | $50 | 6 hours |
  | 2 | 40 clean games, 15 opponents (or verified chess.com) | $250 | 1 hour |
  | 3 | set by hand | by agreement | none |

- [ ] Thresholds in `tools/risk/signals.mjs` calibrated on at least 200 real testnet games
- [ ] A written fair-play policy players can read: what is checked, what happens when you're flagged, how to appeal

## Law and trust

- [ ] Written legal opinion on the launch markets ([LEGAL-BRIEF.md](LEGAL-BRIEF.md))
- [ ] Geofencing for the markets it rules out, at the app and the sign-up
- [ ] Terms of use, privacy notice, age check (18+ or the local age)
- [ ] Responsible play: deposit and loss limits a player can set on themselves, self-exclusion

## Running it

- [ ] Referee on a Chainlink DON (quoted ~$7,200 a year), or the VPS referee with monitoring and a second reporter key
- [ ] `/api/health` checked by an uptime monitor, low-balance alerts going to Discord
- [ ] Passkeys: mainnet lives at `awaychess.com`, a different hostname from testnet, so every account starts fresh. Say so clearly at launch.
