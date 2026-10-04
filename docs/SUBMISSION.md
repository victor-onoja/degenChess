# DegenChess: submission pack

Answers for every field on the submission form, the evidence judges can check, the three video scripts, and what is left before the deadline.

Deadline: 14 October 2026, 04:59 GMT+1. Status as of 3 October 2026.

> **Name.** A rebrand to **Purple Chess** is under consideration (Monad's purple, and the board is already violet). Decide before recording the videos. `purplechess.com` is registered and parked (an aftermarket purchase); `purplechess.gg`, `.xyz`, `.io` and `playpurplechess.com` were unregistered on 3 October. Passkeys are bound to the domain, so a domain move must happen before the public launch (see the README).

---

## Form fields

**Project name:** DegenChess

**One-line description:** Chess where every piece carries a share of your stake: take a piece and its value is yours, settled on Monad in under a second, with one passkey tap and no wallet.

**Repo:** <https://github.com/victor-onoja/degenChess>

**Live app (Monad testnet):** <https://degen-chess.vercel.app>

**Contracts (Monad testnet, chain 10143):**

| Contract | Address |
| --- | --- |
| DegenChess (games and stakes) | `0x17c898b9814323a5bd364c77b6a41b341cdbda51` |
| ChessReferee (Chainlink CRE consumer) | `0x2a54f9443c84c472488020c878797a2fead78cdf` |
| PlayerNames (usernames) | `0xaf87e4ad92ea3cae05f8696f534d43b19a40a5e6` |
| tUSD (test dollar) | `0xfbf011ba1f7d08651181b5eebabb7048596de9de` |

**Primary track:** Consumer Products & Payments

**Sponsor bounties:**

- **Best Mera-Powered UX on Monad.** Mera is the whole account layer: one passkey, no wallet, a money key that always asks and a game key that never does.
- **Best workflow with CRE (Chainlink).** A CRE workflow is the game's referee: it fires on every move, replays the game with a chess engine and settles checkmates, rule draws and illegal moves on-chain.

**Images:** logo `public/brand/logo-mark.png` (1024×1024) and `public/brand/logo-wide.png` (1600×480); share image `public/og.png`; video title card `public/brand/title-card.png`; story poster `public/brand/poster.png`. All rendered from the live app by `tools/brand/render.mjs`.

### Description

DegenChess is staked chess for people who have never used crypto.

Two players put up the same stake. Every piece is worth a fixed share of it: a pawn 1/39, a knight or bishop 3/39, a rook 5/39, a queen 9/39. Capture a piece and its value moves from your opponent's balance to yours, on-chain, in under a second. The winner takes the pot, but the loser keeps whatever they captured, so every move matters and a lost game is not a total loss. A won game pays a 2.5% fee; draws are free.

There is no wallet to install and no seed phrase. You tap "Play now", confirm with Face ID or a fingerprint, and you're ready about five seconds later. Your passkey creates two keys:

- a **money key** that holds your funds and asks for your passkey every time money moves (staking, resigning, withdrawing, sending);
- a **game key** that can only make chess moves in games you registered it for. The contract enforces that it can never touch money, so playing needs no prompts at all.

Nothing secret is stored. Clear your browser or pick up another device mid-game and one passkey tap brings back your account and your game.

You play on a clean 2D board (tap or drag; the default on phones), in 3D (the default on bigger screens and for spectators), or both side by side, and a focus mode shows nothing but the board. In 3D the pieces are two armies of animated characters, Heroes against the Undead, every piece type its own character (ranger and engineer pawns, a druid queen, giant barbarian rooks; a necromancer king, a scythe-wielding queen, skeleton golem rooks), on a violet board floating among other boards drifting in the void: the same game in other dimensions. They walk to their squares to the sound of their footsteps, each strikes in its own way on a capture, the taken piece falls while its share of the stake flies to the attacker as a gold gem with the amount on it, the Undead rise from the board at the start, and the winners cheer a checkmate. The armies speak at the big moments ("For the crown!", "Your gold is mine.", "Checkmate. Rest forever.") over a shuffled soundtrack of public-domain orchestra and Asian and African instruments. A classic sculpted Staunton set is one tap away.

The lobby, the Yard, shows every open, live and finished game as a small board at its real position; anyone can sit down or watch. Games have chess clocks (3+2, 5+3, 10+5), you choose White, Black or a coin flip, every move can be replayed, and a rematch is one tap with colours swapped. Players are known by unique usernames, never addresses; they can pay each other by username, and every link they share carries their name, so whoever invited a player earns part of the fee on that player's games.

Nobody has to be trusted to call the result. A Chainlink CRE workflow replays every game, pays out checkmates and rule draws automatically, and forfeits anyone who submits an illegal move, including what the illegal move captured.

Monad is what makes this playable. Each move is a transaction; at about 0.8 seconds to confirm with a tiny gas fee, on-chain chess feels like chess.

### Who it's for and how we reach them

**First users:** online chess players who already bet informally (side bets in clubs, Discord servers and streams), and crypto-native players who want a skill game with stakes rather than a slot machine.

**Go-to-market:**

1. **Share links as the growth loop.** A game is a URL that opens straight onto the board with one-tap sign-up. Every board in the Yard has a share button, a new game leads with *Share invite link*, finished games share with a ready-made line ("alice beat bob for $10 on DegenChess. See how."), and every link pays its sender a share of the fee on the games of the people who join through it.
2. **Chess streamers and clubs.** Money visibly changing hands on every capture is watchable. Sponsor small stakes for streamer matches and club nights; viewers get a "play the streamer for $1" link.
3. **Crypto communities.** Community-against-community matches, watched live from the Yard.
4. **Low stakes by default.** $1 games make "try it once" an easy ask.

**Business model:** 2.5% of the pot when a game is won; draws are free. 20% of each player's half of the fee goes to whoever invited them.

**Why they stay:** stakes that move during the game make a losing position worth playing out; rematches are one tap; the armies make every game a small show.

**Beyond chess:** the account layer (one passkey, a scoped game key, stakes that shift during play) is game-agnostic. DegenChess is the first title of a planned "Degen Yard" of staked skill games.

---

## Evidence for judges

### Mera (passkey accounts)

| Criterion | Where to see it |
| --- | --- |
| Time to first transaction | The "You're in" banner after sign-up shows the measured time: about 3 to 6 seconds on testnet. |
| One prompt to start | Sign-up is one passkey ceremony; the username and invite are claimed in the same session. |
| Session design | Money key re-prompts for every money action; game key is prompt-free and contract-scoped (`_playerFor`, and `resign`/`cancel`/`withdraw` reject it). Lock, tab close, reload or 30 idle minutes wipe it. |
| Stateless test | Clear site data mid-game, reload, tap "I have a passkey": account and game key are rebuilt, the game continues. Automated in `tools/e2e/passkey-game.mjs`. |
| Code | `src/lib/mera.ts`, `src/lib/account.tsx`, `contracts/DegenChess.sol` (`_setKey`, `_playerFor`). |

### Chainlink CRE (the referee)

| Item | Where |
| --- | --- |
| Workflow | `cre/referee/main.ts` (EVM log trigger on `MoveMade`, reads `getGame`/`getMoves`), verdict logic `cre/referee/judge.ts` with unit tests |
| Consumer contract | `contracts/ChessReferee.sol`: `onReport` → `DegenChess.arbitrate` |
| Checkmate settled automatically | game 0, verdict tx `0x7cc3e603b7ca850600bd94842a48641893e8427a3f10cb076301e85bbfb76825`: White wins, 1.95 / 0 tUSD |
| Illegal move forfeited | game 1: White "teleported" the queen to take Black's queen (tx `0xacfa35cca3578043b1dbdae7c88dbea2e726b6792cac8a239e83d41230cdc24e`); verdict tx `0xd30eae7f681cd4a6361cd0e23f87d28090f0f3e1936194526fa82e9ab41adfe2` forfeited White: 0 / 1.95 tUSD, the stolen queen value included |
| Earlier runs | stalemate and rule draws settled through `cre workflow simulate --broadcast` on previous deployments |
| Running | a Docker service on a server (`deploy/referee`) watches every move. It runs the workflow with the CRE CLI and, until our CRE API key and DON deployment access arrive, delivers the same `judge.ts` verdict through the same forwarder itself |
| Security | our review found Chainlink's simulation forwarder let anyone deliver a verdict; fixed the same day with a reporter allowlist (`docs/AUDIT.md`) |

### Quality

- 32 contract tests (`npm test`), including random legal games cross-checked against chess.js and every settlement path.
- Four browser suites with simulated passkeys: `passkey-game` (sign-up, staking, prompt-free moves, the stateless restore, lock, resign, withdraw, rematch), `core-flows` (cancel and refund, tap-to-move on a phone, promotion, spectating, draw, win on time, move replay, choosing a side), `account-flows` (usernames, invites, sending money by username), `sandbox`.
- Security brief for an independent reviewer: `docs/AUDIT.md`.

---

## Videos

Record at 1080p on the production site. Use `/sandbox` (the practice board: you play both sides, money moves as in a real game, nothing on-chain) for clean 3D close-ups and captures. Upload as unlisted YouTube or Loom and test the links in a private window.

### Technical demo (3 minutes)

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Landing page, the armies playing in the backdrop | "DegenChess is staked chess on Monad. Every capture moves money. Everything here is live on testnet." |
| 0:15 | Phone: type a username, Play now, Face ID, "You're in" banner | "One passkey prompt. No extension, no seed phrase. That banner is the measured time to my first confirmed transaction." |
| 0:35 | Create a $1 game as White, Share invite link; second player opens it and joins | "Staking asks for the passkey. Mera derives two keys: a money key, and a game key the contract only lets make chess moves." |
| 1:00 | Several quick moves, no prompts, one opened on the explorer | "Moves are signed by the game key. No prompts, under a second each, every one a transaction." |
| 1:20 | A capture in 3D: the attack, the gem flying with "+$0.08", the pot bar moving | "That knight was worth three thirty-ninths of the stake. It just moved on-chain." |
| 1:40 | Clear site data, reload, "I have a passkey" | "The stateless test: nothing secret is stored. One prompt rebuilds the account and the game key, and the game is where I left it." |
| 2:00 | Deliver checkmate; the referee settles it with no resignation; show the verdict tx | "Nobody resigned. A Chainlink CRE workflow replayed the game and settled it on-chain. Play an illegal move and it forfeits you, stolen value included." |
| 2:30 | Withdraw (passkey), the wallet: invite link and earnings | "Money out asks for the passkey again. Every link you share earns you part of the fee on your friends' games." |
| 2:45 | Contract scoping code and the test run | "The scoping is enforced by the contract. 32 contract tests and four browser suites." |
| 2:55 | Back to the board | "Live now at degen-chess.vercel.app." |

### Pitch (2 minutes)

| Time | Say |
| --- | --- |
| 0:00 | "Hundreds of millions of people play chess online, and plenty of them bet on it: in clubs, in Discords, on streams. None of that is built into the game, and none of it is safe." |
| 0:20 | "Crypto could fix that, but crypto games ask you to install a wallet, save a seed phrase and approve a pop-up for every move. Nobody plays chess like that." |
| 0:40 | "DegenChess is chess where every piece carries part of your stake. Take a piece and its value is yours, right then. Lose the game and you still keep what you captured." (Show a capture.) |
| 1:00 | "You start with one tap. Face ID, and you're in. Moves never ask for anything; money always asks for your face." |
| 1:15 | "Nobody calls the result: a Chainlink workflow referees every game, and only Monad confirms a move in under a second for a fraction of a cent." |
| 1:30 | "Every game is a link, and every link pays the person who shared it. Chess is the first game; the same account and staking layer works for any skill game. That's Degen Yard." |
| 1:50 | "DegenChess. Play it now on Monad testnet." |

### Advert (30 seconds)

No voice-over: the soundtrack and the armies' own lines.

| Time | Picture | Text |
| --- | --- | --- |
| 0:00 | The Undead rising from the board; the Heroes facing them | "Every piece has skin in the game." |
| 0:05 | A Heroes knight walks in and strikes; the skeleton falls | "Every capture..." |
| 0:09 | The gold gem flies to the attacker, "+$0.26", the pot bar swings | "...pays." |
| 0:14 | Phone: Play now, Face ID, the board | "One tap. No wallet." |
| 0:20 | Fast cuts: a mage casting, a crossbow, "Checkmate. Rest forever." | "Settled in under a second." |
| 0:26 | Logo | "DegenChess. Play now on Monad." |

---

## Before submission

In priority order.

1. **Decide the name and domain** (by 8 October), so the videos, logo and links are final. If the domain changes, move the app and passkeys before the launch.
2. **Record the three videos** (by 12 October, leaving a day for retakes).
3. **Real-phone pass** on one iPhone and one Android: sign-up, a full game in 2D and 3D, focus mode, sound, dragging, sharing.
4. **Chainlink:** add the CRE API key on the server as soon as one can be created, and deploy to a DON if access is granted; until then the evidence above stands.
5. **Faucet:** a per-IP limit, and keep the faucet wallet at 30+ MON through judging; keep the referee wallet funded.
6. **Seed the Yard:** have a few live and finished games on the board when judging starts, so it never looks empty.
7. **Security review:** fold in what the independent reviewer finds and say so here.
8. **Optional:** a leaderboard and player profiles.
