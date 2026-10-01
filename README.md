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
- **Fee:** 2.5% of the pot on settlement, paid to the contract owner.
- **Ending a game:** resign, accept a draw offer, or claim a win when your opponent's move timer runs out. A checkmated player who won't resign loses on timeout.
- **Cancel:** the creator can cancel and get a full refund until someone joins.
- **Game keys:** each player can register a second, prompt-free key for a game. It can move, offer or accept draws and claim timeouts, but never resign, cancel or withdraw. MON sent with `createGame`/`joinGame` is forwarded to it for gas.

### Accounts: one passkey, two keys

There is no wallet extension and no seed phrase. [Mera](https://mera.category.xyz) derives two keys from one passkey:

- **Money key**: holds your funds. It only exists for the length of one money action (stake, cancel, resign, withdraw), and each of those asks for your passkey.
- **Game key**: registered with the contract as your game key. It stays in the tab's memory so moves, draw offers and timeout claims need no prompt. The contract never lets it touch money.

Nothing secret is stored. Clear the browser or switch devices mid-game and one passkey prompt rebuilds both keys; the game itself lives on-chain. The game key is wiped when you press Lock, close the tab, or after 30 idle minutes.

New players get gas (MON) and test dollars from `/api/drip`, a faucet that only sends from its own balance. Set `FAUCET_PRIVATE_KEY` on the server (locally it falls back to the Hardhat account, or `DEPLOYER_PRIVATE_KEY`).

### Trust model

Every move is recorded on-chain, and turn order is enforced. That's also how the two browsers stay in sync, with no backend. The contract keeps the board (one `uint256`, 4 bits per square) so it can do capture accounting itself, including en passant, castling and promotion.

It does **not** check full chess legality, because that is too expensive on-chain. Each client replays the moves with chess.js and flags any illegal on-chain move. For disputes, the contract owner can call `arbitrate(gameId, result)`.

## Project layout

```text
contracts/DegenChess.sol     game contract
contracts/test/MockUSD.sol   mintable test dollar (tUSD) for testnet, local dev and tests
test/DegenChess.test.js      contract tests, including random legal games cross-checked against chess.js
scripts/deploy.js            deploy (also deploys MockUSD unless PAYMENT_TOKEN is set)
scripts/export-abi.js        writes src/contracts/abi.ts from the compiled artifact
src/components/              AccountBar, Lobby and GameView
src/lib/mera.ts              passkey ceremonies and key derivation
src/lib/account.tsx          account provider: sessions, prompt-free vs re-prompt signing
src/pages/api/drip.ts        testnet faucet
src/lib/                     move encoding/replay, contract hooks
tools/e2e/passkey-game.mjs   two-player browser test with simulated passkeys
tools/blender/, art/         3D character pipeline (art/ is not committed); output in public/models/
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
```

Then run `npm run dev` and open <http://localhost:3000>.

Press **Play now** and create a passkey (passkeys work on `localhost`). For a second player, use another browser profile or a private window with a different passkey.

## Tests

```bash
npm test          # contract tests
node tools/e2e/passkey-game.mjs   # browser test, needs the app running (APP_URL, default localhost:3000)
npm run lint
npm run build
```

After changing the contract, run `npm run compile` to regenerate `src/contracts/abi.ts`.

## Deploy to Monad testnet

```bash
DEPLOYER_PRIVATE_KEY=0x... npm run deploy:monad-testnet
```

The deployer needs testnet MON (faucet.monad.xyz). The deploy creates a MockUSD stake token (or uses `PAYMENT_TOKEN`) and sets a 24h move timeout; override it with `MOVE_TIMEOUT_SECONDS`.

Set `NEXT_PUBLIC_CHAIN=monadTestnet` and the printed `NEXT_PUBLIC_CONTRACT_ADDRESS` in your hosting environment. See `.env.example`.

> The earlier Arbitrum Sepolia deployments (`0x3085…7C7a`, `0xB7f4…E7E`) are from the old contract. It had no access control, and its piece values added up to 2.25× the stake, so `endGame` underflows. Don't use them.
