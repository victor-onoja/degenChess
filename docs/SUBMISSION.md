# DegenChess: submission pack

Draft answers for every field on the submission form, plus the three video scripts. Items marked **TODO** aren't done yet.

Deadline: 14 October 2026, 04:59 GMT+1.

---

## Form fields

**Project name:** DegenChess

**One-line description:** Chess where every capture pays: stake dollars, take a piece, take its value, with one passkey tap and no wallet.

**Repo URL:** <https://github.com/victor-onoja/degenChess>

**Live link (Monad testnet):** <https://degen-chess.vercel.app>

**Contract (Monad testnet, chain 10143):** `0x7ae0bbe6747b4571990088d2522bf7da62297c48`

**Primary track:** Consumer Products & Payments

**Sponsor bounties:**

- Best Mera-Powered UX on Monad (Monad Foundation). Mera is the whole account layer.
- **TODO, pick one if built:** Best workflow with CRE (Chainlink) for automatic move-legality arbitration, or Best Use of Envio for the lobby and leaderboard.

**Logo:** `public/brand/logo-mark.png` (1024×1024, transparent) and `public/brand/logo-wide.png` (1600×480). Share image: `public/og.png`.

### Description

DegenChess is staked chess for people who have never used crypto.

Two players put up the same dollar stake. Every piece is worth a fixed share of it: a pawn is 1/39, a queen is 9/39. When you capture a piece, its value moves from your opponent's balance to yours, on-chain, in under a second. The winner takes the pot, but the loser keeps whatever they captured, so every move matters and a lost game is not a total loss.

There is no wallet to install and no seed phrase. You tap "Play now", confirm with Face ID or a fingerprint, and you're in a game about five seconds later. Your passkey creates two keys:

- a **money key** that holds your funds and asks for your passkey every time money moves (staking, resigning, withdrawing);
- a **game key** that can only make chess moves in games you registered it for. The contract enforces that it can never touch money. It lives in the browser tab, so playing needs no prompts at all.

Nothing secret is stored. Clear your browser or pick up another device mid-game and one passkey tap brings back your account and your game.

The game is played in a full-screen 3D arena: Bulls against Bears. The pieces are animated characters that walk to their squares and fight on captures, and coins fly from the fallen piece to the capturer while a tug-of-war bar shows how the pot is splitting.

Monad is what makes this playable. Each move is a transaction; at about 0.8 seconds to confirm, with a tiny gas fee, on-chain chess feels like chess.

### Who it's for and how we reach them

**First users:** online chess players who already bet informally (side bets in clubs, Discord servers and streams), and crypto-native players who want a skill game with stakes rather than a slot machine.

**Go-to-market:**

1. **Chess streamers and clubs.** A staked game with money visibly flying on every capture is watchable. Sponsor small stakes for streamer matches and club nights; every viewer gets a "play the streamer's opening for $1" link.
2. **Share links as the growth loop.** A game is a URL. Creating one produces a link that opens straight into the 3D board with a "Join for $1" button and one-tap sign-up, so every challenge sent to a friend is an acquisition.
3. **Crypto communities.** Bulls vs Bears is a ready-made rivalry: weekly community-vs-community matches with a leaderboard.
4. **Low-stakes default.** $1 games keep the first experience safe and make "try it once" an easy ask.

**Why they stay:** stakes that move during the game make even a losing position worth playing out, and a rematch is one tap.

**Beyond chess:** the account layer (one passkey, a scoped game key, stakes that shift during play) is game-agnostic. DegenChess is the first title in a planned "Degen Yard" of staked skill games.

### Progress update (shareable now, for mentor support)

