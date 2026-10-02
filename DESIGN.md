# Design

The living board. DegenChess is chess in a dimension where the pieces are alive and each one carries money. The interface is built out of the board itself: its squares, its two sides, and the gold the pieces hold.

## Principles

1. The pieces are the characters. They stay recognisable chess pieces, with eyes, breath and reactions. Nothing else on a screen competes with them.
2. Gold means money and only money: piece cores, amounts, the action that stakes. It is never decoration.
3. Everything sits on the board's grid. Controls are squares and ranks of squares, flat and square-cornered. No cards, no glass, no gradients on text.
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
- `.rank` / `.rank__square`: a row of board squares used as a segmented choice (stake, clock).
- `.slab`: the HUD surface over the board. Opaque, one-pixel line, no blur.
- `.split`: how the pot is divided, bone from the left with a gold centre mark.
- `.on-move`: a gold underline beneath the side whose turn it is.
- `MiniBoard`: a game as a small board. A waiting game shows White set up with the other side empty.
- `PieceIcon`: flat pieces use the standard tournament set (`src/lib/standardPieces.ts`), in bone and obsidian.
- The Yard shows three boards at a time (two on phones) under Waiting / Live / Finished, with a pager.
- `Wordmark`: a pair of eyes that follow the pointer, then the name.

## The 3D board

Pieces are lathe-turned in code (`src/components/arena/pieces3d.tsx`). Each is a small robed figure with the head of its piece, a pair of plain oval eyes and a gold core sized to its value; the king's core is pale because the king has no price. In `Arena3D.tsx` they breathe, blink, look at the last move and at the pointer, tremble when attacked and lean in when they can capture. On a capture the victim's core flies into the capturer with the amount on it. Fog begins behind the board at any camera distance, so narrow screens keep full contrast.

## Motion

Motion reports state: a move, a capture, whose turn it is, money changing sides. Layout properties are not animated; the split bar scales. `prefers-reduced-motion` turns off the beats and transitions.

## Layout

One container (`max-w-[1240px]`, 20px gutters on phones, 40px from `sm`) shared by the hero and every section. The landing page is the board first, then the Yard, then what each piece is worth, then how it runs. The game screen is the board edge to edge with a top HUD and a bottom dock, both collapsible on phones.
