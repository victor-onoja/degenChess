# Design

The living board. Away Chess is chess in another dimension, a multiverse of boards, where the pieces are alive and each one carries money. The interface is built out of the board itself: its squares, its two sides, and the gold the pieces hold.

## Principles

1. The pieces are the characters. They stay recognisable chess pieces, with breath and reactions; there are no faces. Nothing else on a screen competes with them.
2. Gold means money and only money: piece cores, amounts, the action that stakes. It is never decoration.
3. Everything sits on the board's grid. Controls are flat, outlined squares of one look; the chosen one turns bone. No cards, no glass, no gradients on text.
5. The 2D board and the game itself come first. 3D is the show: it never blocks playing.
4. Real data only. Every small board in the Yard is a real game at its real position.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `--field` | `#0d0b14` | Page ground: near-black, so the colour lives in the board |
| `--field-deep` | `#08070d` | Game screen ground, deep panels |
| `--sq-light` / `--sq-dark` | `#6957d6` / `#3b2e8c` | Board squares in Monad's violet, and controls built from squares |
| `--bone` | `#f1e9d6` | White pieces, text, the selected square |
| `--bone-soft` | `#b5aecd` | Secondary text |
| `--obsidian` | `#0a0a14` | Black pieces, text on bone or gold |
| `--gold` | `#ffc233` | Money: cores, amounts, the primary action |
| `--alert` | `#ff5a45` | Resign and other destructive actions |

The two sides are White and Black, told apart by tone and by label, never by colour alone.

## Type

Bricolage Grotesque throughout. `.statement` (condensed, heavy, tight) for the one line per page; `.heading` for sections; `.lead` and `.soft` for body. Amounts use `.amount`: gold, bold, tabular figures.

## Components

- `.act`: the primary action, a gold square-cornered block. `.act--bone` for secondary, `.act--sm` for compact, `.danger` for resign.
- `.ghost`: outlined control for navigation and view toggles; `aria-pressed` fills it bone.
- `.rank` / `.rank__square`: a row of equal outlined squares used as a segmented choice (stake, clock), each with a plain `.field-label` above it.
- `.slab`: the HUD surface over the board. Opaque, one-pixel line, no blur.
- `.split`: how the pot is divided, bone from the left with a gold centre mark.
- `.on-move`: a gold underline beneath the side whose turn it is.
- `MiniBoard`: a game as a small board. A waiting game shows White set up with the other side empty.
- `PieceIcon`: flat pieces use the standard tournament set (`src/lib/standardPieces.ts`), in bone and obsidian.
- The Yard shows three boards at a time (two on phones) under Waiting / Live / Finished / Yours, with a pager.
- 2D board: tap a piece, then a square. The picked square gets a gold inset, legal moves a gold dot, captures a gold ring.
- `Wordmark`: a pair of eyes that follow the pointer, then the name. When signed in on a phone it shows only the mark, so the header stays on one line.
- Account bar: the name is the rename control; without one, a bone "Choose a username" button takes its place. The balance opens the wallet sheet (deposit address with QR, send by username). Locked, it shows only Unlock; Switch account sits under the headline.
- Sharing: `ShareButton` (icon in each Yard board's corner, full-width *Share invite link* on a waiting game, *Share this game* when finished) uses the phone's share sheet or copies the link.
- `/sandbox`: the practice board, same components, no chain; header, scoreboard and stake row around the board.
- Focus mode: the board alone, a clock pill if the game has a clock, and one exit button; nothing else on screen.
- `MoveList`: one scrolling line of moves under the board; the shown move is bone. Captured pieces sit on small violet squares (`.taken`) so dark pieces read on the dark dock.
- `.ladder`: a standings table (leaderboard, tournament standings): one line per player, the viewer's own row tinted, winnings in gold.
- Audience: an eye icon and a number ("3 watching") in the scoreboard's status line and on live boards in the Yard.
- Landing: after the Yard, one band with the top of the leaderboard and the newest tournaments, each with a link to its page.
- `NameEditor`: username field that checks availability as you type (gold when free, alert when taken) and claims with one passkey prompt.

## The 3D board

The bodies are a sculpted Staunton set (Poly Haven, CC0; `public/set/`), in polished bone and obsidian. Set into each one is a gold core sized to its value; the king's core is pale because the king has no price. No labels float over pieces in play: money is shown only when it moves. In `Arena3D.tsx` they breathe, turn towards the last move and the pointer, tremble when attacked and lean in when they can capture. On a capture the victim's core flies into the capturer with the amount on it. Fog begins behind the board at any camera distance, so narrow screens keep full contrast. Around the board, a dozen translucent boards drift at their own angles (`Multiverse`): the same game in other dimensions.

The armies (default): Heroes (White) against the Undead (Black), animated KayKit characters (CC0), each with its stake as a spinning gold gem over its head and a disc underfoot showing its chess piece (bone piece on obsidian for White, obsidian on bone for Black), turned to read upright from the camera. Characters walk to their square (a knight leaps), face where they are going, strike in their own style on a capture (chop, stab, cast, shoot), fall and sink when taken, and cheer a checkmate; the Undead rise from the board at a new game and taunt after a kill. Pieces can be dragged: press, carry (the piece lifts and follows the pointer, the camera holds still), drop on a highlighted square; a press that stays on its square is a tap. The Staunton set is the classic option, switched from the corner of the 3D board.

## Sound

One mute button for everything. Music sits under the game at low volume and starts on the first tap; voice lines are rare (one every few seconds at most, always at a real moment) and lead the eye to what just happened. Synth effects mark moves and captures.

## Motion

Motion reports state: a move, a capture, whose turn it is, money changing sides. Layout properties are not animated; the split bar scales. `prefers-reduced-motion` turns off the beats and transitions.

## Layout

One container (`max-w-[1240px]`, 20px gutters on phones, 40px from `sm`) shared by the hero and every section. The landing page is the board first, then the Yard (no heading of its own), then how it runs. The game screen is the board edge to edge with a top HUD and a bottom dock, both collapsible on phones.
