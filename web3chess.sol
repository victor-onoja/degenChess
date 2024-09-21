// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { SafeERC20 } from "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/IERC20.sol";

contract Web3Chess {
    using SafeERC20 for IERC20;
    address public owner;
    uint256 public constant FEE_PERCENTAGE = 25;
    uint256 public constant FEE_DENOMINATOR = 1000;

    struct Game {
        address player1;
        address player2;
        uint256 player1Stake;
        uint256 player2Stake;
        bool isActive;
        mapping(uint8 => uint256) piecesValue;
    }

    mapping(uint256 => Game) public games;
    uint256 public gameCount;

    IERC20 public paymentToken;

    event GameCreated(uint256 gameId, address player1);
    event PlayerJoined(uint256 gameId, address player2);
    event PieceTaken(uint256 gameId, address player, uint8 pieceType, uint256 value);
    event GameEnded(uint256 gameId, address winner, uint256 winnerPayout, uint256 loserPayout);

     constructor(address _paymentToken) {
        owner = msg.sender;
        paymentToken = IERC20(_paymentToken);
    }

    function createGame(uint256 _stake) external {
        require(_stake > 0, "Stake must be greater than 0");
        paymentToken.safeTransferFrom(msg.sender, address(this), _stake);

        uint256 gameId = gameCount++;
        Game storage newGame = games[gameId];
        newGame.player1 = msg.sender;
        newGame.player1Stake = _stake;
        newGame.isActive = true;

        // Set initial piece values (simplified for MVP)
        newGame.piecesValue[1] = _stake / 16; // Pawn
        newGame.piecesValue[2] = _stake / 8;  // Knight/Bishop
        newGame.piecesValue[3] = _stake / 8;  // Knight/Bishop
        newGame.piecesValue[4] = _stake / 4;  // Rook
        newGame.piecesValue[5] = _stake / 2;  // Queen
        newGame.piecesValue[6] = _stake / 4;  // King

        emit GameCreated(gameId, msg.sender);
    }

    function joinGame(uint256 _gameId) external {
        Game storage game = games[_gameId];
        require(game.isActive, "Game is not active");
        require(game.player2 == address(0), "Game is full");
        paymentToken.safeTransferFrom(msg.sender, address(this), game.player1Stake);

        game.player2 = msg.sender;
        game.player2Stake = game.player1Stake;

        emit PlayerJoined(_gameId, msg.sender);
    }

    function pieceTaken(uint256 _gameId, address _player, uint8 _pieceType) external {
        Game storage game = games[_gameId];
        require(game.isActive, "Game is not active");
        require(_player == game.player1 || _player == game.player2, "Invalid player");
        
        uint256 pieceValue = game.piecesValue[_pieceType];
        if (_player == game.player1) {
            game.player1Stake += pieceValue;
            game.player2Stake -= pieceValue;
        } else {
            game.player2Stake += pieceValue;
            game.player1Stake -= pieceValue;
        }

        emit PieceTaken(_gameId, _player, _pieceType, pieceValue);
    }

    function endGame(uint256 _gameId, address _winner) external {
        Game storage game = games[_gameId];
        require(game.isActive, "Game is not active");
        require(_winner == game.player1 || _winner == game.player2, "Invalid winner");

        game.isActive = false;

        uint256 totalStake = game.player1Stake + game.player2Stake;
        uint256 fee = (totalStake * FEE_PERCENTAGE) / FEE_DENOMINATOR;
        uint256 winnerPayout = totalStake - fee;

        paymentToken.safeTransfer(owner, fee);
        paymentToken.safeTransfer(_winner, winnerPayout);

        emit GameEnded(_gameId, _winner, winnerPayout, 0);
    }

    function withdraw(uint256 _gameId) external {
        Game storage game = games[_gameId];
        require(!game.isActive, "Game is still active");
        require(msg.sender == game.player1 || msg.sender == game.player2, "Not a player");

        uint256 payout;
        if (msg.sender == game.player1) {
            payout = game.player1Stake;
            game.player1Stake = 0;
        } else {
            payout = game.player2Stake;
            game.player2Stake = 0;
        }

        uint256 fee = (payout * FEE_PERCENTAGE) / FEE_DENOMINATOR;
        uint256 playerPayout = payout - fee;

        paymentToken.safeTransfer(owner, fee);
        paymentToken.safeTransfer(msg.sender, playerPayout);

        emit GameEnded(_gameId, msg.sender, playerPayout, 0);
    }

    function getGameDetails(uint256 _gameId) external view returns (
        address player1,
        address player2,
        uint256 player1Stake,
        uint256 player2Stake,
        bool isActive
    ) {
        Game storage game = games[_gameId];
        return (
            game.player1,
            game.player2,
            game.player1Stake,
            game.player2Stake,
            game.isActive
        );
    }

    function getPieceValue(uint256 _gameId, uint8 _pieceType) external view returns (uint256) {
        return games[_gameId].piecesValue[_pieceType];
    }

    function getLatestGameId() external view returns (uint256) {
        return gameCount > 0 ? gameCount - 1 : 0;
    }
}