// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {SoulboundBillRecord} from "../src/SoulboundBillRecord.sol";

contract SoulboundBillRecordTest is Test {
    SoulboundBillRecord internal record;

    address internal owner = address(this);
    address internal minter = address(0xFEED);
    address internal payer = address(0xBEEF);
    address internal other = address(0xCAFE);

    function setUp() public {
        record = new SoulboundBillRecord(owner);
        record.addMinter(minter);
    }

    function test_AddMinter_RejectsZeroAddress() public {
        vm.expectRevert("SoulboundBillRecord: minter is the zero address");
        record.addMinter(address(0));
    }

    function test_AddMinter_RejectsDuplicate() public {
        vm.expectRevert("SoulboundBillRecord: already a minter");
        record.addMinter(minter);
    }

    function test_AddMinter_OnlyOwner() public {
        vm.prank(payer);
        vm.expectRevert();
        record.addMinter(other);
    }

    function test_RemoveMinter_Works() public {
        record.removeMinter(minter);
        assertFalse(record.isMinter(minter));

        vm.prank(minter);
        vm.expectRevert("SoulboundBillRecord: caller is not an authorized minter");
        record.mint(payer, 0, 1 ether);
    }

    function test_Mint_OnlyMinter() public {
        vm.prank(other);
        vm.expectRevert("SoulboundBillRecord: caller is not an authorized minter");
        record.mint(payer, 0, 1 ether);
    }

    function test_Mint_AssignsOwnershipAndStoresRecord() public {
        vm.prank(minter);
        uint256 tokenId = record.mint(payer, 42, 1 ether);

        assertEq(tokenId, 0);
        assertEq(record.ownerOf(0), payer);
        assertEq(record.balanceOf(payer), 1);

        (address recordPayer, uint256 billId, uint256 claimedAmount,) = record.recordOf(0);
        assertEq(recordPayer, payer);
        assertEq(billId, 42);
        assertEq(claimedAmount, 1 ether);
    }

    function test_Mint_IncrementsTokenId() public {
        vm.startPrank(minter);
        uint256 first = record.mint(payer, 0, 1 ether);
        uint256 second = record.mint(other, 1, 2 ether);
        vm.stopPrank();

        assertEq(first, 0);
        assertEq(second, 1);
    }

    /// @notice The actual point of this contract: a minted token can never be
    /// transferred by anyone, including its own owner.
    function test_Transfer_RevertsFromOwner() public {
        vm.prank(minter);
        record.mint(payer, 0, 1 ether);

        vm.prank(payer);
        vm.expectRevert("SoulboundBillRecord: token is non-transferable");
        record.transferFrom(payer, other, 0);
    }

    function test_SafeTransfer_RevertsFromOwner() public {
        vm.prank(minter);
        record.mint(payer, 0, 1 ether);

        vm.prank(payer);
        vm.expectRevert("SoulboundBillRecord: token is non-transferable");
        record.safeTransferFrom(payer, other, 0);
    }

    function test_Approve_AlwaysReverts() public {
        vm.prank(minter);
        record.mint(payer, 0, 1 ether);

        vm.prank(payer);
        vm.expectRevert("SoulboundBillRecord: approvals are disabled");
        record.approve(other, 0);
    }

    function test_SetApprovalForAll_AlwaysReverts() public {
        vm.prank(payer);
        vm.expectRevert("SoulboundBillRecord: approvals are disabled");
        record.setApprovalForAll(other, true);
    }

    function test_Mint_EmitsRecordMinted() public {
        vm.expectEmit(true, true, true, true);
        emit SoulboundBillRecord.RecordMinted(0, payer, 42, 1 ether);

        vm.prank(minter);
        record.mint(payer, 42, 1 ether);
    }
}
