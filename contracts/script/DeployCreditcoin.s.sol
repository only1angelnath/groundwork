// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {GroundworkASC} from "../src/GroundworkASC.sol";

/// @notice Deploy to Creditcoin CC3 Testnet:
/// forge script script/DeployCreditcoin.s.sol:DeployCreditcoin --rpc-url creditcoin_testnet --broadcast
///
/// Deploys CreditVault first, then GroundworkASC pointed at it, then wires them together
/// via CreditVault.setASC — this order exists because GroundworkASC's constructor needs
/// CreditVault's address, and CreditVault only accepts its ASC address once, after deploy.
contract DeployCreditcoin is Script {
    /// @dev Chain key for Ethereum Sepolia, confirmed against docs.creditcoin.org's USC
    /// SDK example (chainKey = 1 for Sepolia on USC Testnet2 / CC3 Testnet). Confirm this
    /// is still current at docs.creditcoin.org/attestcoin-protocol/attestcoin-protocol-chains-environments
    /// before deploying — chain keys are environment-specific and have changed before.
    uint64 constant SEPOLIA_CHAIN_KEY = 1;

    function run() external returns (CreditVault vault, GroundworkASC asc) {
        vm.startBroadcast();

        vault = new CreditVault(msg.sender);
        asc = new GroundworkASC(address(vault), SEPOLIA_CHAIN_KEY);
        vault.setASC(address(asc));

        vm.stopBroadcast();

        console.log("CreditVault deployed at:", address(vault));
        console.log("GroundworkASC deployed at:", address(asc));
    }
}
