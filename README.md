# Away Chess

> Renamed from the working title **DegenChess** on 5 October 2026. The game contract (`contracts/DegenChess.sol`), browser storage keys, the repo and the first web address keep the old name.

Staked chess on-chain. Both players put up the same dollar stake, and **every capture moves that piece's value from the victim to the capturer**. When the game ends, the winner takes the loser's balance except what the loser earned through their own captures, so a loser who fought well still gets paid.

Tech stack: Next.js, Mera passkey accounts, viem/wagmi, react-chessboard, chess.js, Solidity (Hardhat), on Monad testnet. Stakes are in tUSD, a 6-decimal test dollar standing in for AUSD.

## Game rules

| Piece  | Weight | Value (of one stake) |
| ------ | ------ | -------------------- |
| Pawn   | 1      | 1/39                 |
| Knight | 3      | 3/39                 |
| Bishop | 3      | 3/39                 |
| Rook   | 5      | 5/39                 |
| Queen  | 9      | 9/39                 |

A side's 15 non-king pieces add up to exactly its stake (8 + 6 + 6 + 10 + 9 = 39).

- **Win:** the winner gets the loser's balance minus the loser's capture gains.
- **Draw:** each player keeps their capture-adjusted balance, with no fee.
- **Fee:** 2.5% of the pot when a game is won. **Draws are free.**
- **Invites:** every shared link carries the sharer's name. Your personal invite link is in the wallet, ready to copy or share. A player who signs up through any of your links records you as their referrer (`setReferrer`, once, in the sign-up session), and the referrer earns 20% of that player's half of the fee on every game they finish, withdrawn from the wallet (`withdrawReferralEarnings`).
- **Ending a game:** checkmate and rule draws are settled by the referee. You can also resign, agree a draw, or claim a win when your opponent's move timer runs out.
- **Sides:** the creator picks White, Black or Random (`createGameAs`; a coin flip seats the players when someone joins). A rematch swaps colours.
- **Cancel:** the creator can cancel and get a full refund until someone joins.
- **Game keys:** each player can register a second, prompt-free key for a game. It can move, offer or accept draws and claim timeouts, but never resign, cancel or withdraw. MON sent with `createGame`/`joinGame` is forwarded to it for gas.

### The board: 2D first, 3D for the show

Every game can be played on a flat 2D board, in 3D, or with both side by side. By default you play in 2D on a phone and in 3D on anything bigger, and you watch other people's games in 3D; switch any time, and your choice is remembered (separately for playing and watching). **Focus** (the corner button) hides everything but the board, with only the clocks and an exit button, and leaves by itself when something needs the player. Every move is listed in a scrolling line under the board during play and after; tap one, or step with the arrows, to see the board as it was. Phones open games in 2D, wide screens in split view, and a saved choice wins. The 2D board takes a drag or a tap (tap a piece, then a highlighted square; gold dots mark legal moves and rings mark captures), and promotion is a tap. 

