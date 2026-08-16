// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {BillPay} from "../src/BillPay.sol";

/// @notice Deploy to Sepolia:
/// forge script script/DeployBillPay.s.sol:DeployBillPay --rpc-url sepolia --broadcast --verify
contract DeployBillPay is Script {
    function run() external returns (BillPay) {
        vm.startBroadcast();
        BillPay billPay = new BillPay();
        vm.stopBroadcast();

        console.log("BillPay deployed at:", address(billPay));
        return billPay;
    }
}
