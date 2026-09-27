// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title DegenChess
/// @notice Staked chess where every capture moves part of the victim's stake to the capturer.
///         When the game ends the winner takes the loser's balance, except whatever the loser
///         earned through their own captures - so a loser who captured well still gets paid.
///
/// Moves are recorded on-chain (turn enforced), which also lets both clients stay in sync
/// without a backend. The contract tracks the board to account for captures, but does NOT
/// validate full chess legality - clients validate with chess.js and the owner can arbitrate
/// disputes. A checkmated player who refuses to resign loses on timeout.
contract DegenChess is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Open, // created, waiting for an opponent
        Active,
        Finished,
        Cancelled
    }

    enum Result {
        None,
        WhiteWins,
        BlackWins,
        Draw
    }

    struct Game {
        address white; // creator
        address black; // joiner
        uint256 stake; // per player
        uint256 whiteBalance; // stake +/- capture transfers
        uint256 blackBalance;
        uint256 whiteGains; // value won through captures
        uint256 blackGains;
        uint256 board; // 64 squares x 4 bits, square 0 = a1, 63 = h8
        uint64 lastMoveAt;
        Status status;
        Result result;
        address drawOfferedBy;
        bool whiteWithdrawn;
        bool blackWithdrawn;
        uint16[] moves; // from | to << 6 | promotion << 12
    }

    // Piece encoding in a board nibble: low 3 bits = type, bit 3 = black.
    uint8 internal constant PAWN = 1;
    uint8 internal constant KNIGHT = 2;
    uint8 internal constant BISHOP = 3;
    uint8 internal constant ROOK = 4;
    uint8 internal constant QUEEN = 5;
    uint8 internal constant KING = 6;
    uint8 internal constant BLACK = 8;

    /// @dev Sum of piece weights for one side (8 pawns + 2N + 2B + 2R + Q = 8+6+6+10+9).
    ///      Piece values are stake * weight / 39, so one side's pieces are worth exactly its stake.
    uint256 public constant TOTAL_WEIGHT = 39;
    uint256 public constant FEE_PERCENTAGE = 25; // 2.5%
    uint256 public constant FEE_DENOMINATOR = 1000;

    IERC20 public immutable paymentToken;
    address public immutable owner;
    uint256 public immutable moveTimeout;
    uint256 public immutable initialBoard;

    mapping(uint256 => Game) internal games;
    uint256 public gameCount;

    event GameCreated(uint256 indexed gameId, address indexed white, uint256 stake);
    event GameCancelled(uint256 indexed gameId);
    event PlayerJoined(uint256 indexed gameId, address indexed black);
    event MoveMade(uint256 indexed gameId, address indexed player, uint16 move, uint8 captured, uint256 value);
    event DrawOffered(uint256 indexed gameId, address indexed by);
    event GameEnded(uint256 indexed gameId, Result result, uint256 whitePayout, uint256 blackPayout, uint256 fee);
    event Withdrawn(uint256 indexed gameId, address indexed player, uint256 amount);

    error NotOwner();
    error NotPlayer();
    error NotYourTurn();
    error WrongStatus();
    error InvalidStake();
    error InvalidMove();
    error TimeoutNotReached();
    error NoDrawOffer();
    error NothingToWithdraw();

    constructor(address _paymentToken, uint256 _moveTimeout) {
        paymentToken = IERC20(_paymentToken);
        owner = msg.sender;
        moveTimeout = _moveTimeout;
        initialBoard = _buildInitialBoard();
    }

    // ------------------------------------------------------------------ lifecycle

    function createGame(uint256 _stake) external nonReentrant returns (uint256 gameId) {
        // Keeps capture values non-zero and exact-ish; LINK has 18 decimals so this is tiny.
        if (_stake < TOTAL_WEIGHT) revert InvalidStake();
        paymentToken.safeTransferFrom(msg.sender, address(this), _stake);

        gameId = gameCount++;
        Game storage g = games[gameId];
        g.white = msg.sender;
        g.stake = _stake;
        g.whiteBalance = _stake;
        g.status = Status.Open;
        emit GameCreated(gameId, msg.sender, _stake);
    }

    /// @notice Creator can take their stake back while nobody has joined.
    function cancelGame(uint256 _gameId) external nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Open) revert WrongStatus();
        if (msg.sender != g.white) revert NotPlayer();
        g.status = Status.Cancelled;
        uint256 amount = g.whiteBalance;
        g.whiteBalance = 0;
        g.whiteWithdrawn = true;
        emit GameCancelled(_gameId);
        paymentToken.safeTransfer(g.white, amount);
    }

    function joinGame(uint256 _gameId) external nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Open) revert WrongStatus();
        if (msg.sender == g.white) revert NotPlayer();
        paymentToken.safeTransferFrom(msg.sender, address(this), g.stake);

        g.black = msg.sender;
        g.blackBalance = g.stake;
        g.board = initialBoard;
        g.status = Status.Active;
        g.lastMoveAt = uint64(block.timestamp);
        emit PlayerJoined(_gameId, msg.sender);
    }

    // ------------------------------------------------------------------ moves

    /// @param _move from (0-63) | to << 6 | promotion piece type << 12 (0 when not promoting)
    function makeMove(uint256 _gameId, uint16 _move) external {
        Game storage g = games[_gameId];
        if (g.status != Status.Active) revert WrongStatus();
        bool whiteToMove = g.moves.length % 2 == 0;
        if (msg.sender != (whiteToMove ? g.white : g.black)) revert NotYourTurn();

        uint256 from = _move & 63;
        uint256 to = (_move >> 6) & 63;
        uint8 promotion = uint8(_move >> 12);
        if (from == to) revert InvalidMove();

        uint256 board = g.board;
        uint8 piece = _at(board, from);
        uint8 color = whiteToMove ? 0 : BLACK;
        if (piece == 0 || (piece & BLACK) != color) revert InvalidMove();
        uint8 kind = piece & 7;

        uint8 captured = _at(board, to);
        if (captured != 0) {
            if ((captured & BLACK) == color || (captured & 7) == KING) revert InvalidMove();
        }

        if (kind == PAWN) {
            if (captured == 0 && (from % 8) != (to % 8)) {
                // Diagonal pawn move onto an empty square: en passant.
                uint256 epSquare = (from / 8) * 8 + (to % 8);
                captured = _at(board, epSquare);
                if (captured != (PAWN | (BLACK - color))) revert InvalidMove();
                board = _set(board, epSquare, 0);
            }
            bool lastRank = whiteToMove ? to / 8 == 7 : to / 8 == 0;
            if (lastRank) {
                if (promotion < KNIGHT || promotion > QUEEN) revert InvalidMove();
                piece = promotion | color;
            } else if (promotion != 0) {
                revert InvalidMove();
            }
        } else if (promotion != 0) {
            revert InvalidMove();
        }

        if (kind == KING && (from % 8 == 4) && (to / 8 == from / 8) && (to % 8 == 6 || to % 8 == 2)) {
            // Castling: move the rook as well.
            uint256 rank = from / 8;
            (uint256 rookFrom, uint256 rookTo) = to % 8 == 6 ? (rank * 8 + 7, rank * 8 + 5) : (rank * 8, rank * 8 + 3);
            if (_at(board, rookFrom) != (ROOK | color) || captured != 0) revert InvalidMove();
            board = _set(_set(board, rookFrom, 0), rookTo, ROOK | color);
        }

        board = _set(_set(board, from, 0), to, piece);
        g.board = board;
        g.moves.push(_move);
        g.lastMoveAt = uint64(block.timestamp);
        if (g.drawOfferedBy != address(0) && g.drawOfferedBy != msg.sender) {
            g.drawOfferedBy = address(0); // moving declines an outstanding draw offer
        }

        uint256 value;
        if (captured != 0) {
            value = _transferCaptureValue(g, whiteToMove, captured & 7);
        }
        emit MoveMade(_gameId, msg.sender, _move, captured & 7, value);
    }

    // ------------------------------------------------------------------ endings

    function resign(uint256 _gameId) external nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Active) revert WrongStatus();
        if (msg.sender == g.white) _finish(_gameId, Result.BlackWins);
        else if (msg.sender == g.black) _finish(_gameId, Result.WhiteWins);
        else revert NotPlayer();
    }

    /// @notice The player who is NOT on move wins if their opponent stalls past the timeout.
    function claimTimeout(uint256 _gameId) external nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Active) revert WrongStatus();
        bool whiteToMove = g.moves.length % 2 == 0;
        address waiting = whiteToMove ? g.black : g.white;
        if (msg.sender != waiting) revert NotPlayer();
        if (block.timestamp <= g.lastMoveAt + moveTimeout) revert TimeoutNotReached();
        _finish(_gameId, whiteToMove ? Result.BlackWins : Result.WhiteWins);
    }

    function offerDraw(uint256 _gameId) external {
        Game storage g = games[_gameId];
        if (g.status != Status.Active) revert WrongStatus();
        if (msg.sender != g.white && msg.sender != g.black) revert NotPlayer();
        g.drawOfferedBy = msg.sender;
        emit DrawOffered(_gameId, msg.sender);
    }

    function acceptDraw(uint256 _gameId) external nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Active) revert WrongStatus();
        if (msg.sender != g.white && msg.sender != g.black) revert NotPlayer();
        if (g.drawOfferedBy == address(0) || g.drawOfferedBy == msg.sender) revert NoDrawOffer();
        _finish(_gameId, Result.Draw);
    }

    /// @notice Dispute resolution (e.g. an illegal move was submitted by a modified client).
    function arbitrate(uint256 _gameId, Result _result) external nonReentrant {
        if (msg.sender != owner) revert NotOwner();
        if (games[_gameId].status != Status.Active || _result == Result.None) revert WrongStatus();
        _finish(_gameId, _result);
    }

    function withdraw(uint256 _gameId) external nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Finished) revert WrongStatus();
        uint256 amount;
        if (msg.sender == g.white && !g.whiteWithdrawn) {
            g.whiteWithdrawn = true;
            amount = g.whiteBalance;
        } else if (msg.sender == g.black && !g.blackWithdrawn) {
            g.blackWithdrawn = true;
            amount = g.blackBalance;
        }
        if (amount == 0) revert NothingToWithdraw();
        emit Withdrawn(_gameId, msg.sender, amount);
        paymentToken.safeTransfer(msg.sender, amount);
    }

    // ------------------------------------------------------------------ views

    function getGame(uint256 _gameId)
        external
        view
        returns (
            address white,
            address black,
            uint256 stake,
            uint256 whiteBalance,
            uint256 blackBalance,
            Status status,
            Result result,
            address drawOfferedBy,
            uint64 lastMoveAt,
            uint256 moveCount
        )
    {
        Game storage g = games[_gameId];
        return (
            g.white,
            g.black,
            g.stake,
            g.whiteBalance,
            g.blackBalance,
            g.status,
            g.result,
            g.drawOfferedBy,
            g.lastMoveAt,
            g.moves.length
        );
    }

    function getMoves(uint256 _gameId) external view returns (uint16[] memory) {
        return games[_gameId].moves;
    }

    function getBoard(uint256 _gameId) external view returns (uint256) {
        return games[_gameId].board;
    }

    function getWithdrawn(uint256 _gameId) external view returns (bool white, bool black) {
        Game storage g = games[_gameId];
        return (g.whiteWithdrawn, g.blackWithdrawn);
    }

    function pieceValue(uint256 _gameId, uint8 _pieceType) public view returns (uint256) {
        return (games[_gameId].stake * _weight(_pieceType)) / TOTAL_WEIGHT;
    }

    // ------------------------------------------------------------------ internals

    function _transferCaptureValue(Game storage g, bool whiteCaptured, uint8 kind) internal returns (uint256 value) {
        value = (g.stake * _weight(kind)) / TOTAL_WEIGHT;
        // Promoted pieces can push a side's total value above its stake, so cap at the balance.
        if (whiteCaptured) {
            if (value > g.blackBalance) value = g.blackBalance;
            g.blackBalance -= value;
            g.whiteBalance += value;
            g.whiteGains += value;
        } else {
            if (value > g.whiteBalance) value = g.whiteBalance;
            g.whiteBalance -= value;
            g.blackBalance += value;
            g.blackGains += value;
        }
    }

    function _finish(uint256 _gameId, Result _result) internal {
        Game storage g = games[_gameId];
        g.status = Status.Finished;
        g.result = _result;
        g.drawOfferedBy = address(0);

        uint256 whiteBal = g.whiteBalance;
        uint256 blackBal = g.blackBalance;
        uint256 total = whiteBal + blackBal;

        // Winner takes everything except what the loser earned through captures.
        if (_result == Result.WhiteWins) {
            uint256 keep = g.blackGains < blackBal ? g.blackGains : blackBal;
            whiteBal += blackBal - keep;
            blackBal = keep;
        } else if (_result == Result.BlackWins) {
            uint256 keep = g.whiteGains < whiteBal ? g.whiteGains : whiteBal;
            blackBal += whiteBal - keep;
            whiteBal = keep;
        }

        uint256 fee = (total * FEE_PERCENTAGE) / FEE_DENOMINATOR;
        uint256 whitePayout = (whiteBal * (total - fee)) / total;
        uint256 blackPayout = (blackBal * (total - fee)) / total;
        fee = total - whitePayout - blackPayout; // rounding dust goes to the fee, nothing gets stuck

        g.whiteBalance = whitePayout;
        g.blackBalance = blackPayout;
        emit GameEnded(_gameId, _result, whitePayout, blackPayout, fee);
        if (fee > 0) paymentToken.safeTransfer(owner, fee);
    }

    function _weight(uint8 kind) internal pure returns (uint256) {
        if (kind == PAWN) return 1;
        if (kind == KNIGHT || kind == BISHOP) return 3;
        if (kind == ROOK) return 5;
        if (kind == QUEEN) return 9;
        return 0;
    }

    function _at(uint256 board, uint256 square) internal pure returns (uint8) {
        return uint8((board >> (square * 4)) & 0xF);
    }

    function _set(uint256 board, uint256 square, uint8 piece) internal pure returns (uint256) {
        uint256 shift = square * 4;
        return (board & ~(uint256(0xF) << shift)) | (uint256(piece) << shift);
    }

    function _buildInitialBoard() internal pure returns (uint256 board) {
        uint8[8] memory back = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
        for (uint256 f = 0; f < 8; f++) {
            board = _set(board, f, back[f]);
            board = _set(board, 8 + f, PAWN);
            board = _set(board, 48 + f, PAWN | BLACK);
            board = _set(board, 56 + f, back[f] | BLACK);
        }
    }
}
