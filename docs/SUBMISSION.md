# Away Chess: submission pack

Answers for every field on the submission form, the evidence judges can check, the three video scripts, and what is left before the deadline.

Deadline: **13 October 2026, 11:59 PM ET** (14 October, 04:59 GMT+1). A submission can be edited until then; the version at the deadline is the one judged. Status as of 11 October 2026: feature-complete, contracts reviewed and redeployed, hands-on pass done by the author, automated regression green, submission being filed.

> **Name and address.** The product is **Away Chess** (renamed from the working title DegenChess on 5 October 2026). Testnet lives at `test.awaychess.com`; mainnet will live at `awaychess.com`. The game contract keeps the name `DegenChess` on-chain and the repo keeps its old name. Passkeys are bound to the address, so accounts and usernames started fresh on `test.awaychess.com`; the earlier `degen-chess.vercel.app` still serves the same app.

---

## Rules checklist (Metropolis Hackathon terms, version 3.0)

| Requirement (section) | Where it is met |
| --- | --- |
| Public GitHub repo with complete source (4.1.1) | <https://github.com/victor-onoja/degenChess>, public, branch `master` |
| README with setup instructions (4.1.1, 4.1.5) | `README.md`: "Run locally", "Tests", "Deploy to Monad testnet" |
| Open source licence (4.1.1, 7.2) | MIT, `LICENSE` |
| Attribution of external code and assets (4.1.1, 7.3) | `README.md` "Credits and licences"; in the app at `/credits` |
| Commit history covering the build window (4.1.1) | 60+ commits from 27 September to 13 October 2026 |
| Demo video, at most 3 minutes, public, product in operation, Monad interactions shown (4.1.2, 9.4) | the "Technical demo" script below: **to record and link here** |
| Monad integration explained, contract addresses, deployed on testnet (4.1.3, 9.2) | "Contracts" and "Evidence for judges" below; `README.md` "Why Monad" |
| Majority of the work built in the window; pre-existing work identified (4.1.4) | `README.md` "Hackathon notes": a 20-file 2024 prototype existed; none of its code is in use |
| AI coding tools disclosed (4.1.4) | `README.md` "Hackathon notes": built with Claude Code; voices generated with Kokoro-82M |
| Description, architecture, stack, setup (4.1.5) | `README.md`: opening, "Architecture in one page", "Project layout", "Run locally" |
| One project, one track (2.5, 3.3) | Track 02, Consumer Products & Payments |
| No secrets or personal data in the submission (5.3) | checked on 11 October: no keys or tokens in the tree or its history; `.env.local` is ignored |
| Working prototype a third party can run (9.1) | live at `test.awaychess.com`; runs locally from the README |
| No token (9.3) | none; stakes are in a test dollar (tUSD) |

**How it answers the judging criteria (20% each).**

- **Product quality and completeness:** a finished loop a stranger can use: sign up in one tap, stake, play, get paid, rematch, share, tournaments, a leaderboard, a practice board, feedback. Seven browser suites and a hands-on script check it end to end.
- **Technical excellence:** moves, captures, clocks and payouts live in the contract (40 tests, including random games cross-checked against chess.js); a Chainlink CRE workflow referees; an independent review was acted on and written up in `docs/AUDIT.md`.
- **Monad integration:** every move is a transaction (median 0.8 s to receipt, about 0.007 MON), signed by a prompt-free session key; the code handles Monad specifics (gas billed on the limit, the reserve-balance rule, lagged balance checks).
- **Track fit:** a consumer product whose user need not know crypto: no wallet, no seed phrase, usernames instead of addresses, dollars instead of tokens. The core value is a money experience: your stake is in play on every capture.
- **Innovation and impact:** captures that pay, with a loser who keeps what they took; one passkey split into a money key and a contract-scoped game key; a referee nobody runs by hand.

---

## Form fields

**Project name:** Away Chess

**One-line description:** Chess where every piece carries a share of your stake: take a piece and its value is yours, settled on Monad in under a second, with one passkey tap and no wallet.

**Repo:** <https://github.com/victor-onoja/degenChess>

**Live app (Monad testnet):** <https://test.awaychess.com>

**Contracts (Monad testnet, chain 10143):**

