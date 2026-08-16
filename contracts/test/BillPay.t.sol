// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {BillPay} from "../src/BillPay.sol";

contract BillPayTest is Test {
    BillPay internal billPay;
    address internal payer = address(0xBEEF);
    address internal payee = address(0xCAFE);

    event BillPaid(address indexed payer, address indexed payee, uint256 amount, uint256 timestamp);

    function setUp() public {
        billPay = new BillPay();
        vm.deal(payer, 10 ether);
    }

    function test_PayBill_EmitsEventAndForwardsFunds() public {
        vm.expectEmit(true, true, false, true);
        emit BillPaid(payer, payee, 1 ether, block.timestamp);

        vm.prank(payer);
        billPay.payBill{value: 1 ether}(payee);

        assertEq(payee.balance, 1 ether);
    }

    function test_RevertWhen_PayeeIsZeroAddress() public {
        vm.prank(payer);
        vm.expectRevert("BillPay: payee is the zero address");
        billPay.payBill{value: 1 ether}(address(0));
    }

    function test_RevertWhen_NoValueSent() public {
        vm.prank(payer);
        vm.expectRevert("BillPay: no payment sent");
        billPay.payBill{value: 0}(payee);
    }
}
