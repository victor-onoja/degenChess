# Away Chess: the final hands-on test

One pass through everything the product does, with the exact moves to play and what you should see. Tick each box as you go. Anything that doesn't match, note the step number, what you saw, and your phone or browser.

**Time:** about 60 to 75 minutes. Part 7 has a 3-minute wait.

**How this plan is kept honest.** A script, `tools/e2e/test-plan.mjs`, walks these same steps on a phone-sized and a laptop-sized browser and checks the wording, buttons and amounts quoted here, step by step. It last passed on 10 October 2026, after the contract redeploy of 9 October. What it cannot check is marked **(by eye)** or **(by ear)**: that is your part.

## Before you start

- **Where:** `https://test.awaychess.com`. (`https://degen-chess.vercel.app` is the same app and the same games; accounts are separate per address.)
- **Two players.** You need two accounts at once: **Player A on your phone**, **Player B on your laptop**.
- **Start signed out, with new accounts.** The amounts below assume each account starts with exactly 100 tUSD. If a device already has an account here: press the lock button, then **Switch account** under the headline. Then sign up fresh in Part 1.
- **A third, signed-out window** on the laptop (a private window) to be the spectator, and later Player C.
- **Usernames:** use throwaway names like `t_alice`, `t_bob`, `t_cara`. If a name is taken, add a digit, and read your name wherever this plan says `t_alice`.
- **The site is not empty.** The board list, leaderboard and Finished tournaments already hold test players (`bull_…`, `bear_…`, `al_…`, `bo_…`) and three games from the referee checks.
- **Faucet:** each new account costs the faucet wallet about 1 test MON. Make sure it is funded.
- **Sound on**, volume up.
- All stakes are **1 tUSD** unless a step says otherwise. At 1 tUSD a pawn is worth 0.0256, a knight or bishop 0.0769, a rook 0.1282 and a queen 0.2308.

How to read a move: `e2 → e4` means move the piece on e2 to e4. On a phone tap the piece, then the square. On a laptop drag it, or click then click.

**The phone's bottom panel.** During a game it is one line: a back arrow, a status ("Your move"), a forward arrow and a **...** button. **Offer draw**, **Resign**, the move list and the pieces taken are behind the **...** button. A small arrow at the top of the open panel shrinks it again. It opens by itself when something needs you (a draw offer, time running out, the game ending).

---

## Part 1: First visit and sign-up (5 min)

Phone (Player A), signed out

- [ ] 1.1 The page loads with the Heroes and the Undead playing a game by themselves behind the headline "Every piece has skin in the game." Top left: the eyes logo and the words **Away Chess**. (Once you are signed in, a phone shows only the eyes, to leave room for your name and balance.)
- [ ] 1.2 **(by eye)** The characters look sharp, not blurry. The page scrolls smoothly.
- [ ] 1.3 Scroll down: **Start a board** with a list of boards under tabs **Waiting**, **Live** and **Finished**; then **Leaderboard**, **Tournaments** and **How it runs**; and a footer with Feedback, Discord, Source, Contract and Credits.
- [ ] 1.4 In the name box type `t_alice`. Under it: "Available. It's yours if you want it."
- [ ] 1.5 Tap **Play now**. One Face ID or fingerprint prompt (some phones ask a second time, straight after). No wallet app, no seed phrase.
- [ ] 1.6 A message appears: "You're in. 1 passkey tap, N s to your first transaction on Monad." Note the number of seconds: ______
- [ ] 1.7 The header shows only the eyes, **t_alice**, **100 tUSD** and a lock button, all on one line. A fourth tab, **Yours**, appears in the board list.

Laptop (Player B), signed out

- [ ] 1.8 Type `t_alice` in the name box: it says "Someone has that name. Try another" and **Play now** is disabled.
- [ ] 1.9 Clear the box and press **Play now** with no name. After sign-up the header shows a **Choose a username** button, and above the board list it says "Choose a username. Opponents and spectators see it instead of your address."
- [ ] 1.10 In that box type `t_bob`, see "Available", press **Claim**, confirm with the passkey. The header now shows **t_bob**.

## Part 2: Game 1, a capture and a checkmate the referee settles (8 min)

Phone (A)

