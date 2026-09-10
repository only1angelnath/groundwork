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

    /// @notice Security-audit follow-up (Sept 2026): recordVerifiedPayment used to
    /// apply a flat STEP_DOWN_BPS to every payment regardless of amount. It now
    /// looks up a tier by amount instead — 1 ether lands in the catch-all tier
    /// (index 3, the lowest-threshold entry), not the old flat rate, so the
    /// expected step is read from the vault's actual configured tier rather than
    /// hardcoded, in case the defaults are ever retuned via setTiers.
    function test_FirstPayment_StepsRatioDown() public {
        vm.prank(asc);
        vault.recordVerifiedPayment(payer, 1 ether, block.timestamp);

        (, uint256 expectedStepDown) = vault.tiers(3);
        assertEq(vault.scoreOf(payer), 1);
        assertEq(
            vault.requiredCollateralRatioOf(payer),
            vault.STARTING_COLLATERAL_RATIO_BPS() - expectedStepDown
        );
    }

    /// @notice The exact boundary the roadmap flagged: repeated payments must step the
    /// ratio down to precisely the floor and never below it, even with an extra payment
    /// past the point where it would otherwise go under.
    ///
    /// Payment count to reach the floor is derived from the vault's actual
    /// configured catch-all step (not hardcoded), since 1 ether payments land in
    /// that tier — this stays correct if the tier defaults are ever retuned via
    /// setTiers, as long as the step still divides the starting-to-floor gap
    /// evenly (enforced below rather than assumed).
    function test_RepeatedPayments_FloorAtExactly11000Bps() public {
        (, uint256 stepDown) = vault.tiers(3);
        uint256 gap = vault.STARTING_COLLATERAL_RATIO_BPS() - vault.FLOOR_COLLATERAL_RATIO_BPS();
        require(gap % stepDown == 0, "test setup: step size must divide the starting-to-floor gap evenly");
        uint256 paymentsToFloor = gap / stepDown;

        for (uint256 i = 0; i < paymentsToFloor; i++) {
            vm.prank(asc);
            vault.recordVerifiedPayment(payer, 1 ether, block.timestamp);
        }
        assertEq(vault.requiredCollateralRatioOf(payer), vault.FLOOR_COLLATERAL_RATIO_BPS());

        CreditVault freshVault = new CreditVault(owner);
        freshVault.addRecorder(asc);
        for (uint256 i = 0; i < paymentsToFloor - 1; i++) {
            vm.prank(asc);
            freshVault.recordVerifiedPayment(payer, 1 ether, block.timestamp);
        }
        assertGt(freshVault.requiredCollateralRatioOf(payer), freshVault.FLOOR_COLLATERAL_RATIO_BPS());
    }

    function test_RepeatedPayments_NeverGoBelowFloor() public {
        // 20 payments at 1 ether (catch-all tier, currently -1000bps/payment)
        // clears the floor with room to spare (reached at 19 payments as of the
        // current tier defaults — see test_RepeatedPayments_FloorAtExactly11000Bps).
        for (uint256 i = 0; i < 20; i++) {
            vm.prank(asc);
            vault.recordVerifiedPayment(payer, 1 ether, block.timestamp);
        }
        assertEq(vault.requiredCollateralRatioOf(payer), vault.FLOOR_COLLATERAL_RATIO_BPS());
        assertEq(vault.scoreOf(payer), 20);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Tiered step-down (security-audit follow-up, Sept 2026)
    // ─────────────────────────────────────────────────────────────────────────

    function test_TiersLength_MatchesConstructorDefaults() public view {
        assertEq(vault.tiersLength(), 4);
    }

    function test_TierSelection_LargeAmountGetsBiggestStepDown() public {
        address bigPayer = address(0xB16);
        vm.prank(asc);
        vault.recordVerifiedPayment(bigPayer, 1_000 ether, block.timestamp);

        (, uint256 expectedStepDown) = vault.tiers(0); // largest-threshold tier
        assertEq(
            vault.requiredCollateralRatioOf(bigPayer),
            vault.STARTING_COLLATERAL_RATIO_BPS() - expectedStepDown
        );
    }

    function test_TierSelection_TypicalAmountGetsMidStepDown() public {
        address midPayer = address(0x7171);
        vm.prank(asc);
        vault.recordVerifiedPayment(midPayer, 100 ether, block.timestamp);

        (, uint256 expectedStepDown) = vault.tiers(1);
        assertEq(
            vault.requiredCollateralRatioOf(midPayer),
            vault.STARTING_COLLATERAL_RATIO_BPS() - expectedStepDown
        );
    }

    function test_TierSelection_SmallAmountGetsSmallerStepDown() public {
        address smallPayer = address(0x5AA1);
        vm.prank(asc);
        vault.recordVerifiedPayment(smallPayer, 10 ether, block.timestamp);

        (, uint256 expectedStepDown) = vault.tiers(2);
        assertEq(
            vault.requiredCollateralRatioOf(smallPayer),
            vault.STARTING_COLLATERAL_RATIO_BPS() - expectedStepDown
        );
    }

    function test_TierSelection_DustAmountFallsToCatchAllTier() public {
        address dustPayer = address(0xD057);
        vm.prank(asc);
        vault.recordVerifiedPayment(dustPayer, 1 wei, block.timestamp);

        (, uint256 expectedStepDown) = vault.tiers(3);
        assertEq(
            vault.requiredCollateralRatioOf(dustPayer),
            vault.STARTING_COLLATERAL_RATIO_BPS() - expectedStepDown
        );
    }

    function test_TierSelection_ExactThresholdIsInclusive() public {
        // amount == a tier's minAmountWei exactly must match that tier, not the
        // one below it (_stepDownFor uses >=, not >).
        address exactPayer = address(0xE001);
        vm.prank(asc);
        vault.recordVerifiedPayment(exactPayer, 100 ether, block.timestamp);

        (, uint256 typicalStepDown) = vault.tiers(1);
        assertEq(
            vault.requiredCollateralRatioOf(exactPayer),
            vault.STARTING_COLLATERAL_RATIO_BPS() - typicalStepDown
        );
    }

    function test_SetTiers_OnlyOwner() public {
        CreditVault.Tier[] memory newTiers = new CreditVault.Tier[](1);
        newTiers[0] = CreditVault.Tier({minAmountWei: 0, stepDownBps: 5_000});

        vm.prank(payer);
        vm.expectRevert();
        vault.setTiers(newTiers);
    }

    function test_SetTiers_RejectsEmptyArray() public {
        CreditVault.Tier[] memory empty = new CreditVault.Tier[](0);
        vm.expectRevert("CreditVault: at least one tier required");
        vault.setTiers(empty);
    }

    function test_SetTiers_RejectsNonZeroLastTier() public {
        CreditVault.Tier[] memory newTiers = new CreditVault.Tier[](1);
        newTiers[0] = CreditVault.Tier({minAmountWei: 1 ether, stepDownBps: 5_000});

        vm.expectRevert("CreditVault: last tier must start at 0");
        vault.setTiers(newTiers);
    }

    function test_SetTiers_RejectsNonDescendingOrder() public {
        CreditVault.Tier[] memory newTiers = new CreditVault.Tier[](3);
        newTiers[0] = CreditVault.Tier({minAmountWei: 1 ether, stepDownBps: 3_000});
        newTiers[1] = CreditVault.Tier({minAmountWei: 2 ether, stepDownBps: 1_500}); // not below entry 0
        newTiers[2] = CreditVault.Tier({minAmountWei: 0, stepDownBps: 500});

        vm.expectRevert("CreditVault: tiers must be strictly descending");
        vault.setTiers(newTiers);
    }

    function test_SetTiers_UpdatesAppliedStepDown() public {
        CreditVault.Tier[] memory newTiers = new CreditVault.Tier[](1);
        newTiers[0] = CreditVault.Tier({minAmountWei: 0, stepDownBps: 5_000});
        vault.setTiers(newTiers);
        assertEq(vault.tiersLength(), 1);

        vm.prank(asc);
        vault.recordVerifiedPayment(payer, 1 ether, block.timestamp);
        assertEq(
            vault.requiredCollateralRatioOf(payer),
            vault.STARTING_COLLATERAL_RATIO_BPS() - 5_000
        );
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