| Contract | Address |
| --- | --- |
| Away Chess (games and stakes) | `0x2e44f61ea3616a1b1ff5393ddccdb2fac58b2f00` |
| ChessReferee (Chainlink CRE consumer) | `0xba90386c49ebdbe1f4ae572e5081421a909f8617` |
| PlayerNames (usernames) | `0xeeff1b2601b45472ea746527e9482a882a36f114` |
| Tournaments (round-robin leagues, optional prize pot) | `0x5b311b1e143f44404077e4521279148b4a2e8cfa` |
| tUSD (test dollar) | `0xfbf011ba1f7d08651181b5eebabb7048596de9de` |

**Primary track:** Consumer Products & Payments

**Sponsor bounties:**

- **Best Mera-Powered UX on Monad.** Mera is the whole account layer: one passkey, no wallet, a money key that always asks and a game key that never does.
- **Best workflow with CRE (Chainlink).** A CRE workflow is the game's referee: it fires on every move, replays the game with a chess engine and settles checkmates, rule draws and illegal moves on-chain.

**Images:** logo `public/brand/logo-mark.png` (1024×1024) and `public/brand/logo-wide.png` (1600×480); share image `public/og.png`; video title card `public/brand/title-card.png`; story poster `public/brand/poster.png`. All rendered from the live app by `tools/brand/render.mjs`.

### Description

Away Chess is staked chess for people who have never used crypto.

Two players put up the same stake. Every piece is worth a fixed share of it: a pawn 1/39, a knight or bishop 3/39, a rook 5/39, a queen 9/39. Capture a piece and its value moves from your opponent's balance to yours, on-chain, in under a second. The winner takes the pot, but the loser keeps whatever they captured, so every move matters and a lost game is not a total loss. A won game pays a 2.5% fee; draws are free.

There is no wallet to install and no seed phrase. You tap "Play now", confirm with Face ID or a fingerprint, and you're ready about five seconds later. Your passkey creates two keys:

- a **money key** that holds your funds and asks for your passkey every time money moves (staking, resigning, withdrawing, sending);
- a **game key** that can only make chess moves in games you registered it for. The contract enforces that it can never touch money, so playing needs no prompts at all.

Nothing secret is stored. Clear your browser or pick up another device mid-game and one passkey tap brings back your account and your game.

You play on a clean 2D board (tap or drag; the default on phones), in 3D (the default on bigger screens and for spectators), or both side by side, and a focus mode shows nothing but the board. In 3D the pieces are two armies of animated characters, Heroes against the Undead, every piece type its own character (ranger and engineer pawns, a druid queen, giant barbarian rooks; a necromancer king, a scythe-wielding queen, skeleton golem rooks), on a violet board floating among other boards drifting in the void: the same game in other dimensions. They walk to their squares to the sound of their footsteps, each strikes in its own way on a capture, the taken piece falls while its share of the stake flies to the attacker as a gold gem with the amount on it, the Undead rise from the board at the start, and the winners cheer a checkmate. The armies speak at the big moments ("For the crown!", "Your gold is mine.", "Checkmate. Rest forever.") over a shuffled soundtrack of public-domain orchestra and Asian and African instruments. A classic sculpted Staunton set is one tap away.

The lobby, the Yard, shows every open, live and finished game as a small board at its real position; anyone can sit down or watch. Games have chess clocks (3+2, 5+3, 10+5), you choose White, Black or a coin flip, every move can be replayed, and a rematch is one tap with colours swapped. A permanent leaderboard, kept on-chain, ranks players by what they have won. Anyone can start a round-robin tournament and invite players with a link, choosing whether it has a prize pot (an entry fee from each player, paid out by points to the winner or the top three, with no cut taken), and every live game shows how many people are watching. Players are known by unique usernames, never addresses; they can pay each other by username, and every link they share carries their name, so whoever invited a player earns part of the fee on that player's games.

Nobody has to be trusted to call the result. A Chainlink CRE workflow replays every game, pays out checkmates and rule draws automatically, and forfeits anyone who submits an illegal move, including what the illegal move captured.

Monad is what makes this playable. Each move is a transaction; at about 0.8 seconds to confirm with a tiny gas fee, on-chain chess feels like chess.

### Who it's for and how we reach them

**First users:** online chess players who already bet informally (side bets in clubs, Discord servers and streams), and crypto-native players who want a skill game with stakes rather than a slot machine.

**Go-to-market:**

