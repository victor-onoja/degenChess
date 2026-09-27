const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox-viem/network-helpers");
const { parseEther, getAddress } = require("viem");
const { Chess } = require("chess.js");

const STAKE = parseEther("10");
const TIMEOUT = 3600n;

const PROMO = { n: 2, b: 3, r: 4, q: 5 };
const TYPE_CHAR = ["", "p", "n", "b", "r", "q", "k"];

const squareIndex = (sq) => (Number(sq[1]) - 1) * 8 + (sq.charCodeAt(0) - 97);
const encodeMove = (m) => squareIndex(m.from) | (squareIndex(m.to) << 6) | ((m.promotion ? PROMO[m.promotion] : 0) << 12);

/** Contract board (64 x 4 bits) -> same shape as chess.js board() output. */
function decodeBoard(board) {
  const rows = [];
  for (let rank = 7; rank >= 0; rank--) {
    const row = [];
    for (let file = 0; file < 8; file++) {
      const nibble = Number((board >> BigInt((rank * 8 + file) * 4)) & 0xfn);
      row.push(nibble === 0 ? null : { type: TYPE_CHAR[nibble & 7], color: nibble & 8 ? "b" : "w" });
    }
    rows.push(row);
  }
  return rows;
}
const simplify = (b) => b.map((r) => r.map((p) => (p ? p.color + p.type : null)));

