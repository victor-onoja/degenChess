# Away Chess: the final hands-on test

One pass through everything the product does, with the exact moves to play and what you should see. Tick each box as you go. Anything that doesn't match, note the step number, what you saw, and your phone or browser.

**Time:** about 60 to 75 minutes. Part 7 has a 3-minute wait.

**Already checked by the automated tests (5 October 2026):** 37 contract tests, 7 referee tests, six browser suites on a local chain, and a full two-player game on the live site against Monad (sign-up in 5.9 s, the referee settling a checkmate, withdrawals, rematch). This script is the human pass: real phones, real eyes and ears.

## Before you start

- **Where:** `https://degen-chess.vercel.app` for this pass. (`https://test.awaychess.com` is the same app and the same games, but accounts are separate per address.)
- **Two players.** You need two accounts at once. Easiest: **Player A on your phone**, **Player B on your laptop**. A second browser, or a private window, also works.
- **A third, signed-out window** on the laptop (a private window) to be the spectator.
- **Usernames:** use throwaway names like `t_alice` and `t_bob`. Names are shared between the two addresses, so anything you claim here is taken on `test.awaychess.com` too. I can reset all usernames after the test if you want your real name free.
- **Faucet:** each new account costs the faucet wallet about 1 test MON. Make sure it is funded.
- **Sound on**, volume up.
- All stakes below are **1 tUSD** unless a step says otherwise. At 1 tUSD a pawn is worth 0.0256, a knight or bishop 0.0769, a rook 0.1282 and a queen 0.2308.

How to read a move: `e2 → e4` means move the piece on e2 to e4. On a phone tap the piece, then the square. On a laptop drag it, or click then click.

---

## Part 1: First visit and sign-up (5 min)

**Phone (Player A), signed out**

- [ ] 1.1 The page loads with the Heroes and the Undead playing a game by themselves behind the headline "Every piece has skin in the game." The logo reads **Away Chess**.
- [ ] 1.2 The characters look sharp, not blurry. The page scrolls smoothly.
- [ ] 1.3 Scroll down: the Yard (boards), Leaderboard and Tournaments side by side or stacked, "How it runs", and a footer with Source, Contract and Credits.
- [ ] 1.4 In the name box type `t_alice`. Under it: "Available. It's yours if you want it."
- [ ] 1.5 Tap **Play now**. One Face ID or fingerprint prompt (some phones ask a second time, straight after). No wallet app, no seed phrase.
- [ ] 1.6 A message appears: "You're in. 1 passkey tap, N s to your first transaction on Monad." Note the number of seconds: ______
- [ ] 1.7 The header shows only the eyes logo, **t_alice**, **100 tUSD** and a lock button, all on one line.

**Laptop (Player B), signed out**

- [ ] 1.8 Type `t_alice` in the name box: it says "Someone has that name. Try another" and **Play now** is disabled.
- [ ] 1.9 Clear the box and press **Play now** with no name. After sign-up the header shows a **Choose a username** button, and above the Yard it says "Choose a username. Opponents and spectators see it instead of your address."
- [ ] 1.10 In that box type `t_bob`, see "Available", press **Claim**, confirm with the passkey. The header now shows **t_bob**.

## Part 2: Game 1, a capture and a checkmate the referee settles (8 min)

**Phone (A)**

- [ ] 2.1 In **Start a board**: Stake **1**, Clock **5 + 3**, Play as **White**. Tap **Create Game**, confirm with the passkey.
- [ ] 2.2 You land on the board. Phones open in **2D**. The panel says "Waiting for an opponent" with a big **Share invite link** and a Cancel button.
- [ ] 2.3 Tap **Share invite link**: the phone's share sheet opens. Send the link to yourself, or just close it.

**Laptop (B)**

- [ ] 2.4 Go to the Yard. Under **Waiting** there is a board with White's pieces set up and the caption "t_alice is waiting, plays White", with a share button in its corner.
- [ ] 2.5 Click the board, then **Join as Black (1 tUSD)**, confirm with the passkey. Laptops open in **3D**: Heroes at the bottom or top, Undead opposite, and the Undead climb out of the board.
- [ ] 2.6 You hear music start (after your first click), and each army calls out once.

**Play these moves.** No passkey prompt should appear for any move.

| # | White (A, phone) | Black (B, laptop) |
| --- | --- | --- |
| 1 | `e2 → e4` | `e7 → e5` |
| 2 | `f1 → c4` | `b8 → c6` |
| 3 | `d1 → h5` | `g8 → f6` |
| 4 | `h5 → f7` (takes a pawn: checkmate) | |

