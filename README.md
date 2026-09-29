# DegenChess

Staked chess on-chain. Both players put up the same dollar stake, and **every capture moves that piece's value from the victim to the capturer**. When the game ends, the winner takes the loser's balance except what the loser earned through their own captures, so a loser who fought well still gets paid.

Tech stack: Next.js, RainbowKit, wagmi, viem, react-chessboard, chess.js, Solidity (Hardhat), on Monad testnet. Stakes are in tUSD, a 6-decimal test dollar standing in for AUSD.

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
src/components/              Lobby and GameView
src/lib/                     move encoding/replay, contract hooks, tx helper
```

## Run locally (no wallet extension needed)

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

In local mode the header has **Dev: Player 1 / Player 2** buttons that connect funded Hardhat accounts. Open two browser windows, one per player. MetaMask also works: add network `http://127.0.0.1:8545`, chain ID 31337.

## Tests

```bash
npm test          # contract tests
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
