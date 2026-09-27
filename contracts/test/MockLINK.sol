// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Local/test stand-in for LINK. Anyone can mint.
contract MockLINK is ERC20 {
    constructor() ERC20("Mock LINK", "LINK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