- [ ] 2.1 In **Start a board**: Stake **1**, Clock **5 + 3**, Play as **White**. Tap **Create Game**, confirm with the passkey.
- [ ] 2.2 You land on the board. Phones open in **2D**. The panel says "Waiting for an opponent" with a big **Share invite link** and a **Cancel & Refund** button.
- [ ] 2.3 Tap **Share invite link**: the phone's share sheet opens. Send the link to yourself, or just close it.

Laptop (B)

- [ ] 2.4 On the home page, under **Waiting**, there is a board with White's pieces set up and the caption "t_alice is waiting, plays White", with a share button in its corner.
- [ ] 2.5 Click the board, then **Join as Black (1 tUSD)**, confirm with the passkey. Laptops open in **3D**. **(by eye)** Heroes on one side, Undead on the other, and the Undead climb out of the board.
- [ ] 2.6 **(by ear)** Music starts after your first click, and each army calls out once.

**Play these moves.** No passkey prompt should appear for any move.

| # | White (A, phone) | Black (B, laptop) |
| --- | --- | --- |
| 1 | `e2 → e4` | `e7 → e5` |
| 2 | `f1 → c4` | `b8 → c6` |
| 3 | `d1 → h5` | `g8 → f6` |
| 4 | `h5 → f7` (takes a pawn: checkmate) | |

- [ ] 2.7 Each move shows on the other screen within a second or two. **(by ear)** Footsteps as characters walk (laptop, 3D).
- [ ] 2.8 On the phone, tapping a piece shows gold dots on the squares it can go to.
- [ ] 2.9 **(by eye)** On move 4 the queen attacks, the pawn falls, and "+0.0256 tUSD" flies to the queen (laptop, 3D).
- [ ] 2.10 **Nobody resigns.** The phone says "Checkmate - you won. The referee is settling the game..." and within about 30 seconds both screens say **Finished - White wins**. **(by eye and ear)** The Heroes cheer and you hear a checkmate line.
- [ ] 2.11 Final amounts: **White 1.95**, **Black 0**. (Black captured nothing, so keeps nothing; the fee is 2.5% of the 2 tUSD pot.)
- [ ] 2.12 Phone (A): tap **Withdraw 1.95 tUSD**, confirm with the passkey. The button becomes "Withdrawn". Back on the home page the header balance is **100.95 tUSD**.
- [ ] 2.13 On the finished game the move list reads `1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#`. Tap `Bc4`: the board goes back to that position. Use the arrows to step to the end.
- [ ] 2.14 Under the buttons: **How was that? Send feedback**.

## Part 3: Game 2, captures both ways, resignation, the loser keeps what they took (8 min)

Laptop (B)

- [ ] 3.1 On the finished game press **Rematch (1 tUSD, you play White)**. (A rematch swaps colours.) Confirm with the passkey.

Phone (A)

- [ ] 3.2 The finished game shows "t_bob wants a rematch → game #N". Tap it, then **Join as Black (1 tUSD)**.

| # | White (B, laptop) | Black (A, phone) |
| --- | --- | --- |
| 1 | `e2 → e4` | `d7 → d5` |
| 2 | `e4 → d5` (takes a pawn) | `d8 → d5` (takes a pawn) |
| 3 | `b1 → c3` | `d5 → g2` (takes a pawn) |
| 4 | `f1 → g2` (takes the queen) | |

- [ ] 3.3 After White's move 4 the top bar reads **1.2051** for White and **0.7949** for Black, and the bar between them has shifted towards White.
- [ ] 3.4 **(by ear)** On the laptop, taking the queen brings a "big capture" line from one army and a reply from the other. The two voices do **not** talk over each other, and the music dips while they speak.
- [ ] 3.5 Phone (A): the bottom panel is one line (arrows, a status and **...**), with no Resign showing. Tap **...**: the panel opens with **Offer draw**, **Resign**, the moves, and what each side took as small pieces on violet squares (four of them). **(by eye)** The black pieces are easy to see.
- [ ] 3.6 Phone (A): tap the small arrow at the top of the open panel: it shrinks back to one line. Tap **...** to open it again.
- [ ] 3.7 Phone (A): tap **Resign**, confirm with the passkey.
- [ ] 3.8 Result: **Finished - White wins**. **White 1.9**, **Black 0.05**. (Black keeps the 0.0513 it won by capturing, less the fee.)
- [ ] 3.9 Both withdraw. On the home page A's header reads **100 tUSD** (100.95 − 1 + 0.05) and B's **99.9 tUSD** (99 − 1 + 1.9).

