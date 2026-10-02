# DegenChess

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
- **Draw:** each player keeps their capture-adjusted balance.
- **Fee:** 2.5% of the pot on settlement.
- **Ending a game:** checkmate and rule draws are settled by the referee. You can also resign, agree a draw, or claim a win when your opponent's move timer runs out.
- **Cancel:** the creator can cancel and get a full refund until someone joins.
- **Game keys:** each player can register a second, prompt-free key for a game. It can move, offer or accept draws and claim timeouts, but never resign, cancel or withdraw. MON sent with `createGame`/`joinGame` is forwarded to it for gas.

### The arena

Games are played in a three.js arena (react-three-fiber). The pieces are a sculpted Staunton set (Poly Haven's CC0 "Chess Set" by Riley Queen, trimmed to about 450 KB by `tools/build-chess-set.py`) in polished bone and obsidian on a violet board. Every piece is alive: it has eyes that follow the play, it breathes, it trembles when it is attacked, and it carries a glowing gold core sized to its share of the stake.

Motion is designed for the game: a piece hops to its square with squash and stretch, a capture lands on the victim, which shatters while its core flies into the piece that took it, labelled with the amount, a king in check flashes, and a mated king falls over. A HUD floats over the board with both clocks and a live tug-of-war bar showing how the pot is split.

Players can switch between 3D, a flat 2D board, and both side by side (on wide screens). Spectators always watch in 3D. Sound is synthesized in the browser. `/arena` is a chain-free sandbox with a scripted demo game.

### Clocks, names and rematch

- **Clocks:** a game can have a chess clock (3+2, 5+3, 10+5) enforced by the contract. The mover is charged for their thinking time, a player out of time can't move, and the opponent claims the win. Games without a clock have 24 hours per move.
- **Usernames:** `PlayerNames` holds unique lowercase names. One can be claimed during sign-up, in the same passkey prompt.
- **Rematch:** recreates the game at the same stake and clock; the opponent is shown the offer.

### Accounts: one passkey, two keys

There is no wallet extension and no seed phrase. [Mera](https://mera.category.xyz) derives two keys from one passkey:

- **Money key**: holds your funds. It only exists for the length of one money action (stake, cancel, resign, withdraw), and each of those asks for your passkey.
- **Game key**: registered with the contract as your game key. It stays in the tab's memory so moves, draw offers and timeout claims need no prompt. The contract never lets it touch money.

Nothing secret is stored. Clear the browser or switch devices mid-game and one passkey prompt rebuilds both keys; the game itself lives on-chain. The game key is wiped when you press Lock, close the tab, or after 30 idle minutes.

New players get gas (MON) and test dollars from `/api/drip`, a faucet that only sends from its own balance. Set `FAUCET_PRIVATE_KEY` on the server (locally it falls back to the Hardhat account, or `DEPLOYER_PRIVATE_KEY`).

### Trust model

Every move is recorded on-chain, and turn order is enforced. That's also how the two browsers stay in sync, with no backend. The contract keeps the board (one `uint256`, 4 bits per square) so it can do capture accounting itself, including en passant, castling and promotion.

It does **not** check full chess legality in Solidity, because that is too expensive per move. A **Chainlink CRE workflow** is the referee instead ([cre/README.md](cre/README.md)): it fires on every move, replays the game with chess.js, and settles it through the `ChessReferee` contract. Checkmates and rule draws are declared automatically, and an illegal move forfeits the game, capture gains included. The owner can still call `arbitrate` as a fallback, and a stalled game ends on timeout.

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
src/deployments.ts           live contract addresses
src/components/              AccountBar, Lobby and GameView
src/components/arena/        the 3D arena and the coded piece set
src/lib/mera.ts              passkey ceremonies and key derivation
src/lib/account.tsx          account provider: sessions, prompt-free vs re-prompt signing
src/pages/api/drip.ts        testnet faucet
src/lib/                     move encoding/replay, contract hooks
tools/e2e/passkey-game.mjs   two-player browser test with simulated passkeys
tools/referee-watch.mjs      runs the referee workflow for live games (npm run referee)
tools/brand/                 brand graphics (title card, poster)
tools/blender/, art/         character-model pipeline from an earlier iteration (not used by the arena)
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
npm run lint
npm run build
```

After changing the contract, run `npm run compile` to regenerate `src/contracts/abi.ts`.

## Deploy to Monad testnet

```bash
PAYMENT_TOKEN=0x... npm run deploy:monad-testnet   # key from DEPLOYER_PRIVATE_KEY in .env.local
```

The deployer needs testnet MON (faucet.monad.xyz). The deploy creates the game contract, the `ChessReferee` wired to Chainlink's forwarder, and (unless `NAMES_ADDRESS` is set) `PlayerNames`. It reuses the stake token given in `PAYMENT_TOKEN`, or deploys a MockUSD. The move timeout is 24h; override it with `MOVE_TIMEOUT_SECONDS`.

Copy the printed addresses into `src/deployments.ts` and `cre/referee/config.staging.json`, then restart the referee (`npm run referee`, see [cre/README.md](cre/README.md)).

> The earlier Arbitrum Sepolia deployments (`0x3085…7C7a`, `0xB7f4…E7E`) are from the old contract. It had no access control, and its piece values added up to 2.25× the stake, so `endGame` underflows. Don't use them.
