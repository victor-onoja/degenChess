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

Hackathon week brought people in, and almost nobody stayed. The product works, but nobody is coming back yet. Fixing that comes before mainnet, money or marketing.

## How the money works

We take 2.5% of the pot on decisive games, draws are free, and up to 20% of the fee goes to whoever invited the players. A $5 stake each leaves about **$0.21 net per decisive game**.

| Net per month | at $5 stakes | at $20 stakes |
| --- | --- | --- |
| $3,000 | ~470 decisive games a day | ~120 a day |
| $10,000 | ~1,600 a day | ~400 a day |

Two things erode this. One is gas: on mainnet, whoever pays for moves pays about 80 transactions a game (see [MAINNET.md](MAINNET.md)). The other is cheating: one engine user farming the site wipes out a month of fees and the community's trust with it.

## Phase 1: people come back (testnet, now to mid-January)

**Test before moving on:** 50 people playing in a week, with 30%+ of them playing again the next week, measured on `/stats`.

- Weekly fixed-time event: a Sunday cup on the existing tournament contract, announced in Discord, prize in tUSD plus a role or badge.
- Bring in three communities rather than individuals: one chess club, one Discord server, one small chess streamer. Each gets its own league link.
- Talk to every player who played 2+ games and ask what brought them back. Ask everyone who played once why they didn't return.
- Fix whatever those conversations surface before building anything new.
- Run the risk service on testnet (deploy/risk) so the fair-play flow gets shaken out with no real money at stake.

## Phase 2: safe to hold real money (in parallel with phase 1)

**Test before moving on:** every item in [MAINNET.md](MAINNET.md) is ticked.

- Trust layer in the contract (done in v9): tier stake caps, payout holds, bounded freezes, penalize.
- Risk service (done): engine agreement, collusion flags, auto-freeze, promotions. Next: per-move timing from block timestamps, and rating-adjusted thresholds once the chess.com link is common.
- Independent audit of the v9 contracts (see AUDIT.md for what changed and the questions).
- Legal opinion on the first markets ([LEGAL-BRIEF.md](LEGAL-BRIEF.md)), geofencing and terms to match.
- Gas plan for mainnet: measure the real cost per game, then choose between player-paid gas, sponsored gas with a minimum stake, or batching moves off-chain.

## Phase 3: mainnet, small and careful

**Test before moving on:** three months with no unresolved fair-play incident, and fees covering running costs (gas sponsorship, referee, servers).

- Launch at `awaychess.com` with real USDC, a tier-0 cap of $10, a 24-hour hold for new accounts, and a hard contract-wide limit while the audit is fresh.
- Only in markets the legal opinion clears. A blocked region sees the free practice board and tournaments without prize pots.
- Funding: ecosystem grants ([GRANT.md](GRANT.md)) for the audit, the Chainlink DON fee and launch prize pools. No token.

## Phase 4: growth

- Streamer matches ("play the streamer for $1") with the share link and the 20% invite share as the loop.
- Community leagues: club against club, Discord against Discord.
- Raise tier caps as the risk service's record justifies it.
- More games on the same account layer (passkey, scoped game key, stakes that move during play): the "Degen Yard" idea, once chess pays for itself.

## What this plan deliberately does not do

- **No token.** It's the riskiest route legally, and it attracts speculators rather than players.
- **No house bots playing for money.** Undisclosed bots against players is fraud, and disclosed ones kill the point.
- **No mainnet before phase 1 passes.** An empty lobby with real money in it is still an empty lobby.
