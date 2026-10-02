# DegenChess: submission pack

Draft answers for every field on the submission form, plus the three video scripts. Items marked **TODO** aren't done yet.

Deadline: 14 October 2026, 04:59 GMT+1.

---

## Form fields

**Project name:** DegenChess

**One-line description:** Chess where every capture pays: stake dollars, take a piece, take its value, with one passkey tap and no wallet.

**Repo URL:** <https://github.com/victor-onoja/degenChess>

**Live link (Monad testnet):** <https://degen-chess.vercel.app>

**Contract (Monad testnet, chain 10143):** `0x75e210a916fd5acd3bde6e065039cfac19fab2ac`

**Primary track:** Consumer Products & Payments

**Sponsor bounties:**

- Best Mera-Powered UX on Monad (Monad Foundation). Mera is the whole account layer.
- Best workflow with CRE (Chainlink). A CRE workflow is the game's referee: it fires on every move, replays the game and settles it on-chain. See `cre/README.md`.

**Logo:** `public/brand/logo-mark.png` (1024×1024, transparent) and `public/brand/logo-wide.png` (1600×480). Share image: `public/og.png`. Video title card: `public/brand/title-card.png`. Story poster: `public/brand/poster.png`.

### Description

DegenChess is staked chess for people who have never used crypto.

Two players put up the same dollar stake. Every piece is worth a fixed share of it: a pawn is 1/39, a queen is 9/39. When you capture a piece, its value moves from your opponent's balance to yours, on-chain, in under a second. The winner takes the pot, but the loser keeps whatever they captured, so every move matters and a lost game is not a total loss.

There is no wallet to install and no seed phrase. You tap "Play now", confirm with Face ID or a fingerprint, and you're in a game about five seconds later. Your passkey creates two keys:

- a **money key** that holds your funds and asks for your passkey every time money moves (staking, resigning, withdrawing);
- a **game key** that can only make chess moves in games you registered it for. The contract enforces that it can never touch money. It lives in the browser tab, so playing needs no prompts at all.

Nothing secret is stored. Clear your browser or pick up another device mid-game and one passkey tap brings back your account and your game.

The game is played on a full-screen 3D board where the pieces are alive. They are recognisable chess pieces, bone white against obsidian black, but each has eyes that follow the play and a glowing gold core sized to its share of the stake. Pieces hop to their squares, an attacked piece trembles, a capture tears the victim's core out and sends it into the capturer with the amount on it, and a bar shows how the pot is splitting. The lobby, the Yard, shows every open and live game as a small board with its real position, and anyone can sit down or watch. You can play in 3D, in 2D, or with both side by side; spectators always watch in 3D.

Games have real chess clocks (3+2, 5+3, 10+5), players have usernames, and a rematch is one tap.

Nobody has to be trusted to call the result. A Chainlink CRE workflow acts as referee: it replays every game, pays out checkmates and rule draws automatically, and forfeits anyone who submits an illegal move.

Monad is what makes this playable. Each move is a transaction; at about 0.8 seconds to confirm, with a tiny gas fee, on-chain chess feels like chess.

### Who it's for and how we reach them

**First users:** online chess players who already bet informally (side bets in clubs, Discord servers and streams), and crypto-native players who want a skill game with stakes rather than a slot machine.

**Go-to-market:**

1. **Chess streamers and clubs.** A staked game with money visibly flying on every capture is watchable. Sponsor small stakes for streamer matches and club nights; every viewer gets a "play the streamer's opening for $1" link.
2. **Share links as the growth loop.** A game is a URL. Creating one produces a link that opens straight into the 3D board with a "Join for $1" button and one-tap sign-up, so every challenge sent to a friend is an acquisition.
3. **Crypto communities.** Weekly community-vs-community matches with a leaderboard, watched live from the Yard.
4. **Low-stakes default.** $1 games keep the first experience safe and make "try it once" an easy ask.

**Why they stay:** stakes that move during the game make even a losing position worth playing out, and a rematch is one tap.

**Beyond chess:** the account layer (one passkey, a scoped game key, stakes that shift during play) is game-agnostic. DegenChess is the first title in a planned "Degen Yard" of staked skill games.

### Progress update (shareable now, for mentor support)

> **DegenChess, status 2 October.** Live on Monad testnet at degen-chess.vercel.app.
>
> **Working end to end:** passkey sign-up with Mera (one prompt, about 5 seconds to the first confirmed transaction), staked games with on-chain moves and capture payouts, chess clocks, usernames, rematch, withdrawals, and a 3D arena you can also play in 2D or side by side. A Chainlink CRE workflow referees every game: on testnet it has settled a checkmate, a stalemate and an illegal move (the cheater forfeited everything). An automated two-player browser test runs the whole flow, including wiping a player's storage mid-game and restoring from the passkey.
>
> **Built since the hackathon started:** a new contract (the earlier prototype's payout maths locked funds), per-game keys so moves need no prompts, the Mera account layer, the faucet, the referee workflow and its consumer contract, clocks, usernames, the 3D arena and the redesign.
>
> **Where we'd value help:**
>
> 1. Chainlink CRE: the referee runs through `cre workflow simulate --broadcast` while our deployment-access request is pending. Can access be granted before the deadline so it runs on a DON with the production forwarder?
> 2. Mera: anything we should do for session scoping or recovery beyond a contract-scoped game key and a 30-minute idle lock?
> 3. Monad's reserve-balance rule cost us a day. Is there a recommended gas-sponsorship pattern for brand-new accounts instead of a faucet?
>
> **Next:** a security review (brief sent to an independent auditor), leaderboard, demo videos.

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
| 1:30 | A capture: the piece shatters, coins fly, the stake bar shifts | "That pawn was worth one thirty-ninth of the stake. It just moved on-chain. The bar is the live split of the pot." |
| 1:50 | Clear site data mid-game, reload, tap "I have a passkey" | "The stateless test. Nothing secret is stored. One prompt rebuilds my account and my game key, and the game is exactly where I left it." |
| 2:15 | Lock button; then resign with a passkey prompt; withdraw | "Lock wipes the game key. Anything that settles money needs the passkey again. The loser still withdraws what they captured." |
| 2:40 | Code: `_playerFor` and the game-key checks in the contract; the test output | "The scoping is enforced by the contract, not the UI. 27 contract tests, plus a two-player browser test that runs against production." |
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
| 0:00 | Board circling, the pieces watching each other | "Every piece has skin in the game." |
| 0:05 | A piece hops in and strikes; the victim shatters | "Every capture..." |
| 0:09 | The gold core flies to the capturer, "+$0.26" label, stake bar swings | "...pays." |
| 0:14 | Phone: tap Play now, Face ID, board appears | "One tap. No wallet." |
| 0:20 | Fast cuts of three captures | "Real stakes. Settled in under a second." |
| 0:26 | Logo | "DegenChess. Play now on Monad." |

---

## Before submission: what would make this stronger

In priority order.

1. **Get the referee onto a Chainlink DON.** Deployment access is requested. Until it is granted, keep `npm run referee` running on a server through judging.
2. **Security review.** Brief is in `docs/AUDIT.md`. Fix what comes back and say so in the submission.
3. **Leaderboard and game history.** Gives judges something to browse and supports the growth story.
4. **Real-phone pass** on the new board and landing page, on at least one iPhone and one Android.
5. **Faucet hardening and funding.** Keep the faucet wallet at 30+ MON through judging; add a simple per-IP limit.
6. **Record the three videos** by 12 October, leaving a day for retakes. `public/brand/title-card.png` opens them.

Done since the first draft of this list: the illegal-move gap (Chainlink referee), rematch, clocks, usernames.