The 3D board (react-three-fiber) floats in a void where other boards drift at their own angles, the same game being played in other dimensions. The pieces are a sculpted Staunton set (Poly Haven's CC0 "Chess Set" by Riley Queen, trimmed to about 450 KB by `tools/build-chess-set.py`) in polished bone and obsidian on a violet board. Every piece is alive: it breathes, turns towards the play, trembles when it is attacked, and carries a glowing gold core sized to its share of the stake.

Motion is designed for the game: a piece hops to its square with squash and stretch, a capture lands on the victim, which shatters while its core flies into the piece that took it, labelled with the amount, a king in check flashes, and a mated king falls over. A HUD floats over the board with both clocks and a live tug-of-war bar showing how the pot is split. Sound is synthesized in the browser.

**The armies.** By default the 3D pieces are two armies of animated characters, every piece type its own character, from Kay Lousberg's CC0 KayKit packs (Adventurers 2.0 and Skeletons 1.1 with their EXTRA tiers, and Character Animations 1.1), built by `tools/armies/build.mjs` from the unzipped packs in the project root (gitignored).

| Piece | Heroes (White) | Undead (Black) |
| --- | --- | --- |
| Pawn | hooded rogue (dagger), ranger (bow) or engineer (wrench): one set per game | minion (blade, or axe and shield): one set per game |
| Knight | knight, sword and shield | warrior, mace and shield |
| Bishop | mage, staff | skeleton mage, staff |
| Rook | large barbarian, great axe | skeleton golem, great axe |
| Queen | druid, staff | hooded rogue, scythe |
| King | bareheaded knight, two-handed sword | necromancer, crown and staff |

Each character carries its share of the stake as a gold gem over its head and stands on a disc showing its chess piece. They walk to their squares to the sound of their footsteps, running on long moves (a knight leaps), and each strikes in its own way on a capture: daggers stab, bows loose, staffs cast, the scythe spins, the golem slams. The defender raises its guard as the attacker closes and takes the blow on its block; then the taken piece falls and sinks, the Undead claw out of the board when a game starts and taunt after a kill, and the winners leap for joy at checkmate. Characters use one of two 23-bone skeletons (medium, or large for the rooks), so the animations are stored once per skeleton (`rig-medium.glb`, `rig-large.glb`); both armies are about 7 MB, loaded only when the 3D board is shown. A **Classic set** switch in the corner of the 3D board swaps to the Staunton set and is remembered on the device.

### Sound: music and voices

- **Music:** a shuffled soundtrack under every game: public-domain and CC0 orchestra (Wagner's Ride of the Valkyries, Grieg's In the Hall of the Mountain King, Saint-Saëns' Danse macabre, Holst's Mars) mixed with shakuhachi, erhu, guzheng and koto, Japanese festival drums, West African balafon and djembe. Fetched from Wikimedia Commons by `tools/music/fetch.mjs` into `public/music`; it starts on the first tap and plays quietly.
- **Voices:** with the armies, the Heroes and the Undead speak at the moments that matter: a capture, a rook or queen taken (and the other side rallying), check, promotion, castling, checkmate, the start of a game, and your clock under ten seconds. Lines are rate-limited so they stay special. They are generated with Kokoro-82M (Apache-2.0) by `tools/voices/build.mjs` from `tools/voices/lines.json`; the Undead are slowed and lowered at playback.
- The sound button mutes everything. Every recording, model and voice is credited on `/credits`.

### The Yard

The lobby. Start a board (stake and clock) on the left; on the right, every game as a small board at its real position, three at a time (two on phones) under **Waiting**, **Live**, **Finished** and **Yours** (your own finished games). The board is the button: join, watch, resume or review. Every board has a share button in its corner (the phone's share sheet, or the link is copied), a waiting game shows a large *Share invite link*, and live and finished games can be shared from the game screen, each with its own line of text ("alice beat bob for 10 tUSD on Away Chess. See how.").

### Leaderboard, tournaments and the audience

- **Leaderboard** (`/leaderboard`, top five on the landing page): wins, draws, losses and money won (payouts minus stakes, after fees). The game contract keeps every player's record as games finish (`stats`, `getPlayers`), so the table is exact and permanent however many games are played; no server keeps score.
- **Tournaments** (`/tournaments`): round-robin leagues of ordinary staked games. Anyone creates one (name, stake per game, clock) for free and shares its link; players join; the host starts it; every pair plays once, with a coin flip for colours. Press **Play** to open your next game and your opponent joins it from the tournament page. Standings (1 point a win, ½ a draw) are read from the games themselves; nobody, not even the host, can award a result.
  - **The host chooses how it runs.** With no entry fee the `Tournaments` contract is only a register and holds no money. With an entry fee (1, 5 or 10), every player pays it into a prize pot when joining, and the host picks the prizes (winner takes all, or top three 50/30/20) and how long it runs (1, 3 or 7 days). When every game is played, or the time is up, anyone presses **Pay out the prizes**: the contract reads each result from the game contract and pays the pot by points, ties sharing their places. Nobody takes a cut. Before the start a player can leave, or the host can cancel, and entry fees are refunded.
- **Who's watching:** a live game shows how many people are watching it, to the players and the spectators, and live boards in the Yard show the same number. Each open game page checks in with `/api/watch` every ten seconds; the count lives in the server's memory, so it is a head-count, not a record.

### Practice board

`/sandbox` is a practice board for demos and quick tests: one person plays both sides with the real 2D, 3D and split views, the armies and the money moving exactly as in a staked game (captures, the pot bar, the payout at checkmate), with nothing staked and nothing on-chain. It is not linked from the site and is marked noindex; set `NEXT_PUBLIC_SANDBOX=off` to turn it off.

### Clocks, names and rematch

- **Clocks:** a game can have a chess clock (3+2, 5+3, 10+5) enforced by the contract. The mover is charged for their thinking time, a player out of time can't move, and the opponent claims the win. Games without a clock have 24 hours per move.
- **Usernames:** `PlayerNames` holds unique lowercase names, and the app shows them instead of addresses everywhere a player has one. A name can be claimed during sign-up (in the same passkey prompt), with availability checked as you type; a player who skips it is asked for one right after sign-up and in the header ("Choose a username"). Tap your name to change it.
- **Wallet:** tap your balance for *Your money*: your account address with a QR code and copy button for deposits on Monad, and *Send*, which pays any player by username or any address (one passkey prompt). On mainnet this is where a card on-ramp goes.
- **Rematch:** recreates the game at the same stake and clock; the opponent is shown the offer.

### Accounts: one passkey, two keys

There is no wallet extension and no seed phrase. [Mera](https://mera.category.xyz) derives two keys from one passkey:

- **Money key**: holds your funds. It only exists for the length of one money action (stake, cancel, resign, withdraw), and each of those asks for your passkey.
- **Game key**: registered with the contract as your game key. It stays in the tab's memory so moves, draw offers and timeout claims need no prompt. The contract never lets it touch money.

Nothing secret is stored. Clear the browser or switch devices mid-game and one passkey prompt rebuilds both keys; the game itself lives on-chain. The game key is wiped when you press Lock, close or reload the tab, or after 30 idle minutes; one passkey tap unlocks it again.

New players get gas (MON) and test dollars from `/api/drip`, a faucet that only sends from its own balance. Set `FAUCET_PRIVATE_KEY` on the server (locally it falls back to the Hardhat account, or `DEPLOYER_PRIVATE_KEY`).

### Trust model

Every move is recorded on-chain, and turn order is enforced. That's also how the two browsers stay in sync, with no backend. The contract keeps the board (one `uint256`, 4 bits per square) so it can do capture accounting itself, including en passant, castling and promotion.

It does **not** check full chess legality in Solidity, because that is too expensive per move. A **Chainlink CRE workflow** is the referee instead ([cre/README.md](cre/README.md)): it fires on every move, replays the game with chess.js, and settles it through the `ChessReferee` contract. Checkmates and rule draws are declared automatically, and an illegal move forfeits the game, capture gains included. The owner can still call `arbitrate` as a fallback, and a stalled game ends on timeout.

Until the workflow runs on a Chainlink DON, its reports arrive through Chainlink's mock forwarder, which checks nothing. `ChessReferee` therefore only accepts a report whose transaction comes from an allowed reporter key (`setReporter`), until a workflow owner is set. The referee runs on a server ([deploy/referee](deploy/referee/README.md)); if the CRE CLI can't run there, it delivers the workflow's own verdict (`judge.ts`) itself, through the same forwarder.

## Project layout

```text
contracts/DegenChess.sol     game contract
contracts/ChessReferee.sol   receives Chainlink CRE verdicts and settles games
cre/                         the referee workflow (Chainlink CRE)
contracts/test/MockUSD.sol   mintable test dollar (tUSD) for testnet, local dev and tests
test/DegenChess.test.js      contract tests, including random legal games cross-checked against chess.js
scripts/deploy.js            deploy (also deploys MockUSD unless PAYMENT_TOKEN is set)
scripts/export-abi.js        writes src/contracts/abi.ts from the compiled artifact
contracts/PlayerNames.sol    usernames
contracts/Tournaments.sol    round-robin leagues, with an optional prize pot paid out by points
src/deployments.ts           live contract addresses
src/components/              AccountBar, Yard (the lobby), GameView, MiniBoard, PieceIcon
src/components/arena/        the 3D arena, the Staunton set (pieces3d) and the character armies (armies)
public/set/, public/armies/  3D models: the Staunton set and the character armies
src/lib/mera.ts              passkey ceremonies and key derivation
src/lib/account.tsx          account provider: sessions, prompt-free vs re-prompt signing
src/pages/api/drip.ts        testnet faucet
src/lib/                     move encoding/replay, contract hooks
tools/e2e/passkey-game.mjs   two-player browser test with simulated passkeys
tools/e2e/core-flows.mjs     cancel, tap-to-move on a phone, promotion, spectating, draw, win on time
tools/e2e/account-flows.mjs  usernames and the wallet
tools/e2e/sandbox.mjs        the practice board
tools/e2e/community.mjs      tournaments, audience count, leaderboard
tools/e2e/review-shots.mjs   desktop and phone screenshots for design review
tools/referee-watch.mjs      runs the referee for live games (npm run referee)
tools/build-chess-set.py     trims the CC0 Staunton set for the 3D board
tools/armies/build.mjs       builds the character armies from the KayKit packs
tools/voices/                the armies' voice lines (Kokoro) and their generator
tools/music/fetch.mjs        downloads the soundtrack from Wikimedia Commons
deploy/referee/              the referee as a Docker service
tools/brand/render.mjs       renders og.png and public/brand/* from the running app
```

## Run locally

```bash
npm install
npm run chain                 # terminal 1: local Hardhat chain on :8545
npm run deploy:local          # terminal 2: prints the env vars below
```

Copy the printed values into `.env.local`:

```bash
NEXT_PUBLIC_CHAIN=localhost
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_NAMES_ADDRESS=0x...
```

Then run `npm run build && npm start` and open <http://localhost:3000>. (`npm run dev` works too, but its hot reload can lose routes on recent Node versions.)

Press **Play now** and create a passkey (passkeys work on `localhost`). For a second player, use another browser profile or a private window with a different passkey.

## Tests

```bash
npm test          # contract tests
(cd cre/referee && node --test judge.test.ts)   # the referee's judging logic
node tools/e2e/passkey-game.mjs   # browser test, needs the app running (APP_URL, default localhost:3000)
node tools/e2e/core-flows.mjs     # the other core flows; local chain only (it moves the chain clock)
node tools/e2e/account-flows.mjs  # usernames (taken, claim) and sending money by username
node tools/e2e/sandbox.mjs        # the practice board on desktop and phone
node tools/e2e/community.mjs      # a tournament end to end, the audience count, the leaderboard
npm run lint
npm run build
```

After changing the contract, run `npm run compile` to regenerate `src/contracts/abi.ts`.

## Deploy to Monad testnet

```bash
PAYMENT_TOKEN=0x... npm run deploy:monad-testnet   # key from DEPLOYER_PRIVATE_KEY in .env.local
```

The deployer needs testnet MON (faucet.monad.xyz). The deploy creates the game contract, the `ChessReferee` wired to Chainlink's forwarder (the deployer and any `REFEREE_REPORTERS`, comma-separated, are allowed reporters), and (unless `NAMES_ADDRESS` is set) `PlayerNames`. To replace only the referee, keeping games: `CHESS_ADDRESS=0x... REFEREE_REPORTERS=0x... npx hardhat run scripts/deploy-referee.js --network monadTestnet`. It reuses the stake token given in `PAYMENT_TOKEN`, or deploys a MockUSD. The move timeout is 24h; override it with `MOVE_TIMEOUT_SECONDS`.

Copy the printed addresses into `src/deployments.ts` and `cre/referee/config.staging.json`, then rebuild the referee on the server (`./update.sh`, see [deploy/referee](deploy/referee/README.md)).

> The earlier Arbitrum Sepolia deployments (`0x3085…7C7a`, `0xB7f4…E7E`) are from the old contract. It had no access control, and its piece values added up to 2.25× the stake, so `endGame` underflows. Don't use them.
