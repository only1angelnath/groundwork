// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {BillValidator} from "../src/BillValidator.sol";

contract BillValidatorTest is Test {
    CreditVault internal vault;
    BillValidator internal billValidator;

    address internal owner = address(this);
    address internal validator = address(0xFACE);
    address internal payer = address(0xBEEF);
    address internal stranger = address(0xBAD);

    bytes32 internal constant DOC_HASH = keccak256("some uploaded pdf bytes");

    // Mirrors BillValidator.SUBMISSION_FEE(). Deliberately NOT calling the getter
    // inline at call sites guarded by vm.prank/vm.expectRevert — either cheatcode only
    // guards the literal next call, and billValidator.SUBMISSION_FEE() evaluated as
    // part of computing msg.value is itself an external call that would consume the
    // guard before submitBill() ever runs.
    uint256 internal constant FEE = 0.0005 ether;

    function setUp() public {
        vault = new CreditVault(owner);
        billValidator = new BillValidator(validator, address(vault));
        vault.addRecorder(address(billValidator));

        vm.deal(payer, 1 ether);
    }

    function _submit() internal returns (uint256 billId) {
        vm.prank(payer);
        billId = billValidator.submitBill{value: FEE}(1 ether, DOC_HASH);
    }

    function test_Constructor_RejectsZeroValidator() public {
        vm.expectRevert("BillValidator: validator is the zero address");
        new BillValidator(address(0), address(vault));
    }

    function test_Constructor_RejectsZeroCreditVault() public {
        vm.expectRevert("BillValidator: creditVault is the zero address");
        new BillValidator(validator, address(0));
    }

    function test_SubmitBill_RejectsWrongFee() public {
        vm.prank(payer);
        vm.expectRevert("BillValidator: incorrect submission fee");
        billValidator.submitBill{value: 0.0001 ether}(1 ether, DOC_HASH);
    }

    function test_SubmitBill_RejectsZeroClaimedAmount() public {
        vm.prank(payer);
        vm.expectRevert("BillValidator: claimedAmount must be positive");
        billValidator.submitBill{value: FEE}(0, DOC_HASH);
    }

    function test_SubmitBill_RejectsEmptyDocumentHash() public {
        vm.prank(payer);
        vm.expectRevert("BillValidator: documentHash is empty");
        billValidator.submitBill{value: FEE}(1 ether, bytes32(0));
    }

    /// @notice The point of the "forward to pool" decision — submitting a bill should
    /// grow CreditVault's borrowable liquidity immediately, win or lose the review.
    function test_SubmitBill_ForwardsFeeToCreditVaultPool() public {
        assertEq(address(vault).balance, 0);

        _submit();

        assertEq(address(vault).balance, FEE);
        assertEq(address(billValidator).balance, 0);
    }

    /// @notice Confirms the mirrored FEE constant above actually matches the
    /// contract's real SUBMISSION_FEE — this call is safe here since it's not
    /// adjacent to any vm.prank/vm.expectRevert guard.
    function test_FeeConstant_MatchesContract() public view {
        assertEq(billValidator.SUBMISSION_FEE(), FEE);
    }

    function test_SubmitBill_StoresPendingSubmission() public {
        uint256 billId = _submit();

        (address billPayer, uint256 claimedAmount, bytes32 documentHash,, BillValidator.Status status) =
            billValidator.bills(billId);

        assertEq(billPayer, payer);
        assertEq(claimedAmount, 1 ether);
        assertEq(documentHash, DOC_HASH);
        assertEq(uint8(status), uint8(BillValidator.Status.Pending));
    }

    function test_SubmitBill_IncrementsBillId() public {
        uint256 first = _submit();
        uint256 second = _submit();
        assertEq(first, 0);
        assertEq(second, 1);
    }

    function test_ApproveBill_OnlyValidator() public {
        uint256 billId = _submit();

        vm.prank(stranger);
        vm.expectRevert("BillValidator: caller is not the validator");
        billValidator.approveBill(billId);
    }

    function test_ApproveBill_RevertsOnNonexistentBill() public {
        vm.prank(validator);
        vm.expectRevert("BillValidator: bill does not exist");
        billValidator.approveBill(999);
    }

    function test_ApproveBill_RecordsPaymentOnCreditVault() public {
        uint256 billId = _submit();
        assertEq(vault.scoreOf(payer), 0);

        vm.prank(validator);
        billValidator.approveBill(billId);

        assertEq(vault.scoreOf(payer), 1);
        (,,,, BillValidator.Status status) = billValidator.bills(billId);
        assertEq(uint8(status), uint8(BillValidator.Status.Approved));
    }

    function test_ApproveBill_RevertsIfAlreadyDecided() public {
        uint256 billId = _submit();

        vm.startPrank(validator);
        billValidator.approveBill(billId);

        vm.expectRevert("BillValidator: bill already decided");
        billValidator.approveBill(billId);
        vm.stopPrank();
    }

    function test_RejectBill_OnlyValidator() public {
        uint256 billId = _submit();

        vm.prank(stranger);
        vm.expectRevert("BillValidator: caller is not the validator");
        billValidator.rejectBill(billId, "not legible");
    }

    function test_RejectBill_DoesNotRecordPayment() public {
        uint256 billId = _submit();

        vm.prank(validator);
        billValidator.rejectBill(billId, "not legible");

        assertEq(vault.scoreOf(payer), 0);
        (,,,, BillValidator.Status status) = billValidator.bills(billId);
        assertEq(uint8(status), uint8(BillValidator.Status.Rejected));
    }

    function test_RejectBill_RevertsIfAlreadyDecided() public {
        uint256 billId = _submit();

        vm.startPrank(validator);
        billValidator.rejectBill(billId, "not legible");

        vm.expectRevert("BillValidator: bill already decided");
        billValidator.rejectBill(billId, "still not legible");
        vm.stopPrank();
    }

    function test_GetPendingBillIds_ExcludesDecidedBills() public {
        uint256 pending1 = _submit();
        uint256 toApprove = _submit();
        uint256 toReject = _submit();
        uint256 pending2 = _submit();

        vm.startPrank(validator);
        billValidator.approveBill(toApprove);
        billValidator.rejectBill(toReject, "no");
        vm.stopPrank();

        uint256[] memory pending = billValidator.getPendingBillIds();
        assertEq(pending.length, 2);
        assertEq(pending[0], pending1);
        assertEq(pending[1], pending2);
    }

    /// @notice Two independent approval paths — GroundworkASC (on-chain verified) and
    /// BillValidator (upload-approved) — must both be able to build the same payer's
    /// score, since CreditVault treats every recorder identically (see
    /// CreditVault.t.sol's test_MultipleRecorders_BothCanRecordPayment).
    function test_ScoreBuildsAlongsideOtherRecorders() public {
        address otherRecorder = address(0xA5C);
        vault.addRecorder(otherRecorder);

        vm.prank(otherRecorder);
        vault.recordVerifiedPayment(payer, 1 ether, block.timestamp);
        assertEq(vault.scoreOf(payer), 1);

        uint256 billId = _submit();
        vm.prank(validator);
        billValidator.approveBill(billId);
        assertEq(vault.scoreOf(payer), 2);
    }
}
