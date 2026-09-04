// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {CreditVault} from "../src/CreditVault.sol";

contract CreditVaultTest is Test {
    CreditVault internal vault;
    address internal owner = address(this);
    address internal asc = address(0xA5C);
    address internal validator1 = address(0xBAA1);
    address internal validator2 = address(0xBAA2);
    address internal payer = address(0xBEEF);

    function setUp() public {
        vault = new CreditVault(owner);
        vault.addRecorder(asc);
    }

    function test_AddRecorder_RejectsZeroAddress() public {
        vm.expectRevert("CreditVault: recorder is the zero address");
        vault.addRecorder(address(0));
    }

    function test_AddRecorder_RejectsDuplicate() public {
        vm.expectRevert("CreditVault: already a recorder");
        vault.addRecorder(asc); // already added in setUp
    }

    function test_AddRecorder_OnlyOwner() public {
        vm.prank(payer);
        vm.expectRevert();
        vault.addRecorder(validator1);
    }

    function test_RemoveRecorder_Works() public {
        vault.removeRecorder(asc);
        assertFalse(vault.isRecorder(asc));

        vm.prank(asc);
        vm.expectRevert("CreditVault: caller is not an authorized recorder");
        vault.recordVerifiedPayment(payer, 1 ether, block.timestamp);
    }

    function test_RemoveRecorder_RevertsIfNotARecorder() public {
        vm.expectRevert("CreditVault: not a recorder");
        vault.removeRecorder(validator1); // never added
    }

    function test_OnlyRecorder_CanRecordPayment() public {
        vm.expectRevert("CreditVault: caller is not an authorized recorder");
        vault.recordVerifiedPayment(payer, 1 ether, block.timestamp);
    }

    /// @notice The actual point of this redesign: more than one recorder must be
    /// able to independently record verified payments for the same payer, and the
    /// vault must not care which one did it — a validator-approved upload and an
    /// Attestcoin-verified on-chain payment count identically.
    function test_MultipleRecorders_BothCanRecordPayment() public {
        vault.addRecorder(validator1);
        vault.addRecorder(validator2);

        vm.prank(asc);
        vault.recordVerifiedPayment(payer, 1 ether, block.timestamp);
        assertEq(vault.scoreOf(payer), 1);

        vm.prank(validator1);
        vault.recordVerifiedPayment(payer, 1 ether, block.timestamp);
        assertEq(vault.scoreOf(payer), 2);

        vm.prank(validator2);
        vault.recordVerifiedPayment(payer, 1 ether, block.timestamp);
        assertEq(vault.scoreOf(payer), 3);
    }

    function test_NewPayer_StartsAtDefaultRatio() public view {
        assertEq(vault.requiredCollateralRatioOf(payer), vault.STARTING_COLLATERAL_RATIO_BPS());
    }

    function test_FirstPayment_StepsRatioDown() public {
        vm.prank(asc);
        vault.recordVerifiedPayment(payer, 1 ether, block.timestamp);

        assertEq(vault.scoreOf(payer), 1);
        assertEq(
            vault.requiredCollateralRatioOf(payer),
            vault.STARTING_COLLATERAL_RATIO_BPS() - vault.STEP_DOWN_BPS()
        );
    }

    /// @notice The exact boundary the roadmap flagged: repeated payments must step the
    /// ratio down to precisely the floor and never below it, even with an extra payment
    /// past the point where it would otherwise go under.
    function test_RepeatedPayments_FloorAtExactly11000Bps() public {
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(asc);
            vault.recordVerifiedPayment(payer, 1 ether, block.timestamp);
        }
        assertEq(vault.requiredCollateralRatioOf(payer), vault.FLOOR_COLLATERAL_RATIO_BPS());

        CreditVault freshVault = new CreditVault(owner);
        freshVault.addRecorder(asc);
        for (uint256 i = 0; i < 9; i++) {
            vm.prank(asc);
            freshVault.recordVerifiedPayment(payer, 1 ether, block.timestamp);
        }
        assertGt(freshVault.requiredCollateralRatioOf(payer), freshVault.FLOOR_COLLATERAL_RATIO_BPS());
    }

    function test_RepeatedPayments_NeverGoBelowFloor() public {
        for (uint256 i = 0; i < 20; i++) {
            vm.prank(asc);
            vault.recordVerifiedPayment(payer, 1 ether, block.timestamp);
        }
        assertEq(vault.requiredCollateralRatioOf(payer), vault.FLOOR_COLLATERAL_RATIO_BPS());
        assertEq(vault.scoreOf(payer), 20);
    }

    function test_Borrow_RevertsOnInsufficientCollateral() public {
        vm.deal(address(vault), 10 ether);
        vm.deal(payer, 10 ether);

        vm.prank(payer);
        vm.expectRevert("CreditVault: insufficient collateral");
        vault.borrow{value: 1 ether}(1 ether); // needs 300% = 3 ether at starting ratio
    }

    function test_Borrow_SucceedsWithCorrectCollateral() public {
        vm.deal(address(vault), 10 ether);
        vm.deal(payer, 10 ether);

        uint256 requiredCollateral = (1 ether * vault.STARTING_COLLATERAL_RATIO_BPS()) / 10_000;

        vm.prank(payer);
        vault.borrow{value: requiredCollateral}(1 ether);

        assertEq(payer.balance, 10 ether - requiredCollateral + 1 ether);
    }

    function test_Borrow_RevertsOnInsufficientPoolLiquidity() public {
        vm.deal(address(vault), 0.5 ether);
        vm.deal(payer, 10 ether);

        uint256 requiredCollateral = (1 ether * vault.STARTING_COLLATERAL_RATIO_BPS()) / 10_000;

        vm.prank(payer);
        vm.expectRevert("CreditVault: insufficient pool liquidity");
        vault.borrow{value: requiredCollateral}(1 ether);
    }

    function test_Borrow_RevertsIfExistingLoanNotRepaid() public {
        vm.deal(address(vault), 10 ether);
        vm.deal(payer, 10 ether);

        uint256 requiredCollateral = (1 ether * vault.STARTING_COLLATERAL_RATIO_BPS()) / 10_000;

        vm.startPrank(payer);
        vault.borrow{value: requiredCollateral}(1 ether);

        vm.expectRevert("CreditVault: existing loan must be repaid first");
        vault.borrow{value: requiredCollateral}(1 ether);
        vm.stopPrank();
    }

    function test_Repay_ReturnsCollateralAndClearsLoan() public {
        vm.deal(address(vault), 10 ether);
        vm.deal(payer, 10 ether);

        uint256 principal = 1 ether;
        uint256 requiredCollateral = (principal * vault.STARTING_COLLATERAL_RATIO_BPS()) / 10_000;

        vm.startPrank(payer);
        vault.borrow{value: requiredCollateral}(principal);

        uint256 balanceAfterBorrow = payer.balance;
        vault.repay{value: principal}();
        vm.stopPrank();

        (uint256 loanPrincipal, uint256 loanCollateral) = vault.loanOf(payer);
        assertEq(loanPrincipal, 0);
        assertEq(loanCollateral, 0);

        // Repay spends `principal` and gets back `requiredCollateral` -> net zero
        // round trip with no interest, so balance ends up back at the pre-borrow figure.
        assertEq(payer.balance, balanceAfterBorrow - principal + requiredCollateral);
        assertEq(payer.balance, 10 ether);
    }

    function test_Repay_RevertsWithNoActiveLoan() public {
        vm.deal(payer, 1 ether);

        vm.prank(payer);
        vm.expectRevert("CreditVault: no active loan");
        vault.repay{value: 1 ether}();
    }

    function test_Repay_RevertsOnInsufficientRepayment() public {
        vm.deal(address(vault), 10 ether);
        vm.deal(payer, 10 ether);

        uint256 principal = 1 ether;
        uint256 requiredCollateral = (principal * vault.STARTING_COLLATERAL_RATIO_BPS()) / 10_000;

        vm.startPrank(payer);
        vault.borrow{value: requiredCollateral}(principal);

        vm.expectRevert("CreditVault: insufficient repayment");
        vault.repay{value: principal - 1}();
        vm.stopPrank();
    }

    function test_Repay_RefundsExcessPayment() public {
        vm.deal(address(vault), 10 ether);
        vm.deal(payer, 10 ether);

        uint256 principal = 1 ether;
        uint256 requiredCollateral = (principal * vault.STARTING_COLLATERAL_RATIO_BPS()) / 10_000;

        vm.startPrank(payer);
        vault.borrow{value: requiredCollateral}(principal);

        uint256 balanceAfterBorrow = payer.balance;
        uint256 overpay = principal + 0.1 ether;
        vault.repay{value: overpay}();
        vm.stopPrank();

        assertEq(payer.balance, balanceAfterBorrow - overpay + requiredCollateral + 0.1 ether);
    }

    function test_Repay_AllowsBorrowingAgainAfterward() public {
        vm.deal(address(vault), 10 ether);
        vm.deal(payer, 10 ether);

        uint256 principal = 1 ether;
        uint256 requiredCollateral = (principal * vault.STARTING_COLLATERAL_RATIO_BPS()) / 10_000;

        vm.startPrank(payer);
        vault.borrow{value: requiredCollateral}(principal);
        vault.repay{value: principal}();

        vault.borrow{value: requiredCollateral}(principal);
        vm.stopPrank();

        (uint256 loanPrincipal,) = vault.loanOf(payer);
        assertEq(loanPrincipal, principal);
    }
}
