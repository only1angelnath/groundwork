// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {GroundworkASC} from "../src/GroundworkASC.sol";

/// @notice Deploy to Creditcoin CC3 Testnet:
/// forge script script/DeployCreditcoin.s.sol:DeployCreditcoin --rpc-url creditcoin_testnet --broadcast
///
/// Deploys CreditVault first, then GroundworkASC pointed at it, then authorizes the ASC
/// as a recorder via CreditVault.addRecorder — this order exists because GroundworkASC's
/// constructor needs CreditVault's address, and CreditVault's recorder set is populated
/// after both contracts exist.
///
/// v3 update: CreditVault no longer has setASC() (single-recorder, one-time-settable).
/// It now uses an owner-managed isRecorder set via addRecorder()/removeRecorder(), so more
/// than one validator address can record verified payments later (see docs/HANDOFFphase6.md,
/// "Next: finish the validator/upload system"). This script reflects that: it deploys v3
/// CreditVault and authorizes the newly-deployed GroundworkASC as one recorder among
/// potentially several.
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
        vault.addRecorder(address(asc));

        vm.stopBroadcast();

        console.log("CreditVault (v3) deployed at:", address(vault));
        console.log("GroundworkASC deployed at:", address(asc));
        console.log("GroundworkASC authorized as recorder on CreditVault.");
    }
}