> **DegenChess, status 1 October.** Live on Monad testnet at degen-chess.vercel.app.
>
> **Working end to end:** passkey sign-up with Mera (one prompt, about 5 seconds to the first confirmed transaction), staked games with on-chain moves, capture payouts, resign / draw / timeout / cancel, withdrawals, and a full-screen 3D arena with 12 original animated characters. An automated two-player browser test runs the whole flow against production, including wiping a player's storage mid-game and restoring from the passkey.
>
> **Built since the hackathon started:** a new contract (the earlier prototype's payout maths locked funds), per-game keys so moves need no prompts, the Mera account layer, the faucet, the 3D arena and the redesign.
>
> **Where we'd value help:**
>
> 1. Move legality isn't enforced on-chain. A modified client can submit an illegal capture, and today only the contract owner can reverse it. Is a Chainlink CRE workflow that validates moves and arbitrates the right fix for a hackathon, or should we validate on-chain?
> 2. Mera: anything we should do for session scoping or recovery beyond a contract-scoped game key and a 30-minute idle lock?
> 3. Monad's reserve-balance rule cost us a day. Is there a recommended gas-sponsorship pattern for brand-new accounts instead of a faucet?
>
> **Next:** legality enforcement, a security review (in progress with an independent auditor), leaderboard, demo videos.

---

## Videos

Record at 1080p. Use the production site for everything except the arena close-ups, where `/arena` (the chain-free sandbox with "Play demo game") gives clean footage. Judges must be able to open the links: upload as unlisted YouTube or Loom and test them in a private window.

### Technical demo (3 minutes)

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Landing page, arena circling | "DegenChess is staked chess on Monad. Every capture moves money. I'll show the whole thing live on testnet." |
| 0:15 | Phone or second browser: tap Play now, passkey prompt, "You're in" banner with the timer | "One passkey prompt. No extension, no seed phrase. That banner is the measured time to my first confirmed transaction." |
| 0:40 | Create a $1 game, passkey prompt; second player opens the link and joins | "Staking asks for the passkey. Mera derives two keys from it: a money key, and a game key the contract only lets make chess moves." |
| 1:05 | Play several moves quickly, no prompts | "Moves are signed by the game key in memory. No prompts, about 0.8 seconds each, and each one is a real transaction." Show one on the explorer. |
| 1:30 | A capture: strike, coins, stake bar shifting | "That pawn was worth one thirty-ninth of the stake. It just moved on-chain. The bar is the live split of the pot." |
| 1:50 | Clear site data mid-game, reload, tap "I have a passkey" | "The stateless test. Nothing secret is stored. One prompt rebuilds my account and my game key, and the game is exactly where I left it." |
| 2:15 | Lock button; then resign with a passkey prompt; withdraw | "Lock wipes the game key. Anything that settles money needs the passkey again. The loser still withdraws what they captured." |
| 2:40 | Code: `_playerFor` and the game-key checks in the contract; the test output | "The scoping is enforced by the contract, not the UI. 17 contract tests, plus a two-player browser test that runs against production." |
| 2:55 | Back to the arena | "Live now at degen-chess.vercel.app." |

### Pitch (2 minutes)

| Time | Say |
| --- | --- |
| 0:00 | "Hundreds of millions of people play chess online. Plenty of them bet on it: side bets in clubs, in Discords, on streams. None of that is built into the game, and none of it is safe." |
| 0:20 | "Crypto could fix that, but crypto games ask you to install a wallet, save a seed phrase and approve a pop-up for every action. Nobody plays chess like that." |
| 0:40 | "DegenChess is chess where every capture pays. Both players stake a dollar. Every piece is worth a share of it. Take a piece and its value is yours immediately. Lose the game and you still keep what you captured." (Show a capture.) |
| 1:05 | "You start with one tap: Face ID, and you're playing in five seconds. Your passkey is your account. Moves need no confirmation at all, and anything involving money asks for your face again." |
| 1:25 | "This only works on Monad. Every move is a transaction, confirmed in under a second for a tiny fee." |
| 1:40 | "We start with chess players who already bet, through streamers and share links: every game is a link that opens straight onto the board. Chess is the first game. The same account and staking layer works for any skill game. That's Degen Yard." |
| 1:55 | "DegenChess. Play it now on Monad testnet." |

### Advert (30 seconds)

No voice-over; music and on-screen text.

| Time | Picture | Text |
| --- | --- | --- |
| 0:00 | Arena circling, Bulls and Bears facing off | "Bulls vs Bears." |
| 0:05 | A Bull charges and strikes; sparks | "Every capture..." |
| 0:09 | Coins fly, "+$0.26" label, stake bar swings | "...pays." |
| 0:14 | Phone: tap Play now, Face ID, board appears | "One tap. No wallet." |
| 0:20 | Fast cuts of three captures | "Real stakes. Settled in under a second." |
| 0:26 | Logo | "DegenChess. Play now on Monad." |

---

## Before submission: what would make this stronger

In priority order.

1. **Close the illegal-move gap.** It is the one thing a technical judge will find. Either validate moves on-chain or add the automatic arbiter. (Also unlocks the Chainlink bounty.)
2. **Security review.** Brief is in `docs/AUDIT.md`. Fix what comes back and say so in the submission.
3. **Leaderboard and game history.** Gives judges something to browse and supports the growth story. (Unlocks the Envio bounty.)
4. **Real-phone pass** on the redesigned UI, on at least one iPhone and one Android.
5. **Faucet hardening and funding.** Keep the faucet wallet at 30+ MON through judging; add a simple per-IP limit.
6. **Rematch button** at the end of a game.
7. **Record the three videos** by 12 October, leaving a day for retakes.