- [ ] 2.7 Each move shows on the other screen within a second or two, with footsteps as characters walk (laptop, 3D).
- [ ] 2.8 On the phone, tapping a piece shows gold dots on the squares it can go to.
- [ ] 2.9 On move 4 the queen attacks, the pawn falls, and "+0.0256 tUSD" flies to the queen (laptop, 3D).
- [ ] 2.10 **Nobody resigns.** Within about 30 seconds both screens say **Finished - White wins**. The Heroes cheer and you hear a checkmate line.
- [ ] 2.11 Final amounts: **White 1.95**, **Black 0**. (Black captured nothing, so keeps nothing; the fee is 2.5% of the 2 tUSD pot.)
- [ ] 2.12 Phone (A): tap **Withdraw 1.95 tUSD**, confirm with the passkey. The button becomes "Withdrawn" and the header balance is **100.95 tUSD**.
- [ ] 2.13 Under the board, the move list reads `1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#`. Tap `Bc4`: the board goes back to that position. Use the arrows to step to the end.

## Part 3: Game 2, captures both ways, resignation, the loser keeps what they took (8 min)

**Laptop (B)**

- [ ] 3.1 On the finished game press **Rematch (1 tUSD, you play White)**. (A rematch swaps colours.) Confirm with the passkey.

**Phone (A)**

- [ ] 3.2 The finished game shows "t_bob wants a rematch". Tap it, then **Join as Black**.

| # | White (B, laptop) | Black (A, phone) |
| --- | --- | --- |
| 1 | `e2 → e4` | `d7 → d5` |
| 2 | `e4 → d5` (takes a pawn) | `d8 → d5` (takes a pawn) |
| 3 | `b1 → c3` | `d5 → g2` (takes a pawn) |
| 4 | `f1 → g2` (takes the queen) | |

- [ ] 3.3 After White's move 4 the top bar reads **White 1.2051**, **Black 0.7949**, and the pot bar has shifted towards White.
- [ ] 3.4 On the laptop, taking the queen brings a "big capture" line from one army and a reply from the other. The two voices do **not** talk over each other, and the music dips while they speak.
- [ ] 3.5 The panel shows what each side took as small pieces on violet squares. On the phone, black pieces are easy to see.
- [ ] 3.6 Phone (A): when it is not your move, shrink the bottom panel with the small arrow at its top: it becomes one line with back and forward arrows. Expand it again with the **...** button.
- [ ] 3.7 Phone (A): tap **Resign**, confirm with the passkey.
- [ ] 3.8 Result: **Finished - White wins**. **White 1.9**, **Black 0.05**. (Black keeps the 0.0513 it won by capturing, less the fee.)
- [ ] 3.9 Both withdraw. A's header: **100 tUSD** (100.95 − 1 + 0.05). B's header: **99.9 tUSD** (99 − 1 + 1.9).

## Part 4: Game 3, a draw, which is free (4 min)

**Phone (A)**

- [ ] 4.1 Create a game: Stake **1**, Clock **5 + 3**, Play as **Random**. The hint says a coin flip picks your side.

**Laptop (B)**

- [ ] 4.2 The Yard shows the board with **both** sides set up and "side by coin flip". The button says **Join, coin flip for sides**. Join.
- [ ] 4.3 Each player now has a colour. Whoever is White plays `e2 → e4`; Black plays `e7 → e5`.
- [ ] 4.4 Either player presses **Offer draw** (no passkey prompt). The other sees **Accept draw offer** and presses it.
- [ ] 4.5 Result: **Finished - Draw**. Both balances are exactly **1**, and the panel says "Draws are free."
- [ ] 4.6 Both withdraw 1 tUSD.

## Part 5: Game 4, playing as Black, tap-to-move, promotion (8 min)

**Laptop (B)**

- [ ] 5.1 Create a game: Stake **1**, Clock **None**, Play as **Black**. The waiting board in the Yard shows Black's pieces only.

**Phone (A)**

- [ ] 5.2 The button says **Join as White**. Join. The phone shows White at the bottom.

| # | White (A, phone, tapping) | Black (B, laptop) |
| --- | --- | --- |
| 1 | `h2 → h4` | `g7 → g5` |
| 2 | `h4 → g5` (takes a pawn) | `g8 → f6` |
| 3 | `g5 → f6` (takes the knight) | `h7 → h5` |
| 4 | `f6 → e7` (takes a pawn) | `h5 → h4` |
| 5 | `e7 → f8` (takes the bishop and promotes) | |