## Part 4: Game 3, a draw, which is free (4 min)

Phone (A)

- [ ] 4.1 In Start a board choose Play as **Random** (Stake 1, Clock 5 + 3) and create the game.

Laptop (B)

- [ ] 4.2 Under **Waiting** the caption is "t_alice is waiting, side by coin flip", and the board shows **both** sides set up **(by eye)**. Open it: the button says **Join, coin flip for sides (1 tUSD)**. Join.
- [ ] 4.3 Each player now has a colour (the laptop's top bar says "White · name" and "Black · name", with "(you)" on yours). Whoever is White plays `e2 → e4`; Black plays `e7 → e5`.
- [ ] 4.4 Laptop (B) presses **Offer draw** (no passkey prompt). The phone's panel opens by itself with **Accept draw offer**. Tap it.
- [ ] 4.5 Result: **Finished - Draw**. The panel says "Draws are free." and each player's button reads **Withdraw 1 tUSD**.
- [ ] 4.6 Both withdraw 1 tUSD.

## Part 5: Game 4, playing as Black, tap-to-move, promotion (8 min)

Laptop (B)

- [ ] 5.1 Create a game: Stake **1**, Clock **None**, Play as **Black**.

Phone (A)

- [ ] 5.2 Under **Waiting**: "t_bob is waiting, plays Black", and **(by eye)** the board shows Black's pieces only. Open it: the button says **Join as White (1 tUSD)**. Join. The phone shows White at the bottom, and you can move straight away.

| # | White (A, phone, tapping) | Black (B, laptop) |
| --- | --- | --- |
| 1 | `h2 → h4` | `g7 → g5` |
| 2 | `h4 → g5` (takes a pawn) | `g8 → f6` |
| 3 | `g5 → f6` (takes the knight) | `h7 → h5` |
| 4 | `f6 → e7` (takes a pawn) | `h5 → h4` |
| 5 | `e7 → f8` (takes the bishop and promotes) | |

- [ ] 5.3 Laptop (B) could move without any extra prompt or "Enable prompt-free moves" button. (This was a bug until 10 October: a creator who chose Black or Random was asked to enable moves again.)
- [ ] 5.4 On move 5 a small picker appears on the phone. Tap the **queen**. A queen stands on f8. **(by ear)** A promotion line.
- [ ] 5.5 Black plays `e8 → f8` (the king takes the new queen).
- [ ] 5.6 Laptop (B): the top bar has **3D**, **2D** and **Split**. **(by eye)** In Split, both boards show the same position. The phone has only 3D and 2D.
- [ ] 5.7 Laptop (B): in 3D press **Classic set** (bottom right): **(by eye)** the characters become a classic chess set. Press **Armies** to go back.
- [ ] 5.8 Laptop (B): press the **Focus** button (the corner brackets): everything disappears except the board and an exit button, top right. Press that to leave.
- [ ] 5.9 Phone (A): tap **3D**, then press **Focus**. Only the board. Exit, and go back to **2D**.
- [ ] 5.10 Phone (A) plays `a2 → a3`. Then Laptop (B), in 3D: **(by eye)** **drag** the knight `b8 → c6`. It lifts, follows the pointer and lands.
- [ ] 5.11 Leave this game running for Part 6.

## Part 6: Watching, sharing, and coming back (8 min)

Third window (signed out, private window on the laptop)

- [ ] 6.1 Open the site. Under **Live** there is a board captioned "t_alice v t_bob" at its real position. Open it.
- [ ] 6.2 It opens in **3D** with "You are spectating." and a **Share** button. You can switch to 2D.
- [ ] 6.3 Both players' screens and the spectator's now show an eye and **1 watching**. Close the spectator window: within about half a minute the count disappears from the players' screens.

Phone (A): the "stateless" test

- [ ] 6.4 While the game is live, clear the site's data in your browser settings (or open the game link in a browser where you've never signed in), then load the game page. It shows you as signed out.
- [ ] 6.5 Tap **I have a passkey**, confirm. Your account, your username and your side of the game are back, and you can move.

Laptop (B): lock and reload

