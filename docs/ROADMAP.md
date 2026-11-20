# Away Chess: from testnet to a business

Written 20 November 2026, after the Monad Metropolis hackathon. This is the plan for turning the hackathon build into a staked chess network that pays for itself. Each phase has a test it must pass before the next one starts.

## Where we start

From the contract (`node tools/metrics.mjs`, 20 November 2026):

| | |
| --- | --- |
| Players | 37 (13 played 2+ games, 4 played 5+) |
| Games | 43 finished, 6 cancelled |
| Staked | 198 tUSD, average stake 2.25 |
| Week-on-week retention | 18% |
| Activity by week | W41: 24 players, W42: 16, W43: 4, W44: 2, nothing since |

Hackathon week brought people in, and almost nobody stayed. Our reading (20 November 2026): on testnet there is nothing to win, so a wagering product has no reason to bring anyone back. The test of that is a real-money launch. So mainnet is the next target, as a **capped launch**: stakes, and the total the contract may hold, stay small until the product has earned bigger ones. A bug or a cheater can then only cost a small, known amount.

## How the money works

We take 2.5% of the pot on decisive games, draws are free, and up to 20% of the fee goes to whoever invited the players. A $5 stake each leaves about **$0.21 net per decisive game**.

| Net per month | at $5 stakes | at $20 stakes |
| --- | --- | --- |
| $3,000 | ~470 decisive games a day | ~120 a day |
| $10,000 | ~1,600 a day | ~400 a day |

Two things erode this. One is gas: on mainnet, whoever pays for moves pays about 80 transactions a game (see [MAINNET.md](MAINNET.md)). The other is cheating: one engine user farming the site wipes out a month of fees and the community's trust with it.

## Phase 1: ready for real money (now to launch)

**Test before moving on:** every item in [MAINNET.md](MAINNET.md) is ticked.

- Trust layer in the contract: done in v9 (tier stake caps, payout holds, bounded freezes, penalize), live on testnet since 20 November.
- Risk service: done (engine agreement, collusion flags, auto-freeze, promotions). Running it on testnet now gets the fair-play flow shaken out with no real money at stake.
- Mainnet engineering: a contract-wide cap on the total held, tournament prize pots through the hold, Monad mainnet and USDC config, no faucet.
- Independent audit of the v9 contracts (AUDIT.md lists what changed and the questions).
- Legal opinion on the launch markets ([LEGAL-BRIEF.md](LEGAL-BRIEF.md)), geofencing and terms to match.
- Gas plan: measure the real cost per game on mainnet, then choose between player-paid gas and sponsored gas with a minimum stake.
- Launch community: a waitlist in Discord, three communities (a club, a Discord server, a small streamer) booked for launch week, and a first Sunday cup with a real prize pot.

## Phase 2: capped mainnet launch

**Test before raising the caps:** three months with no unresolved fair-play incident, 30%+ of a week's players back the next week, and fees covering running costs (gas sponsorship, referee, servers).

- Launch at `awaychess.com` with real USDC, a tier-0 cap of $10, a 24-hour hold for new accounts, and a contract-wide limit on total value held.
- Only in markets the legal opinion clears. A blocked region gets the free practice board and tournaments without prize pots.
- Funding: ecosystem grants ([GRANT.md](GRANT.md)) for the audit, the Chainlink DON fee and launch prize pools. No token.
- Weekly fixed-time events from day one, so the lobby is never empty when people arrive.

## Phase 3: raise the caps

- Raise tier caps and the contract-wide limit as the risk service's record justifies it.
- Per-move timing signals and rating-adjusted fair-play thresholds, calibrated on real games.

## Phase 4: growth

- Streamer matches ("play the streamer for $1") with the share link and the 20% invite share as the loop.
- Community leagues: club against club, Discord against Discord.
- Raise tier caps as the risk service's record justifies it.
- More games on the same account layer (passkey, scoped game key, stakes that move during play): the "Degen Yard" idea, once chess pays for itself.

## What this plan deliberately does not do

- **No token.** It's the riskiest route legally, and it attracts speculators rather than players.
- **No house bots playing for money.** Undisclosed bots against players is fraud, and disclosed ones kill the point.
- **No uncapped mainnet.** The caps come off as the record earns it, not on launch day.
