// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChessMoves {
    function makeMove(uint256 gameId, uint16 move) external;
    function offerDraw(uint256 gameId) external;
}

/// @dev Test only: a "game key" that calls back into the game the moment it is sent MON, to try to
///      act while `joinGame` or `setGameKey` is still running.
contract ReentrantKey {
    IChessMoves public immutable chess;
    uint256 public gameId;
    uint16 public move;
    bool public tried;
    bool public movedDuringCall;
    bool public offeredDuringCall;

    constructor(address _chess) {
        chess = IChessMoves(_chess);
    }

    function aim(uint256 _gameId, uint16 _move) external {
        gameId = _gameId;
        move = _move;
    }

    receive() external payable {
        tried = true;
        try chess.makeMove(gameId, move) {
            movedDuringCall = true;
        } catch {}
        try chess.offerDraw(gameId) {
            offeredDuringCall = true;
        } catch {}
    }
}
