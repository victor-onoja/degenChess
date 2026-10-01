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
/// validate full chess legality. A Chainlink CRE workflow replays every game off-chain and settles it
/// through the arbiter: checkmates and rule draws are declared automatically and an illegal move
/// forfeits the game. The owner can arbitrate as a fallback, and a stalled game ends on timeout.
///
/// Game keys: each player may register a second address (a prompt-free session key held in the
/// browser) that can play for them - move, offer/accept draws, claim timeouts - but can never
/// resign, cancel or withdraw. Money actions always need the player's own key.
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
        address whiteKey; // optional game keys (see contract docs)
        address blackKey;
        uint256 stake; // per player
        uint256 whiteBalance; // stake +/- capture transfers
        uint256 blackBalance;
        uint256 whiteGains; // value won through captures
        uint256 blackGains;
        uint256 board; // 64 squares x 4 bits, square 0 = a1, 63 = h8
        uint64 lastMoveAt;
        // Chess clock, in seconds. clockBase == 0 means no clock: each move just has `moveTimeout`.
        uint32 clockBase;
        uint32 clockIncrement; // added to a player's clock after each of their moves
        uint32 whiteTime; // time left when that player's turn last started
        uint32 blackTime;
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
    /// @notice Optional second arbiter: the Chainlink CRE referee contract that settles games automatically.
    address public arbiter;
    /// @notice Fees collected at settlement, waiting for the owner to withdraw them.
    uint256 public accruedFees;
    uint256 public immutable moveTimeout;
    uint256 public immutable initialBoard;

    mapping(uint256 => Game) internal games;
    uint256 public gameCount;

    event GameCreated(uint256 indexed gameId, address indexed white, uint256 stake);
    event GameCancelled(uint256 indexed gameId);
    event PlayerJoined(uint256 indexed gameId, address indexed black);
    event GameKeySet(uint256 indexed gameId, address indexed player, address key);
    event MoveMade(uint256 indexed gameId, address indexed player, uint16 move, uint8 captured, uint256 value);
    event DrawOffered(uint256 indexed gameId, address indexed by);
    event GameEnded(uint256 indexed gameId, Result result, uint256 whitePayout, uint256 blackPayout, uint256 fee);
    event Withdrawn(uint256 indexed gameId, address indexed player, uint256 amount);
    event ArbiterSet(address indexed arbiter);
    event Arbitrated(uint256 indexed gameId, address indexed by, Result result, bool forfeit);

    error NotOwner();
    error NotPlayer();
    error NotYourTurn();
    error WrongStatus();
    error InvalidStake();
    error InvalidMove();
    error TimeoutNotReached();
    error TimeExpired();
    error NoDrawOffer();
    error NothingToWithdraw();
    error GasForwardFailed();

    constructor(address _paymentToken, uint256 _moveTimeout) {
        paymentToken = IERC20(_paymentToken);
        owner = msg.sender;
        moveTimeout = _moveTimeout;
        initialBoard = _buildInitialBoard();
    }

    // ------------------------------------------------------------------ lifecycle

    /// @param _gameKey optional session key allowed to play for the creator (address(0) for none).
    ///        Any MON sent is forwarded to it to pay for its moves.
    /// @param _clockSeconds Thinking time per player for the whole game (0 = no clock).
    /// @param _incrementSeconds Added to a player's clock after each move they make.
    function createGame(uint256 _stake, address _gameKey, uint32 _clockSeconds, uint32 _incrementSeconds)
        external
        payable
        nonReentrant
        returns (uint256 gameId)
    {
        // Keeps capture values non-zero and exact-ish; LINK has 18 decimals so this is tiny.
        if (_stake < TOTAL_WEIGHT) revert InvalidStake();
        paymentToken.safeTransferFrom(msg.sender, address(this), _stake);

        gameId = gameCount++;
        Game storage g = games[gameId];
        g.white = msg.sender;
        g.stake = _stake;
        g.whiteBalance = _stake;
        g.clockBase = _clockSeconds;
        g.clockIncrement = _incrementSeconds;
        g.status = Status.Open;
        emit GameCreated(gameId, msg.sender, _stake);
        _setKey(g, gameId, _gameKey);
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

    function joinGame(uint256 _gameId, address _gameKey) external payable nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Open) revert WrongStatus();
        if (msg.sender == g.white) revert NotPlayer();
        paymentToken.safeTransferFrom(msg.sender, address(this), g.stake);

        g.black = msg.sender;
        g.blackBalance = g.stake;
        g.board = initialBoard;
        g.status = Status.Active;
        g.lastMoveAt = uint64(block.timestamp);
        g.whiteTime = g.clockBase;
        g.blackTime = g.clockBase;
        emit PlayerJoined(_gameId, msg.sender);
        _setKey(g, _gameId, _gameKey);
    }

    /// @notice Replace (or revoke with address(0)) your game key, e.g. after switching devices.
    function setGameKey(uint256 _gameId, address _gameKey) external payable nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Open && g.status != Status.Active) revert WrongStatus();
        if (msg.sender != g.white && msg.sender != g.black) revert NotPlayer();
        _setKey(g, _gameId, _gameKey);
    }

    // ------------------------------------------------------------------ moves

    /// @param _move from (0-63) | to << 6 | promotion piece type << 12 (0 when not promoting)
    function makeMove(uint256 _gameId, uint16 _move) external {
        Game storage g = games[_gameId];
        if (g.status != Status.Active) revert WrongStatus();
        bool whiteToMove = g.moves.length % 2 == 0;
        address mover = _playerFor(g, msg.sender);
        if (mover == address(0) || mover != (whiteToMove ? g.white : g.black)) revert NotYourTurn();

        if (g.clockBase != 0) {
            // Charge the mover for the time since the previous move; a fallen flag can't move.
            uint256 elapsed = block.timestamp - g.lastMoveAt;
            uint32 left = whiteToMove ? g.whiteTime : g.blackTime;
            if (elapsed >= left) revert TimeExpired();
            left = uint32(left - elapsed) + g.clockIncrement;
            if (whiteToMove) g.whiteTime = left;
            else g.blackTime = left;
        }

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
        if (g.drawOfferedBy != address(0) && g.drawOfferedBy != mover) {
            g.drawOfferedBy = address(0); // moving declines an outstanding draw offer
        }

        uint256 value;
        if (captured != 0) {
            value = _transferCaptureValue(g, whiteToMove, captured & 7);
        }
        emit MoveMade(_gameId, mover, _move, captured & 7, value);
    }

    // ------------------------------------------------------------------ endings

    function resign(uint256 _gameId) external nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Active) revert WrongStatus();
        if (msg.sender == g.white) _finish(_gameId, Result.BlackWins, false);
        else if (msg.sender == g.black) _finish(_gameId, Result.WhiteWins, false);
        else revert NotPlayer();
    }

    /// @notice The player who is NOT on move wins if their opponent stalls past the timeout.
    function claimTimeout(uint256 _gameId) external nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Active) revert WrongStatus();
        bool whiteToMove = g.moves.length % 2 == 0;
        address waiting = whiteToMove ? g.black : g.white;
        if (_playerFor(g, msg.sender) != waiting) revert NotPlayer();
        uint256 limit = g.clockBase != 0 ? (whiteToMove ? g.whiteTime : g.blackTime) : moveTimeout;
        if (block.timestamp < g.lastMoveAt + limit) revert TimeoutNotReached();
        _finish(_gameId, whiteToMove ? Result.BlackWins : Result.WhiteWins, false);
    }

    function offerDraw(uint256 _gameId) external {
        Game storage g = games[_gameId];
        if (g.status != Status.Active) revert WrongStatus();
        address player = _playerFor(g, msg.sender);
        if (player == address(0)) revert NotPlayer();
        g.drawOfferedBy = player;
        emit DrawOffered(_gameId, player);
    }

    function acceptDraw(uint256 _gameId) external nonReentrant {
        Game storage g = games[_gameId];
        if (g.status != Status.Active) revert WrongStatus();
        address player = _playerFor(g, msg.sender);
        if (player == address(0)) revert NotPlayer();
        if (g.drawOfferedBy == address(0) || g.drawOfferedBy == player) revert NoDrawOffer();
        _finish(_gameId, Result.Draw, false);
    }

    /// @notice Settles a game from outside it: the referee declaring checkmate or a rule draw, or
    ///         penalising an illegal move submitted by a modified client.
    /// @param _forfeit The loser keeps nothing, not even capture gains. Used for cheating, where the
    ///        "gains" may themselves come from illegal captures.
    function arbitrate(uint256 _gameId, Result _result, bool _forfeit) external nonReentrant {
        if (msg.sender != owner && msg.sender != arbiter) revert NotOwner();
        if (games[_gameId].status != Status.Active || _result == Result.None) revert WrongStatus();
        emit Arbitrated(_gameId, msg.sender, _result, _forfeit);
        _finish(_gameId, _result, _forfeit);
    }

    function setArbiter(address _arbiter) external {
        if (msg.sender != owner) revert NotOwner();
        arbiter = _arbiter;
        emit ArbiterSet(_arbiter);
    }

    /// @notice Fees accrue instead of being pushed at settlement, so a failing transfer to the owner
    ///         can never block a game from finishing.
    function withdrawFees() external nonReentrant {
        if (msg.sender != owner) revert NotOwner();
        uint256 amount = accruedFees;
        accruedFees = 0;
        paymentToken.safeTransfer(owner, amount);
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

    function getGameKeys(uint256 _gameId) external view returns (address whiteKey, address blackKey) {
        Game storage g = games[_gameId];
        return (g.whiteKey, g.blackKey);
    }

    /// @return base 0 when the game has no clock. whiteTime/blackTime are as of that player's last turn start;
    ///         subtract (now - lastMoveAt) for the side to move.
    function getClock(uint256 _gameId) external view returns (uint32 base, uint32 increment, uint32 whiteTime, uint32 blackTime) {
        Game storage g = games[_gameId];
        return (g.clockBase, g.clockIncrement, g.whiteTime, g.blackTime);
    }

    function getWithdrawn(uint256 _gameId) external view returns (bool white, bool black) {
        Game storage g = games[_gameId];
        return (g.whiteWithdrawn, g.blackWithdrawn);
    }

    function pieceValue(uint256 _gameId, uint8 _pieceType) public view returns (uint256) {
        return (games[_gameId].stake * _weight(_pieceType)) / TOTAL_WEIGHT;
    }

    // ------------------------------------------------------------------ internals

    /// @dev The player `_sender` acts for: themselves, or the player whose game key it is.
    function _playerFor(Game storage g, address _sender) internal view returns (address) {
        if (_sender == g.white || _sender == g.black) return _sender;
        if (_sender != address(0) && _sender == g.whiteKey) return g.white;
        if (_sender != address(0) && _sender == g.blackKey) return g.black;
        return address(0);
    }

    /// @dev Registers msg.sender's game key and forwards any attached MON to it for gas.
    function _setKey(Game storage g, uint256 _gameId, address _key) internal {
        if (_key == g.white || _key == g.black) _key = address(0); // a player's own address is not a key
        if (msg.sender == g.white) g.whiteKey = _key;
        else g.blackKey = _key;
        emit GameKeySet(_gameId, msg.sender, _key);
        if (msg.value > 0) {
            if (_key == address(0)) revert GasForwardFailed();
            (bool ok,) = _key.call{value: msg.value}("");
            if (!ok) revert GasForwardFailed();
        }
    }

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

    function _finish(uint256 _gameId, Result _result, bool _forfeit) internal {
        Game storage g = games[_gameId];
        g.status = Status.Finished;
        g.result = _result;
        g.drawOfferedBy = address(0);

        uint256 whiteBal = g.whiteBalance;
        uint256 blackBal = g.blackBalance;
        uint256 total = whiteBal + blackBal;

        // Winner takes everything except what the loser earned through captures.
        if (_result == Result.WhiteWins) {
            uint256 keep = _forfeit ? 0 : (g.blackGains < blackBal ? g.blackGains : blackBal);
            whiteBal += blackBal - keep;
            blackBal = keep;
        } else if (_result == Result.BlackWins) {
            uint256 keep = _forfeit ? 0 : (g.whiteGains < whiteBal ? g.whiteGains : whiteBal);
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
        accruedFees += fee;
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