- [ ] 6.6 Press the **lock** button. The panel offers **Unlock with passkey to keep playing**. Press it: Resign and Offer draw are back.
- [ ] 6.7 Reload the page. It comes back locked (by design). One press unlocks it.
- [ ] 6.8 Press the share button in the panel: on a laptop it **copies the link** ("Link copied. Paste it anywhere."), it does not open a share sheet.
- [ ] 6.9 Finish the game: Black (B) presses **Resign**. **Finished - White wins**. Both withdraw.

## Part 7: Game 5, running out of time (5 min, 3 of them waiting)

Phone (A)

- [ ] 7.1 Create a game: Stake **1**, Clock **3 + 2**, Play as **White**. B joins.
- [ ] 7.2 A plays `e2 → e4`. **B does nothing.** Both clocks are visible; Black's counts down.
- [ ] 7.3 **(by ear)** Under 10 seconds, B hears a low-time warning line.
- [ ] 7.4 At 0:00, B's panel says **You ran out of time** and "t_alice can now claim the win.", with no Resign and no Offer draw. A's panel says "t_bob ran out of time" with one button: **Claim win on timeout**.
- [ ] 7.5 A taps it (no passkey prompt). Result: **Finished - White wins**, White 1.95.
- [ ] 7.6 A withdraws.

## Part 8: Cancel and refund (2 min)

- [ ] 8.1 Note A's balance. A creates a game (1 tUSD).
- [ ] 8.2 A taps **Cancel & Refund**, confirms. "This game was cancelled and refunded." Back on the home page the balance is what it was in 8.1.

## Part 9: Money: the wallet and invites (6 min)

Phone (A)

- [ ] 9.1 Tap your balance. **Your money** opens above everything: the balance, "MON for gas", a QR code and **Copy address**.
- [ ] 9.2 **Invites** shows your link ending `?ref=t_alice` and a **Share** button.
- [ ] 9.3 **Send**: type `t_bob` and `2`. It says "To t_bob. Asks for your passkey." Press Send, confirm. A message says "Send 2 tUSD to t_bob: done". Your balance drops by 2; B's rises by 2.
- [ ] 9.4 Type a name nobody has: "No player has that username." Type your own name: "That's you."

Invite earnings (Player C: a brand-new account in the private window)

- [ ] 9.5 Open A's invite link (`https://test.awaychess.com/?ref=t_alice`) in the private window and sign up as `t_cara`.
- [ ] 9.6 B creates a game (1 tUSD), C joins, one move each, then C presses **Resign**. B withdraws.
- [ ] 9.7 A's wallet now shows **Earned 0.005 tUSD** (20% of C's half of the 0.05 fee) with a **Withdraw** button. Press it and confirm.

## Part 10: Leaderboard and tournaments (12 min)

- [ ] 10.1 Open **Leaderboard**: A, B and C are listed (among the test players) with W D L and a **Won (tUSD)** column. Your own row is marked "(you)". The order is by Won: payouts minus stakes, after fees.

A tournament with a prize pot (A hosts; B and C play)

- [ ] 10.2 A opens **Tournaments**, names it `Test Cup`, Stake per game **1**, Clock **5 + 3**, Prize pot **5**, **Top three: 50 / 30 / 20**, Runs for **1 day**. Presses **Create and pay 5 tUSD**, confirms.
- [ ] 10.3 The page shows "Prize pot 5 tUSD", A in the player list, and **Invite players**. Share or copy the link.
- [ ] 10.4 Press **All tournaments**: `Test Cup` is under **Open**, showing "1 player", "5 tUSD to enter, pot 5 tUSD so far" and "hosted by t_alice". Open it again.
- [ ] 10.5 B and C open the link and press **Join for 5 tUSD**. The pot reads **15 tUSD**.
- [ ] 10.6 C presses **Leave and refund**: the pot drops to 10. C joins again: 15.
- [ ] 10.7 A presses **Start: close entries**. The page says "0 of 3 games played" and lists three games: t_alice v t_bob, t_alice v t_cara, t_bob v t_cara. Your own games have a **Play** button; the other says "To play".
- [ ] 10.8 In the list it has moved to **Running**: "0 of 3 games played · 3 players · pot 15 tUSD · pays out by" tomorrow's date.