/** Deterministic PRNG so random games are reproducible. */
function rng(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

async function deployFixture() {
  const [owner, white, black, stranger] = await hre.viem.getWalletClients();
  const link = await hre.viem.deployContract("MockLINK");
  const chess = await hre.viem.deployContract("DegenChess", [link.address, TIMEOUT]);
  for (const w of [white, black, stranger]) {
    await link.write.mint([w.account.address, parseEther("1000")]);
    await link.write.approve([chess.address, parseEther("1000")], { account: w.account });
  }
  const as = (wallet) => ({ account: wallet.account });
  return { owner, white, black, stranger, link, chess, as };
}

async function activeGameFixture() {
  const f = await deployFixture();
  await f.chess.write.createGame([STAKE], f.as(f.white));
  await f.chess.write.joinGame([0n], f.as(f.black));
  return f;
}

async function playSan(f, sans, game = new Chess()) {
  for (const san of sans) {
    const m = game.move(san);
    await f.chess.write.makeMove([0n, encodeMove(m)], f.as(m.color === "w" ? f.white : f.black));
  }
  return game;
}

const gameInfo = async (chess, id = 0n) => {
  const [white, black, stake, whiteBalance, blackBalance, status, result, drawOfferedBy, lastMoveAt, moveCount] =
    await chess.read.getGame([id]);
  return { white, black, stake, whiteBalance, blackBalance, status, result, drawOfferedBy, lastMoveAt, moveCount };
};

describe("DegenChess", () => {
  describe("lifecycle", () => {
    it("creates, joins and escrows both stakes", async () => {
      const f = await loadFixture(activeGameFixture);
      const g = await gameInfo(f.chess);
      expect(g.white).to.equal(getAddress(f.white.account.address));
      expect(g.black).to.equal(getAddress(f.black.account.address));
      expect(g.status).to.equal(2); // Active
      expect(await f.link.read.balanceOf([f.chess.address])).to.equal(STAKE * 2n);
    });

    it("lets the creator cancel an unjoined game for a full refund", async () => {
      const f = await loadFixture(deployFixture);
      const before = await f.link.read.balanceOf([f.white.account.address]);
      await f.chess.write.createGame([STAKE], f.as(f.white));
      await expect(f.chess.write.cancelGame([0n], f.as(f.black))).to.be.rejectedWith("NotPlayer");
      await f.chess.write.cancelGame([0n], f.as(f.white));
      expect(await f.link.read.balanceOf([f.white.account.address])).to.equal(before);
      await expect(f.chess.write.joinGame([0n], f.as(f.black))).to.be.rejectedWith("WrongStatus");
    });

    it("rejects joining your own game, a full game, or a tiny stake", async () => {
      const f = await loadFixture(deployFixture);
      await expect(f.chess.write.createGame([1n], f.as(f.white))).to.be.rejectedWith("InvalidStake");
      await f.chess.write.createGame([STAKE], f.as(f.white));
      await expect(f.chess.write.joinGame([0n], f.as(f.white))).to.be.rejectedWith("NotPlayer");
      await f.chess.write.joinGame([0n], f.as(f.black));
      await expect(f.chess.write.joinGame([0n], f.as(f.stranger))).to.be.rejectedWith("WrongStatus");
    });
  });

  describe("moves", () => {
    it("enforces turn order and piece ownership", async () => {
      const f = await loadFixture(activeGameFixture);
      const e4 = encodeMove({ from: "e2", to: "e4" });
      await expect(f.chess.write.makeMove([0n, e4], f.as(f.black))).to.be.rejectedWith("NotYourTurn");
      await expect(f.chess.write.makeMove([0n, e4], f.as(f.stranger))).to.be.rejectedWith("NotYourTurn");
      // White trying to move a black pawn / an empty square.
      await expect(
        f.chess.write.makeMove([0n, encodeMove({ from: "e7", to: "e5" })], f.as(f.white))
      ).to.be.rejectedWith("InvalidMove");
      await expect(
        f.chess.write.makeMove([0n, encodeMove({ from: "e4", to: "e5" })], f.as(f.white))
      ).to.be.rejectedWith("InvalidMove");
      await f.chess.write.makeMove([0n, e4], f.as(f.white));
      await expect(f.chess.write.makeMove([0n, e4], f.as(f.white))).to.be.rejectedWith("NotYourTurn");
    });

    it("tracks en passant, promotion, castling and captures exactly like chess.js", async () => {
      const f = await loadFixture(activeGameFixture);
      const game = await playSan(
        f,
        "e4 a6 e5 d5 exd6 Nf6 dxc7 Qd7 cxb8=Q Rxb8 Nc3 b5 d3 e6 Be3 Bc5 Qd2 O-O O-O-O Bxe3 Qxe3 Qd4 Qxd4".split(" ")
      );
      expect(simplify(decodeBoard(await f.chess.read.getBoard([0n])))).to.deep.equal(simplify(game.board()));

      // Balances: white captured d-pawn (ep), c-pawn, b8 knight, bishop, queen; black captured the promoted queen and a bishop.
      const g = await gameInfo(f.chess);
      expect(g.whiteBalance + g.blackBalance).to.equal(STAKE * 2n);
      const v = (w) => (STAKE * w) / 39n;
      const whiteGain = v(1n) + v(1n) + v(3n) + v(3n) + v(9n);
      const blackGain = v(9n) + v(3n);
      expect(g.whiteBalance).to.equal(STAKE + whiteGain - blackGain);
    });

    it("stays in sync with chess.js over random legal games", async function () {
      this.timeout(120_000);
      for (let seed = 1; seed <= 6; seed++) {
        const f = await deployFixture();
        await f.chess.write.createGame([STAKE], f.as(f.white));
        await f.chess.write.joinGame([0n], f.as(f.black));
        const rand = rng(seed * 7919);
        const game = new Chess();
        for (let ply = 0; ply < 200 && !game.isGameOver(); ply++) {
          const moves = game.moves({ verbose: true });
          // Prefer captures/promotions so the test exercises the accounting paths.
          const spicy = moves.filter((m) => m.captured || m.promotion);
          const pool = spicy.length && rand() < 0.6 ? spicy : moves;
          const m = pool[Math.floor(rand() * pool.length)];
          game.move(m);
          await f.chess.write.makeMove([0n, encodeMove(m)], f.as(m.color === "w" ? f.white : f.black));
          if (m.captured) {
            const before = await gameInfo(f.chess, 0n);
            const moverBalance = m.color === "w" ? before.whiteBalance : before.blackBalance;
            expect(moverBalance > 0n).to.equal(true);
            expect(before.whiteBalance + before.blackBalance).to.equal(STAKE * 2n);
          }
        }
        expect(simplify(decodeBoard(await f.chess.read.getBoard([0n]))), `seed ${seed}`).to.deep.equal(
          simplify(game.board())
        );
        const g = await gameInfo(f.chess);
        expect(g.whiteBalance + g.blackBalance).to.equal(STAKE * 2n);

        // Settle and make sure every token leaves the contract.
        await f.chess.write.resign([0n], f.as(game.turn() === "w" ? f.white : f.black));
        const after = await gameInfo(f.chess);
        if (after.whiteBalance > 0n) await f.chess.write.withdraw([0n], f.as(f.white));
        if (after.blackBalance > 0n) await f.chess.write.withdraw([0n], f.as(f.black));
        expect(await f.link.read.balanceOf([f.chess.address]), `seed ${seed}`).to.equal(0n);
      }
    });
  });

  describe("settlement", () => {
    it("pays the winner, lets the loser keep their capture gains, and takes a 2.5% fee", async () => {
      const f = await loadFixture(activeGameFixture);
      // White wins a pawn and a knight; black wins a knight.
      await playSan(f, "e4 d5 exd5 Nf6 Nc3 Nxd5 Nxd5 Qxd5".split(" "));
      // white captured: p(1) + n(3); black captured: n(3); black's queen then took the knight: n(3)
      const v = (w) => (STAKE * w) / 39n;
      const blackGains = v(3n) + v(3n);
      await f.chess.write.resign([0n], f.as(f.white)); // black wins

      const total = STAKE * 2n;
      const fee = (total * 25n) / 1000n;
      const g = await gameInfo(f.chess);
      expect(g.status).to.equal(3); // Finished
      expect(g.result).to.equal(2); // BlackWins
      const whiteGains = v(1n) + v(3n);
      expect(g.whiteBalance).to.equal((whiteGains * (total - fee)) / total);
      expect(g.whiteBalance + g.blackBalance + fee <= total).to.equal(true);
      expect(blackGains > 0n).to.equal(true);

      const ownerBal = await f.link.read.balanceOf([f.owner.account.address]);
      expect(ownerBal).to.equal(total - g.whiteBalance - g.blackBalance);
      expect(ownerBal - fee <= 1n).to.equal(true);

      await f.chess.write.withdraw([0n], f.as(f.white));
      await f.chess.write.withdraw([0n], f.as(f.black));
      await expect(f.chess.write.withdraw([0n], f.as(f.black))).to.be.rejectedWith("NothingToWithdraw");
      await expect(f.chess.write.withdraw([0n], f.as(f.stranger))).to.be.rejectedWith("NothingToWithdraw");
      expect(await f.link.read.balanceOf([f.chess.address])).to.equal(0n);
    });

    it("regression: ending after heavy captures never reverts (old contract underflowed)", async () => {
      const f = await loadFixture(activeGameFixture);
      await playSan(f, "e4 d5 exd5 Qxd5 Nc3 Qxg2 Bxg2 Bh3 Bxh3 Nc6 Bd7+ Kxd7 Qg4+ e6 Qxg7 Bxg7".split(" "));
      await f.chess.write.resign([0n], f.as(f.black));
      const g = await gameInfo(f.chess);
      expect(g.result).to.equal(1); // WhiteWins
      await f.chess.write.withdraw([0n], f.as(f.white));
      if (g.blackBalance > 0n) await f.chess.write.withdraw([0n], f.as(f.black));
      expect(await f.link.read.balanceOf([f.chess.address])).to.equal(0n);
    });

    it("draw by agreement keeps capture-adjusted balances", async () => {
      const f = await loadFixture(activeGameFixture);
      await expect(f.chess.write.acceptDraw([0n], f.as(f.black))).to.be.rejectedWith("NoDrawOffer");
      await f.chess.write.offerDraw([0n], f.as(f.white));
      await expect(f.chess.write.acceptDraw([0n], f.as(f.white))).to.be.rejectedWith("NoDrawOffer");
      await expect(f.chess.write.offerDraw([0n], f.as(f.stranger))).to.be.rejectedWith("NotPlayer");
      await f.chess.write.acceptDraw([0n], f.as(f.black));
      const g = await gameInfo(f.chess);
      expect(g.result).to.equal(3); // Draw
      expect(g.whiteBalance).to.equal(g.blackBalance);
    });

    it("making a move declines the opponent's draw offer", async () => {
      const f = await loadFixture(activeGameFixture);
      await f.chess.write.offerDraw([0n], f.as(f.black));
      await playSan(f, ["e4"]);
      await expect(f.chess.write.acceptDraw([0n], f.as(f.white))).to.be.rejectedWith("NoDrawOffer");
    });

    it("lets the waiting player claim a win on timeout, not before", async () => {
      const f = await loadFixture(activeGameFixture);
      await playSan(f, ["e4"]); // black to move
      await expect(f.chess.write.claimTimeout([0n], f.as(f.white))).to.be.rejectedWith("TimeoutNotReached");
      await expect(f.chess.write.claimTimeout([0n], f.as(f.black))).to.be.rejectedWith("NotPlayer");
      await time.increase(Number(TIMEOUT) + 1);
      await expect(f.chess.write.claimTimeout([0n], f.as(f.black))).to.be.rejectedWith("NotPlayer");
      await f.chess.write.claimTimeout([0n], f.as(f.white));
      expect((await gameInfo(f.chess)).result).to.equal(1); // WhiteWins
    });

    it("only the owner can arbitrate, and nobody can end a game they are not in", async () => {
      const f = await loadFixture(activeGameFixture);
      await expect(f.chess.write.arbitrate([0n, 1], f.as(f.white))).to.be.rejectedWith("NotOwner");
      await expect(f.chess.write.resign([0n], f.as(f.stranger))).to.be.rejectedWith("NotPlayer");
      await f.chess.write.arbitrate([0n, 2], f.as(f.owner));
      expect((await gameInfo(f.chess)).result).to.equal(2);
      await expect(f.chess.write.makeMove([0n, encodeMove({ from: "e2", to: "e4" })], f.as(f.white))).to.be.rejectedWith(
        "WrongStatus"
      );
    });
  });
});
