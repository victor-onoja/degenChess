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
        mapping(address => uint256[16]) remainingPieces;
    }

    mapping(uint256 => Game) public games;
    uint256 public gameCount;

    IERC20 public paymentToken;

     constructor(address _paymentToken) {
        owner = msg.sender;
        paymentToken = IERC20(_paymentToken);
    }

    function getInitialPieces() internal pure returns (uint256[16] memory) {
        return [
            uint256(4), 2, 3, 5, 6, 3, 2, 4, // Main pieces
            1, 1, 1, 1, 1, 1, 1, 1  // Pawns
        ];
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

    uint256[16] memory initialPieces = getInitialPieces();
        for (uint8 i = 0; i < 16; i++) {
            newGame.remainingPieces[msg.sender][i] = initialPieces[i];
        }

    }

    function joinGame(uint256 _gameId) external {
        Game storage game = games[_gameId];
        require(game.isActive, "Game is not active");
        require(game.player2 == address(0), "Game is full");
        paymentToken.safeTransferFrom(msg.sender, address(this), game.player1Stake);

        game.player2 = msg.sender;
        game.player2Stake = game.player1Stake;

    uint256[16] memory initialPieces = getInitialPieces();
        for (uint8 i = 0; i < 16; i++) {
            game.remainingPieces[msg.sender][i] = initialPieces[i];
        }
    }

    function pieceTaken(uint256 _gameId, address _player, uint8 _pieceType) external {
        Game storage game = games[_gameId];
        require(game.isActive, "Game is not active");
        require(_player == game.player1 || _player == game.player2, "Invalid player");
        
        uint256 pieceValue = game.piecesValue[_pieceType];
        address opponent = _player == game.player1 ? game.player2 : game.player1;

        // Remove the piece from the opponent's remaining pieces
        bool pieceRemoved = false;
        for (uint8 i = 0; i < 16; i++) {
            if (game.remainingPieces[opponent][i] == _pieceType) {
                game.remainingPieces[opponent][i] = 0;
                pieceRemoved = true;
                break;
            }
        }
        require(pieceRemoved, "Piece not found in opponent's remaining pieces");
        if (_player == game.player1) {
            game.player1Stake += pieceValue;
            game.player2Stake -= pieceValue;
        } else {
            game.player2Stake += pieceValue;
            game.player1Stake -= pieceValue;
        }
    }

    function endGame(uint256 _gameId, address _winner) external {
        Game storage game = games[_gameId];
        require(game.isActive, "Game is not active");
        require(_winner == game.player1 || _winner == game.player2, "Invalid winner");

        game.isActive = false;

        address loser = _winner == game.player1 ? game.player2 : game.player1;

        // Calculate the value of all remaining pieces of the loser
        uint256 remainingValue = 0;
        for (uint8 i = 0; i < 16; i++) {
            uint8 pieceType = uint8(game.remainingPieces[loser][i]);
            if (pieceType > 0) {
                remainingValue += game.piecesValue[pieceType];
            }
        }

        // Transfer the remaining value from loser to winner
        if (_winner == game.player1) {
            game.player1Stake += remainingValue;
            game.player2Stake -= remainingValue;
        } else {
            game.player2Stake += remainingValue;
            game.player1Stake -= remainingValue;
        }

        // Calculate fee
        uint256 totalStake = game.player1Stake + game.player2Stake;
        uint256 fee = (totalStake * FEE_PERCENTAGE) / FEE_DENOMINATOR;
    
        // Deduct fee from total stake
        uint256 remainingStake = totalStake - fee;
    
        // Transfer fee to contract owner
        paymentToken.safeTransfer(owner, fee);

        // Update final stakes
        game.player1Stake = (game.player1Stake * remainingStake) / totalStake;
        game.player2Stake = (game.player2Stake * remainingStake) / totalStake;
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

        require(payout > 0, "No balance to withdraw");

        paymentToken.safeTransfer(msg.sender, payout);
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

    function getRemainingPieces(uint256 _gameId, address _player) external view returns (uint256[16] memory) {
        return games[_gameId].remainingPieces[_player];
    }

    function getLatestGameId() external view returns (uint256) {
        return gameCount > 0 ? gameCount - 1 : 0;
    }
}