Tournament games use a **coin flip** for sides, so nobody can take White every time. In each game below, whoever gets White plays `e2 → e4`, then Black plays `e7 → e5`.

- [ ] 10.9 **A v B.** A presses **Play** and gets a waiting game. B opens the tournament page, presses **Join** on that game, then **Join, coin flip for sides (1 tUSD)**. One move each, then **B resigns**. Back on the tournament page: "1 of 3 games played", the game shows "t_alice won", and A has 1 point.
- [ ] 10.10 **A v C.** C presses **Play**, A joins the same way. One move each, then one offers a draw and the other accepts. A has **1½**, C has **½**.
- [ ] 10.11 **B v C.** B presses **Play**, C joins. One move each, then **C resigns**. B has 1 point.
- [ ] 10.12 "3 of 3 games played", and a **Pay out the prizes** button appears. Anyone presses it and confirms.
- [ ] 10.13 It says "paid out" and the table has a Prize column: **A +7.5** (50%), **B +4.5** (30%), **C +3** (20%). The page says "Finished. t_alice won."
- [ ] 10.14 In the list it is now under **Finished**: "t_alice won +7.5 tUSD · 3 players · 3 of 3 games played", with a **Results** link.

A free tournament

- [ ] 10.15 A creates one with Prize pot **None** (the button reads **Create tournament**; it costs nothing). There is no pot line. B presses **Join the tournament**, A starts it, and they play their one game (one move each, B resigns). The page says "Finished. t_alice won." and the tournament moves to the **Finished** tab with the winner's name.

## Part 11: The other pages (5 min)

- [ ] 11.1 `/sandbox` (laptop): it opens in 3D; press **2D**. Play both sides: `e2 → e4`, `d7 → d5`, `e4 → d5`. White's amount rises from 10 to **10.26** and Black's falls to **9.7436**. **Undo** takes a move back. **New game** resets. **(by eye)** In 3D the pawns change to a different set (rogues, rangers or engineers).
- [ ] 11.2 `/sounds`: **(by ear)** every music track, voice line and effect plays.
- [ ] 11.3 `/credits`: the music, art and voices are listed with their licences.
- [ ] 11.4 **(by ear)** The speaker button in a game silences music, voices and effects at once, and pressing it again brings them back. Holding it on a phone (right-click on a laptop) skips to the next song.
- [ ] 11.5 Scroll to the footer and press **Feedback**. Choose **An idea**, type a sentence, press **Send**: "Sent. Every message is read." and a **Join the Discord** button. The message appears in your Discord channel with your username and the page.
- [ ] 11.6 **(by eye)** Paste a game link into a chat app: the preview shows the Away Chess image and title.

## Part 12: A second phone, if you can (5 min)

- [ ] 12.1 Repeat Part 1 and Part 2 with an Android phone (or an iPhone, whichever you haven't used). Sign-up, one full game, 3D and 2D.
- [ ] 12.2 **(by eye)** 3D is smooth enough to play, characters are sharp, and nothing overlaps or runs off the screen.

---

## What cannot be tested by hand

- **Illegal moves.** The app only lets you make legal moves, so cheating needs modified code. It is covered by the contract tests and by a recorded game on Monad where the referee forfeited the cheater (see `docs/SUBMISSION.md`).
- **Stalemate and other rule draws.** The referee settles them the same way as checkmate; a recorded stalemate is in `docs/SUBMISSION.md`. If you want to see one, the ten-move stalemate is: `e3 a5`, `Qh5 Ra6`, `Qxa5 h5`, `h4 Rah6`, `Qxc7 f6`, `Qxd7+ Kf7`, `Qxb7 Qd3`, `Qxb8 Qh7`, `Qxc8 Kg6`, `Qe6`. Within about 30 seconds: **Finished - Draw**.

## Known limits, not bugs

- Reloading the page locks your account; one tap unlocks it. This is deliberate.
- The watching count is a live head-count, so it starts from zero when the server restarts.
- A checkmate settles only while the referee server is running. If "The referee is settling the game..." stays for more than a minute, tell me.
- Accounts are per web address: an account made on `degen-chess.vercel.app` does not exist on `test.awaychess.com`.
- Everything is test money on Monad testnet.

## After the test

Send me the step numbers that failed with what you saw. When the list is empty: submit, give `test.awaychess.com` to friends, and record the videos.