- [ ] 5.3 On move 5 a small picker appears. Tap the **queen**. A queen stands on f8, and you hear a promotion line.
- [ ] 5.4 Black plays `e8 → f8` (the king takes the new queen).
- [ ] 5.5 Laptop (B): switch between **3D**, **2D** and **Split**. In Split, both boards show the same position.
- [ ] 5.6 Laptop (B): in 3D press **Classic set** (bottom right): the characters become a classic chess set. Press **Armies** to go back.
- [ ] 5.7 Laptop (B): press the **Focus** button (the corner brackets): everything disappears except the board and an exit button. Press it again to leave.
- [ ] 5.8 Phone (A): tap **3D**, then press **Focus**. Only the board. Exit, and go back to **2D**.
- [ ] 5.9 Phone (A) plays `a2 → a3`. Then Laptop (B), in 3D: **drag** the knight `b8 → c6`. It lifts, follows the pointer and lands.
- [ ] 5.10 Leave this game running for Part 6.

## Part 6: Watching, sharing, and coming back (8 min)

**Third window (signed out, private window on the laptop)**

- [ ] 6.1 Open the site. In the Yard choose **Live**: the Part 5 game is there at its real position. Open it.
- [ ] 6.2 It opens in **3D** with "You are spectating." and a **Share** button. You can switch to 2D.
- [ ] 6.3 Both players' screens now show an eye and **1 watching**. So does the spectator's. Close the spectator window: within about half a minute the count disappears from the players' screens.

**Phone (A): the "stateless" test**

- [ ] 6.4 While the game is live, clear the site's data in your browser settings (or open the game link in a browser where you've never signed in), then load the game page. It shows you as signed out.
- [ ] 6.5 Tap **I have a passkey**, confirm. Your account, your username and your side of the game are back, and you can move.

**Laptop (B): lock and reload**

- [ ] 6.6 Press the **lock** button. The panel says "Unlock with passkey to keep playing." Unlock: you can move again.
- [ ] 6.7 Reload the page. It comes back locked (by design). One tap unlocks it.
- [ ] 6.8 On a laptop the share button **copies the link** (a "Link copied" message), it does not open a share sheet.
- [ ] 6.9 Finish the game: Black (B) presses **Resign**. Both withdraw.

## Part 7: Game 5, running out of time (5 min, 3 of them waiting)

**Phone (A)**

- [ ] 7.1 Create a game: Stake **1**, Clock **3 + 2**, Play as **White**. B joins.
- [ ] 7.2 A plays `e2 → e4`. **B does nothing.** Both clocks are visible; Black's counts down.
- [ ] 7.3 Under 10 seconds, B hears a low-time warning line (laptop, armies on).
- [ ] 7.4 At 0:00, B's panel says **You ran out of time** with no Resign and no Offer draw. A's panel says "t_bob ran out of time" with one button: **Claim win on timeout**.
- [ ] 7.5 A taps it (no passkey prompt). Result: **Finished - White wins**, White 1.95, Black 0.
- [ ] 7.6 A withdraws.

## Part 8: Cancel and refund (2 min)

- [ ] 8.1 A creates a game (1 tUSD). The balance drops by 1.
- [ ] 8.2 A taps **Cancel & Refund**, confirms. "This game was cancelled and refunded." The balance is back.

## Part 9: Money: the wallet and invites (6 min)

**Phone (A)**

- [ ] 9.1 Tap your balance. **Your money** opens above everything: the balance, MON for gas, your address with a QR code and **Copy address**.
- [ ] 9.2 **Invites** shows your link ending `?ref=t_alice` and a **Share** button.
- [ ] 9.3 **Send**: type `t_bob` and `2`. It says "To t_bob. Asks for your passkey." Send, confirm. Your balance drops by 2; B's rises by 2.
- [ ] 9.4 Type a name nobody has: "No player has that username." Type your own name: "That's you."

**Invite earnings (needs a brand-new third account, Player C; a private window is fine)**

- [ ] 9.5 Open A's invite link (`.../?ref=t_alice`) in the new window and sign up as `t_cara`.
- [ ] 9.6 C plays one game against B and **loses or wins by resignation** (any game that is not a draw). For speed: B creates, C joins, one move each, C resigns.
- [ ] 9.7 A's wallet now shows **Earned 0.005 tUSD** (20% of C's half of the 0.05 fee) and **Withdraw** works.

## Part 10: Leaderboard and tournaments (10 min)

- [ ] 10.1 Open **Leaderboard**: every player from this session is listed with wins, draws, losses and money won. Your own row is marked "(you)". The order is by the **Won** column: payouts minus stakes, after fees, so it can be negative.

**A tournament with a prize pot (A hosts; B and C play)**

