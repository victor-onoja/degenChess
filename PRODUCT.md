# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary (inferred, not confirmed by the owner, who said "use your judgement"):** hackathon judges evaluating a consumer product. They give the site under a minute, on a laptop or a phone, and must understand the twist, trust it, and be able to start or watch a game.
- **The users the product is for:** online chess players who already bet informally (clubs, Discord servers, streams) and have never used a crypto wallet; and crypto-native players who want a skill game with stakes.
- **Spectators:** anyone opening a shared game link or picking a live game from the lobby.

## Product Purpose

Staked chess where money moves during the game. Two players put up the same dollar stake; each piece is worth a fixed share of it; capturing a piece moves its share to the capturer immediately, on-chain. The winner takes the pot, but the loser keeps what they captured. Success for a visitor is: understand that in seconds, be in a game with one passkey tap, and never see a wallet.

## Positioning

Every capture is a settled payment, not a point. A chess site cannot copy that without real-time settlement, and a crypto game cannot copy the one-tap, no-wallet start without the passkey account design (a money key that always asks, a game key that never does and cannot touch money).

## Operating Context

- Lobby: sign up (one passkey prompt, optional username), create a game (stake and clock), join an open game, watch a live game, return to your own games.
- Game: play in 3D, 2D or both side by side; clocks; a live split of the pot; resign, draw, rematch; withdraw. Spectators always watch in 3D.
- Referee: a Chainlink CRE workflow replays every game and settles checkmates, rule draws and illegal moves.
- Runs on Monad testnet with a test dollar (tUSD). Moves confirm in under a second.
- Used on phones as much as laptops; the owner cares strongly about the mobile experience.

## Capabilities and Constraints

- Piece weights: pawn 1, knight 3, bishop 3, rook 5, queen 9, out of 39. The king has no value.
- Time controls: 3+2, 5+3, 10+5, or no clock (24 hours a move).
- Usernames are unique, lowercase, 3 to 16 characters.
- Testnet only. No real money. Do not claim otherwise.
- The 3D board is built in code (react-three-fiber); there are no character models in the arena.
- Passkeys are bound to the domain degen-chess.vercel.app.
- Next.js pages router, Tailwind, deployed on Vercel.

## Brand Commitments

- The name is **DegenChess**. This is the only fixed part of the identity.
- The owner's statement of what the product is (2 October 2026): "DegenChess is for chess lovers and web3 lovers. It's chess, but in a web3 reality or dimension. The pieces are alive and are all valuable; that's why this chess is the way it is. Every piece wants to win for the player. Even if you played chess previously, DegenChess is different, and there's real money involved."
- The identity must be its own. Directions borrowed from another world (a trading terminal, a newspaper column, a fight poster, a clock) were rejected for "tying to something else".
- Confirmed: the pieces stay recognisable chess pieces but are alive (eyes, breathing, reactions), and each carries its value visibly. The lobby is "the Yard": every game is a small living board showing its real position.
- Colours, type and the logo treatment are open. The two sides no longer need to be Bulls and Bears.
- The owner wants the result to read as the work of people with real design ability, "creative and unexpected", with every element looking intentional. Earlier versions were judged "ugly and basic".
- What would make a polished result feel wrong: a template look (hero followed by rows of cards), and busyness that makes Play or a game hard to find.
- The 3D mode should become more impressive, not just the pages around it.
- Long-term the owner plans more staked skill games under the name "Degen Yard"; this is a roadmap line, not something to build now.

## Evidence on Hand

- Live product: https://degen-chess.vercel.app
- Real on-chain data available to the page: recent games (players, stake, clock, status, live balances), usernames.
- A scripted demo game the 3D board can play on its own.
- Measured: about 5 seconds from "Play now" to a first confirmed transaction; about 0.8 seconds per move.
- Brand files: `public/brand/` (logo mark, wide logo, title card, poster), `public/og.png`.
- No testimonials, user counts, press or volume figures exist. Do not invent them.

## Product Principles

1. The twist first: a visitor should see money move on a capture before reading a sentence about it.
2. One obvious action per screen. Play, or a game to join or watch, is never hunted for.
3. The chain is invisible. No wallet language, no addresses where a name will do.
4. Real data over decoration. If something moves or counts, it is true.
5. The board is the product. Chrome serves it and gets out of its way.

## Accessibility & Inclusion

No formal standard has been set. Text must stay readable over the 3D board, controls must be reachable by touch on a phone, and colour must not be the only signal for which side is which.
