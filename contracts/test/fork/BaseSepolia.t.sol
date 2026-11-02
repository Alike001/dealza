// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {DealzaScenarios} from "../DealzaOperator.t.sol";

/// @dev No broadcast or wallet. Uses existing deployed CPP + collector + Circle USDC on a local fork.
contract BaseSepoliaForkTest is DealzaScenarios {
    function setUp() public override {
        vm.createSelectFork(
            vm.envOr("BASE_SEPOLIA_RPC_URL", string("https://sepolia.base.org")),
            vm.envOr("BASE_SEPOLIA_FORK_BLOCK", uint256(53589971))
        );
        assertEq(block.chainid, 84532);
        assertGt(ESCROW_ADDRESS.code.length, 0);
        assertEq(ESCROW_ADDRESS.codehash, 0x33558f6cb34733174fdd6ec5ca8257834a8e4302abc08a4542f73ddf07d8702a);
        assertEq(COLLECTOR_ADDRESS.codehash, 0x49757bee314a38822e6f25db499d07edcc18e5a1b32ed6935483a4baa0e8a6e8);
        assertEq(address(collector.authCaptureEscrow()), ESCROW_ADDRESS);
        _start();
    }
}
