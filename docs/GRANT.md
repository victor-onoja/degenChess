# Grant application draft: Away Chess

A reusable draft for ecosystem grants (Monad ecosystem programmes, Chainlink grants and similar). Most forms ask for these sections, so copy them into the form and fill in the bracketed parts. Every number below can be checked on-chain or at `/stats`.

---

## One line

Away Chess is staked chess for people who have never used crypto. Every piece carries a share of the stake, so each capture is a payment settled on Monad in under a second. It runs on one passkey, with no wallet and no seed phrase.

## The problem

Online chess players already bet: side bets in clubs, Discord servers, streamer challenges. Today that means trusting a stranger to pay up after the game, or paying an escrow middleman. Crypto could fix the trust, but wallets, seed phrases and per-move signing prompts make it unusable for a chess player.

## What we built (live on Monad testnet)

- **Stakes that move during the game.** A pawn is 1/39 of the stake, a queen 9/39. A capture moves that value in the same transaction as the move. The winner takes the pot, and the loser keeps what they captured.
- **Passkey accounts (Mera).** One Face ID tap creates two keys: a money key that asks every time money moves, and a game key the contract limits to chess moves, so play needs no prompts. Nothing secret is stored.
- **A referee nobody has to trust (Chainlink CRE).** A workflow replays every game, settles checkmates and rule draws, and forfeits illegal moves. A second workflow brings verified chess.com ratings on-chain.
- **Fair play built into the contract.** New accounts have capped stakes and a hold on payouts. A risk service checks games against Stockfish, flags collusion, freezes accounts within limits the contract sets (at most 14 days), and promotes clean players.
- Leaderboard, tournaments with prize pots, invite links that pay their sender part of the fee, and open stats.

Repo: https://github.com/victor-onoja/degenChess (MIT). Live: https://test.awaychess.com

## Why Monad

Every move is a transaction. On-chain chess only feels like chess when a move confirms in about a second for a fraction of a cent, which is what Monad delivers. On slower or pricier chains this design is impossible.

## Traction so far (honest)

Built in the Metropolis hackathon window (27 September to 13 October 2026). On testnet: 37 players, 43 finished games, 198 tUSD staked. Retention after hackathon week was weak: 18% of a week's players came back the next week. Our next milestone is about fixing exactly that (below), before any real money.

## Milestones and what the grant pays for

| # | Milestone | Proof | Timing |
| --- | --- | --- | --- |
| 1 | Retention on testnet: 50 weekly players, 30%+ returning the next week | `/stats` | [8 weeks from award] |
| 2 | Independent audit of the five contracts, findings fixed | published report | [10 weeks] |
| 3 | Mainnet launch with USDC, fair-play tiers live, risk service running | contract addresses, `/stats` | [14 weeks] |
| 4 | 1,000 mainnet games, no unresolved fair-play incident | `/stats`, risk log summary | [26 weeks] |

| Item | Amount (estimate) |
| --- | --- |
| Smart-contract audit | [get two quotes; budget $10,000–$20,000] |
| Chainlink DON for the referee and rating workflows, first year | $7,200 (quoted) |
| Gas sponsorship for the first [N] mainnet games | [G × N, see docs/MAINNET.md] |
| Community tournament prize pools (launch season) | [$5,000] |
| Servers, monitoring, domain | [$1,000] |
| **Total** | **[sum]** |

## Team

[Your name, location, background, and why chess, in two or three sentences. Link GitHub and any chess profile.]

## Risks and how we handle them

- **Cheating:** stake caps and payout holds for new accounts, engine checks, human review before any penalty.
- **Regulation:** a legal opinion before mainnet, launch only in markets it clears, geofencing, age checks.
- **Cold start:** weekly fixed-time events and community leagues, rather than relying on random matchmaking.
