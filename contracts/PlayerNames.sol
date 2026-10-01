// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PlayerNames
/// @notice Unique usernames for player addresses. Independent of any one game contract, so names
///         survive redeployments and can be shared by other games.
contract PlayerNames {
    mapping(address => string) public nameOf;
    mapping(bytes32 => address) public ownerOfName;

    event NameSet(address indexed player, string name);

    error InvalidName();
    error NameTaken();

    /// @notice Claim or change your name: 3-16 characters from a-z, 0-9 and underscore.
    ///         Lowercase only, so "Victor" and "victor" can't both exist.
    function setName(string calldata _name) external {
        bytes memory b = bytes(_name);
        if (b.length < 3 || b.length > 16) revert InvalidName();
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool ok = (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c == 0x5f;
            if (!ok) revert InvalidName();
        }
        bytes32 key = keccak256(b);
        address holder = ownerOfName[key];
        if (holder != address(0) && holder != msg.sender) revert NameTaken();

        bytes memory old = bytes(nameOf[msg.sender]);
        if (old.length != 0) delete ownerOfName[keccak256(old)];
        ownerOfName[key] = msg.sender;
        nameOf[msg.sender] = _name;
        emit NameSet(msg.sender, _name);
    }

    /// @notice Names for several addresses at once (empty string where none is set).
    function namesOf(address[] calldata _players) external view returns (string[] memory names) {
        names = new string[](_players.length);
        for (uint256 i = 0; i < _players.length; i++) names[i] = nameOf[_players[i]];
    }
}
