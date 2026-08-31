// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {CreditVault} from "../src/CreditVault.sol";

contract CreditVaultTest is Test {
    CreditVault internal vault;
    address internal owner = address(this);
    address internal asc = address(0xA5C);
    address internal payer = address(0xBEEF);

    function setUp() public {
        vault = new CreditVault(owner);
        vault.setASC(asc);
    }

    function test_SetASC_OnlyOnce() public {
        vm.expectRevert("CreditVault: ASC already set");
        vault.setASC(address(0xDEAD));
    }

    function test_SetASC_RejectsZeroAddress() public {
        CreditVault freshVault = new CreditVault(owner);
        vm.expectRevert("CreditVault: ASC is the zero address");
        freshVault.setASC(address(0));
    }

    function test_OnlyASC_CanRecordPayment() public {
        vm.expectRevert("CreditVault: caller is not the ASC");
        vault.recordVerifiedPayment(payer, 1 ether, block.timestamp);
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
        // STARTING=30000, STEP=2000, FLOOR=11000 -> exactly floor after (30000-11000)/2000 = 9.5,
        // so the 10th payment is the first to land exactly on the floor.
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(asc);
            vault.recordVerifiedPayment(payer, 1 ether, block.timestamp);
        }
        assertEq(vault.requiredCollateralRatioOf(payer), vault.FLOOR_COLLATERAL_RATIO_BPS());

        // One payment short of that (9 payments) must NOT yet be at the floor.
        CreditVault freshVault = new CreditVault(owner);
        freshVault.setASC(asc);
        for (uint256 i = 0; i < 9; i++) {
            vm.prank(asc);
            freshVault.recordVerifiedPayment(payer, 1 ether, block.timestamp);
        }
        assertGt(freshVault.requiredCollateralRatioOf(payer), freshVault.FLOOR_COLLATERAL_RATIO_BPS());
    }

    function test_RepeatedPayments_NeverGoBelowFloor() public {
        // 20 payments is well past the floor; ratio must still read exactly the floor,
        // never underflow or wrap.
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

        // Should get back collateral + the 0.1 ether excess.
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

        // Should not revert this time — the previous loan was cleared.
        vault.borrow{value: requiredCollateral}(principal);
        vm.stopPrank();

        (uint256 loanPrincipal,) = vault.loanOf(payer);
        assertEq(loanPrincipal, principal);
    }
}