1. **Share links as the growth loop.** A game is a URL that opens straight onto the board with one-tap sign-up. Every board in the Yard has a share button, a new game leads with *Share invite link*, finished games share with a ready-made line ("alice beat bob for $10 on Away Chess. See how."), and every link pays its sender a share of the fee on the games of the people who join through it.
2. **Chess streamers and clubs.** Money visibly changing hands on every capture is watchable. Sponsor small stakes for streamer matches and club nights; viewers get a "play the streamer for $1" link.
3. **Tournaments and communities.** Anyone can start a league in a minute and share its link: a club night, a Discord's weekly cup, community against community, watched live from the Yard with the audience count on show.
4. **Low stakes by default.** $1 games make "try it once" an easy ask.

**Business model:** 2.5% of the pot when a game is won; draws are free. 20% of each player's half of the fee goes to whoever invited them.

**Why they stay:** stakes that move during the game make a losing position worth playing out; rematches are one tap; the armies make every game a small show.

**Beyond chess:** the account layer (one passkey, a scoped game key, stakes that shift during play) is game-agnostic. Away Chess is the first of a planned family of staked skill games.

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
| Checkmate settled automatically | game 0, verdict tx `0x4cc67cfdf2b0ca06e5bc979a8d74d29d8f94b6ab0060b676535c5019175567e0`: White wins, 1.95 / 0 tUSD |
| Illegal move forfeited | game 1: White "teleported" the queen to take Black's queen (tx `0x59fe9580c7b9a0d3bb481efbb89eace6b479d7dfb2c32bd76beec89216751383`); verdict tx `0x524e5e611ad8bb5a14810b47396bfcb2afcfc7cec4c76f7c5357b65112913a1c` forfeited White: 0 / 1.95 tUSD |
| Stalemate settled as a draw | game 2 (Sam Loyd's ten-move stalemate), verdict tx `0xa48944409db882101ff134bc90536efd832f4d2cfb493ea69403056433249eca`: no fee, each side keeps its balance (1.2564 / 0.7436 tUSD) |
| Earlier runs | rule draws settled through `cre workflow simulate --broadcast` on previous deployments |
| Running | a Docker service on a server (`deploy/referee`) watches every move. It runs the workflow with the CRE CLI and, until our CRE API key and DON deployment access arrive, delivers the same `judge.ts` verdict through the same forwarder itself |
| Security | our review found Chainlink's simulation forwarder let anyone deliver a verdict; fixed the same day with a reporter allowlist (`docs/AUDIT.md`) |

### Quality

- 40 contract tests (`npm test`), including random legal games cross-checked against chess.js and every settlement path.
- Seven browser suites with simulated passkeys: `passkey-game` (sign-up, staking, prompt-free moves, the stateless restore, lock, resign, withdraw, rematch), `core-flows` (cancel and refund, tap-to-move on a phone, promotion, spectating, draw, win on time, move replay, choosing a side), `account-flows` (usernames, invites, sending money by username), `community` (a prize-pot tournament from creation to payout and through the Open / Running / Finished lists, the audience count, the leaderboard, the feedback form), `sandbox`, `voices` (voices never overlap; the music dips under them). Every suite fails on any page error.
- Run against the live site and Monad on 5 October 2026 (`APP_URL=https://test.awaychess.com REFEREE=1 node tools/e2e/passkey-game.mjs`): 5.9 s from sign-up to the first transaction, prompt-free moves, the stateless restore, a checkmate settled by the always-on referee, withdrawal and rematch.
- A hands-on test script covering every feature, with the moves to play and the amounts to expect: `docs/TEST-PLAN.md`. The seventh suite, `test-plan`, walks that script on a phone-sized and a laptop-sized browser (about 145 checks: ten games, a three-player prize tournament, a free one, the wallet, invites, the leaderboard, the sandbox and feedback). Writing it found and fixed a real bug: a creator who chose Black or a coin flip was asked to enable prompt-free moves again after their opponent joined.
- Security brief for an independent reviewer: `docs/AUDIT.md`. An independent review on 9 October 2026 led to three contract changes (a game-key check, re-entry hardening, two-step ownership), each with a test; the brief records what was raised and what was done.

---

## Videos

Record at 1080p on the production site. Use `/sandbox` (the practice board: you play both sides, money moves as in a real game, nothing on-chain) for clean 3D close-ups and captures. Upload as unlisted YouTube or Loom and test the links in a private window.

### Technical demo (3 minutes)

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Landing page, the armies playing in the backdrop | "Away Chess is staked chess on Monad. Every capture moves money. Everything here is live on testnet." |
| 0:15 | Phone: type a username, Play now, Face ID, "You're in" banner | "One passkey prompt. No extension, no seed phrase. That banner is the measured time to my first confirmed transaction." |
| 0:35 | Create a $1 game as White, Share invite link; second player opens it and joins | "Staking asks for the passkey. Mera derives two keys: a money key, and a game key the contract only lets make chess moves." |
| 1:00 | Several quick moves, no prompts, one opened on the explorer | "Moves are signed by the game key. No prompts, under a second each, every one a transaction." |
| 1:20 | A capture in 3D: the attack, the gem flying with "+$0.08", the pot bar moving | "That knight was worth three thirty-ninths of the stake. It just moved on-chain." |
| 1:40 | Clear site data, reload, "I have a passkey" | "The stateless test: nothing secret is stored. One prompt rebuilds the account and the game key, and the game is where I left it." |
| 2:00 | Deliver checkmate; the referee settles it with no resignation; show the verdict tx | "Nobody resigned. A Chainlink CRE workflow replayed the game and settled it on-chain. Play an illegal move and it forfeits you, stolen value included." |
| 2:30 | Withdraw (passkey), the wallet: invite link and earnings | "Money out asks for the passkey again. Every link you share earns you part of the fee on your friends' games." |
| 2:45 | Contract scoping code and the test run | "The scoping is enforced by the contract. 40 contract tests and seven browser suites." |
| 2:55 | Back to the board | "Live now at test.awaychess.com." |

### Pitch (2 minutes)

| Time | Say |
| --- | --- |
| 0:00 | "Hundreds of millions of people play chess online, and plenty of them bet on it: in clubs, in Discords, on streams. None of that is built into the game, and none of it is safe." |
| 0:20 | "Crypto could fix that, but crypto games ask you to install a wallet, save a seed phrase and approve a pop-up for every move. Nobody plays chess like that." |
| 0:40 | "Away Chess is chess where every piece carries part of your stake. Take a piece and its value is yours, right then. Lose the game and you still keep what you captured." (Show a capture.) |
| 1:00 | "You start with one tap. Face ID, and you're in. Moves never ask for anything; money always asks for your face." |
| 1:15 | "Nobody calls the result: a Chainlink workflow referees every game, and only Monad confirms a move in under a second for a fraction of a cent." |
| 1:30 | "Every game is a link, and every link pays the person who shared it. Chess is the first game; the same account and staking layer works for any skill game. Away Chess is the first of them." |
| 1:50 | "Away Chess. Play it now on Monad testnet." |

### Advert (30 seconds)

No voice-over: the soundtrack and the armies' own lines.

| Time | Picture | Text |
| --- | --- | --- |
| 0:00 | The Undead rising from the board; the Heroes facing them | "Every piece has skin in the game." |
| 0:05 | A Heroes knight walks in and strikes; the skeleton falls | "Every capture..." |
| 0:09 | The gold gem flies to the attacker, "+$0.26", the pot bar swings | "...pays." |
| 0:14 | Phone: Play now, Face ID, the board | "One tap. No wallet." |
| 0:20 | Fast cuts: a mage casting, a crossbow, "Checkmate. Rest forever." | "Settled in under a second." |
| 0:26 | Logo | "Away Chess. Play now on Monad." |

---

## Before submission

In priority order.

1. **Done:** the author's hands-on pass with `docs/TEST-PLAN.md` (10 to 11 October); the improvements it suggested are in. Next: send `test.awaychess.com` to friends.
   - **Still to do on the form:** paste the demo video link, and tick that AI tools were used if the form asks.
2. **Record the demo video** (required, at most 3 minutes, public link) and, if time allows, the pitch and the advert.
3. **Real-phone pass** on one iPhone and one Android: sign-up, a full game in 2D and 3D, focus mode, sound, dragging, sharing.
4. **Chainlink:** decided on 5 October: the hackathon entry runs the workflow in simulation, which the rules allow. Deploying to Chainlink's network is a commercial service (quoted at roughly $7,200 a year), to be revisited before mainnet. Add the CRE API key on the server if one can be created, so the always-on referee runs the workflow itself rather than the direct fallback.
5. **Done:** Discord server, feedback webhook and invite link are live.
6. **Faucet:** a per-IP limit, and keep the faucet wallet at 30+ MON through judging; keep the referee wallet funded.
7. **Seed the Yard:** have a few live and finished games on the board when judging starts, so it never looks empty.
8. **Done:** the independent review of 9 October is folded in (`docs/AUDIT.md`).
9. **Optional:** player profiles; knockout tournaments.