- [ ] 10.2 A opens **Tournaments**, names it `Test Cup`, Stake per game **1**, Clock **5 + 3**, Prize pot **5**, **Top three: 50 / 30 / 20**, Runs for **1 day**. Presses **Create and pay 5 tUSD**, confirms.
- [ ] 10.2a Go back to **All tournaments**: `Test Cup` is under **Open**, showing "1 player", "5 tUSD to enter, pot 5 tUSD so far" and "hosted by t_alice".
- [ ] 10.3 The page shows "Prize pot 5 tUSD", A in the player list, and **Invite players**. Share or copy the link.
- [ ] 10.4 B and C open the link and press **Join for 5 tUSD**. The pot reads **15 tUSD**, 3 players.
- [ ] 10.5 C presses **Leave and refund**: the pot drops to 10 and C's 5 tUSD is back. C joins again: 15.
- [ ] 10.6 A presses **Start: close entries**. The page shows Standings and three games: A v B, A v C, B v C, each "To play" or with a **Play** button for the two players.
- [ ] 10.6a In the list it has moved to **Running**: "0 of 3 games played · 3 players · pot 15 tUSD · pays out by" tomorrow's date.
- [ ] 10.7 A presses **Play** on A v B and gets a waiting game. B opens the tournament page, presses **Join** on that game, then **Join as Black** on the board. Play one move each, then B resigns. The game list shows "t_alice won", and A has 1 point.
- [ ] 10.8 Play A v C: C creates with **Play**, A joins, one move each, **agree a draw**. A has 1½, C has ½.
- [ ] 10.9 Play B v C: one move each, C resigns. B has 1 point.
- [ ] 10.10 "3 of 3 games played", and a **Pay out the prizes** button appears. Anyone presses it and confirms.
- [ ] 10.11 It says "paid out" and the table has a Prize column: **A +7.5** (50%), **B +4.5** (30%), **C +3** (20%). Balances rise to match. The page says "Finished. t_alice won."
- [ ] 10.11a In the list it is now under **Finished**: "t_alice won +7.5 tUSD · 3 players · 3 of 3 games played", with a **Results** link.

**A free tournament**

- [ ] 10.12 Create one with Prize pot **None**: creating and joining cost nothing, there is no pot line, and the standings still fill in from games played. Once every pair has played, it moves to **Finished** with the winner's name.

## Part 11: The other pages (5 min)

- [ ] 11.1 `/sandbox`: play both sides. Play `e2 → e4`, `d7 → d5`, `e4 → d5`: White's amount rises from 10 to **10.26** and Black's falls to 9.74. **Undo** takes a move back. **New game** resets, and in 3D the pawns change to a different set (rogues, rangers or engineers).
- [ ] 11.2 `/sounds`: every music track, voice line and effect plays.
- [ ] 11.3 `/credits`: music, art and voices are listed with their licences.
- [ ] 11.4 The speaker button in a game silences music, voices and effects at once, and pressing it again brings them back. Holding it on a phone (right-click on a laptop) skips to the next song.
- [ ] 11.5 Scroll to the footer and press **Feedback**. Choose **An idea**, type a sentence, press **Send**: "Sent. Every message is read." and the message appears in your Discord channel with your username and the page. (Needs the Discord webhook set on Vercel; without it the form says "Feedback is not switched on yet.")
- [ ] 11.6 A finished game shows **How was that? Send feedback**, which opens the same form.
- [ ] 11.7 Paste a game link into a chat app: the preview shows the Away Chess image and title.

## Part 12: A second phone, if you can (5 min)

- [ ] 12.1 Repeat Part 1 and Part 2 with an Android phone (or an iPhone, whichever you haven't used). Sign-up, one full game, 3D and 2D.
- [ ] 12.2 3D is smooth enough to play, characters are sharp, and nothing overlaps or runs off the screen.

---

## What cannot be tested by hand

- **Illegal moves.** The app only lets you make legal moves, so cheating needs modified code. It is covered by the contract tests and by a recorded game on Monad where the referee forfeited the cheater (see `docs/SUBMISSION.md`).
- **Stalemate and other rule draws.** The referee settles them the same way as checkmate. If you want to see one, the ten-move stalemate is: `e3 a5`, `Qh5 Ra6`, `Qxa5 h5`, `h4 Rah6`, `Qxc7 f6`, `Qxd7+ Kf7`, `Qxb7 Qd3`, `Qxb8 Qh7`, `Qxc8 Kg6`, `Qe6`. Within about 30 seconds: **Finished - Draw**.

## Known limits, not bugs

- Reloading the page locks your account; one tap unlocks it. This is deliberate.
- The watching count is a live head-count, so it starts from zero when the server restarts.
- A checkmate settles only while the referee server is running. If "The referee is settling the game..." stays for more than a minute, tell me.
- Accounts are per web address: an account made on `degen-chess.vercel.app` does not exist on `test.awaychess.com`.
- Everything is test money on Monad testnet.

## After the test

Send me the step numbers that failed with what you saw. When the list is empty: reset usernames if you want, give `test.awaychess.com` to friends, and record the videos.
