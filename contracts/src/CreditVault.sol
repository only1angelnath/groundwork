// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CreditVault
/// @notice Deployed on Creditcoin. Tracks a payer's verified-payment score and the
/// collateral ratio required to borrow against it. Verified payments can be recorded
/// by any address in the authorized recorder set — GroundworkASC for on-chain,
/// Attestcoin-verified payments, plus one or more permissioned validators for the
/// upload-approval path (Phase 6). Borrowing/repaying is always initiated directly by
/// the borrower's own wallet — no recorder ever touches loan funds, only score.
///
/// v3 (Phase 6): replaced the single `asc` address + one-time setASC() with a
/// recorder set (isRecorder mapping + addRecorder/removeRecorder), since bill
/// approvals now come from more than one source — GroundworkASC plus a small
/// permissioned set of validators. Deliberately agnostic inside
/// recordVerifiedPayment to *which* recorder called it; a verified payment is a
/// verified payment regardless of path. v2's repay()/loan-tracking logic is
/// unchanged.
///
/// v4 (security-audit follow-up): recordVerifiedPayment previously ignored its
/// `amount` parameter entirely — a bill claimed at 0.0001 tCTC and one claimed at
/// 10,000 tCTC granted an identical flat STEP_DOWN_BPS collateral-ratio cut. That's
/// replaced with a tier table: larger verified payments earn a bigger one-time
/// step-down than smaller ones, checked largest-threshold-first.
contract CreditVault is Ownable, ReentrancyGuard {
    /// @dev Basis points, i.e. 10_000 = 100%.
    uint256 public constant STARTING_COLLATERAL_RATIO_BPS = 30_000; // 300%
    uint256 public constant FLOOR_COLLATERAL_RATIO_BPS = 11_000; // 110%

    /// @dev Retained as the fallback step-down if the tier table is ever left
    /// empty or somehow fails to match (see _stepDownFor) — should be
    /// unreachable in normal operation since setTiers enforces a 0-threshold
    /// catch-all tier, but a legitimate verified payment should never revert
    /// over a tier-configuration gap.
    uint256 public constant STEP_DOWN_BPS = 2_000; // -20 points, the old flat rate

    /// @notice Addresses authorized to call recordVerifiedPayment. Owner-managed;
    /// no address is hardcoded or privileged over another in the contract itself.
    mapping(address => bool) public isRecorder;

    mapping(address => uint256) public scoreOf;
    mapping(address => uint256) public collateralRatioOf;

    struct Loan {
        uint256 principal;
        uint256 collateral;
    }

    /// @notice The caller's currently outstanding loan, if any. principal == 0 means
    /// no active loan.
    mapping(address => Loan) public loanOf;

    /// @notice A step-down amount tier: a verified payment whose amount is
    /// >= minAmountWei (and below the next-higher tier's threshold) grants
    /// stepDownBps off the payer's required collateral ratio for that payment.
    struct Tier {
        uint256 minAmountWei;
        uint256 stepDownBps;
    }

    /// @notice Tiers in descending threshold order — _stepDownFor checks top to
    /// bottom and uses the first match, so entry 0 must have the highest
    /// minAmountWei and the last entry must be minAmountWei == 0 (a catch-all
    /// for anything below the smallest named tier).
    ///
    /// IMPORTANT — units are not consistent across recorders, and this table
    /// can't fix that without an oracle: GroundworkASC passes a real Sepolia
    /// ETH-wei amount straight off the verified BillPaid event (this
    /// project's fixed demo payment is 0.001 ETH). BillValidator passes a
    /// tCTC-wei amount computed by converting a user-typed real-world amount
    /// through frontend/lib/useCtcConversion.ts at CTC's live market price —
    /// a $10 bill is roughly 80-110 tCTC at prices seen around this
    /// project's Sept 2026 deadline, five-plus orders of magnitude larger as
    /// a raw number than 0.001 ETH. These thresholds are deliberately
    /// calibrated to the CTC-equivalent scale, since BillValidator is the
    /// only path with a real, user-controlled amount to tier against. The
    /// consequence: GroundworkASC's fixed demo amount will consistently land
    /// in the catch-all tier — its per-payment step-down is intentionally
    /// STEP_DOWN_BPS-independent now (previously always exactly
    /// STEP_DOWN_BPS/20%, now the catch-all tier's rate). Adjustable
    /// post-deploy via setTiers, without a redeploy, if CTC's price moves
    /// enough before demo day that these no longer line up with realistic
    /// bill sizes.
    Tier[] public tiers;

    event ScoreUpdated(address indexed payer, uint256 newScore, uint256 newCollateralRatioBps);
    event LoanUnlocked(address indexed borrower, uint256 amount, uint256 collateralRatioBps);
    event LoanRepaid(address indexed borrower, uint256 principal, uint256 collateralReturned);
    event RecorderAdded(address indexed recorder);
    event RecorderRemoved(address indexed recorder);
    event TiersUpdated();

    modifier onlyRecorder() {
        require(isRecorder[msg.sender], "CreditVault: caller is not an authorized recorder");
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {
        // Calibrated to tCTC-equivalent amounts (see the tiers docstring
        // above for why) — roughly $100+ / $10+ / $1+ bills at CTC prices
        // seen around this project's Sept 2026 deadline (~$0.09-0.13/CTC).
        // $10 is also the upload form's own prefilled default amount, so a
        // fresh demo run lands squarely in the "typical" tier out of the box.
        tiers.push(Tier({minAmountWei: 1_000 ether, stepDownBps: 3_500})); // -35%, "large" (~$100+)
        tiers.push(Tier({minAmountWei: 100 ether, stepDownBps: 2_500})); // -25%, "typical" (~$10+)
        tiers.push(Tier({minAmountWei: 10 ether, stepDownBps: 1_500})); // -15%, "small" (~$1+)
        tiers.push(Tier({minAmountWei: 0, stepDownBps: 1_000})); // -10%, catch-all (incl. the automated path's fixed 0.001 ETH)
    }

    /// @notice Authorize a new recorder (GroundworkASC, or a validator address for
    /// the upload-approval path). Owner-only, callable any number of times to build
    /// up the recorder set as validators join.
    function addRecorder(address recorder) external onlyOwner {
        require(recorder != address(0), "CreditVault: recorder is the zero address");
        require(!isRecorder[recorder], "CreditVault: already a recorder");
        isRecorder[recorder] = true;
        emit RecorderAdded(recorder);
    }

    /// @notice Revoke a recorder's authorization — e.g. a validator stepping down or
    /// a compromised key being rotated out.
    function removeRecorder(address recorder) external onlyOwner {
        require(isRecorder[recorder], "CreditVault: not a recorder");
        isRecorder[recorder] = false;
        emit RecorderRemoved(recorder);
    }

    /// @notice Replace the tier table wholesale. Owner-only. `newTiers` must be in
    /// strictly descending minAmountWei order and its last entry must have
    /// minAmountWei == 0 — enforced below rather than left as a silent
    /// misconfiguration that would make every payment fall through to the
    /// STEP_DOWN_BPS fallback.
    function setTiers(Tier[] calldata newTiers) external onlyOwner {
        require(newTiers.length > 0, "CreditVault: at least one tier required");
        require(newTiers[newTiers.length - 1].minAmountWei == 0, "CreditVault: last tier must start at 0");
        delete tiers;
        for (uint256 i = 0; i < newTiers.length; i++) {
            if (i > 0) {
                require(
                    newTiers[i].minAmountWei < newTiers[i - 1].minAmountWei,
                    "CreditVault: tiers must be strictly descending"
                );
            }
            tiers.push(newTiers[i]);
        }
        emit TiersUpdated();
    }

    /// @notice Number of configured tiers — for the frontend/tests to iterate
    /// `tiers(i)` without knowing the length in advance.
    function tiersLength() external view returns (uint256) {
        return tiers.length;
    }

    function _stepDownFor(uint256 amount) internal view returns (uint256) {
        for (uint256 i = 0; i < tiers.length; i++) {
            if (amount >= tiers[i].minAmountWei) {
                return tiers[i].stepDownBps;
            }
        }
        // Unreachable in normal operation — the constructor and setTiers both
        // guarantee a 0-threshold catch-all tier — but fall back to the
        // original flat rate rather than reverting a legitimate verified
        // payment over a tier-configuration gap.
        return STEP_DOWN_BPS;
    }

    /// @notice Called by any authorized recorder once a bill payment has been
    /// verified — either cryptographically (GroundworkASC, for Attestcoin-attested
    /// on-chain payments) or by validator approval (for uploaded bills). Increments
    /// the payer's score and steps their required collateral ratio down toward the
    /// floor, by an amount-tiered step size (see tiers/_stepDownFor) rather than a
    /// flat rate.
    function recordVerifiedPayment(address payer, uint256 amount, uint256 /* timestamp */) external onlyRecorder {
        uint256 newScore = scoreOf[payer] + 1;
        scoreOf[payer] = newScore;

        uint256 currentRatio = collateralRatioOf[payer];
        if (currentRatio == 0) {
            currentRatio = STARTING_COLLATERAL_RATIO_BPS;
        }

        uint256 stepDown = _stepDownFor(amount);
        uint256 newRatio = currentRatio > stepDown ? currentRatio - stepDown : FLOOR_COLLATERAL_RATIO_BPS;
        if (newRatio < FLOOR_COLLATERAL_RATIO_BPS) {
            newRatio = FLOOR_COLLATERAL_RATIO_BPS;
        }
        collateralRatioOf[payer] = newRatio;

        emit ScoreUpdated(payer, newScore, newRatio);
    }

    /// @notice The collateral ratio (basis points) a borrower must post right now.
    /// Defaults to the starting ratio for anyone with no recorded payments yet.
    function requiredCollateralRatioOf(address payer) public view returns (uint256 ratioBps) {
        ratioBps = collateralRatioOf[payer];
        if (ratioBps == 0) {
            ratioBps = STARTING_COLLATERAL_RATIO_BPS;
        }
    }

    /// @notice Borrow `amount` of native currency, posting collateral according to the
    /// caller's current ratio. Always called directly by the borrower's own wallet.
    /// Reverts if the caller already has an active loan — repay it first.
    function borrow(uint256 amount) external payable nonReentrant {
        require(amount > 0, "CreditVault: amount must be positive");
        require(loanOf[msg.sender].principal == 0, "CreditVault: existing loan must be repaid first");

        uint256 ratioBps = requiredCollateralRatioOf(msg.sender);
        uint256 requiredCollateral = (amount * ratioBps) / 10_000;
        require(msg.value >= requiredCollateral, "CreditVault: insufficient collateral");
        require(address(this).balance - msg.value >= amount, "CreditVault: insufficient pool liquidity");

        loanOf[msg.sender] = Loan({principal: amount, collateral: msg.value});

        emit LoanUnlocked(msg.sender, amount, ratioBps);

        (bool sent,) = msg.sender.call{value: amount}("");
        require(sent, "CreditVault: loan transfer failed");
    }

    /// @notice Repay the caller's active loan in full. Any amount sent above the
    /// principal is refunded alongside the released collateral. Reverts if there is
    /// no active loan or the amount sent is less than the principal.
    function repay() external payable nonReentrant {
        Loan memory loan = loanOf[msg.sender];
        require(loan.principal > 0, "CreditVault: no active loan");
        require(msg.value >= loan.principal, "CreditVault: insufficient repayment");

        delete loanOf[msg.sender];

        uint256 refund = msg.value - loan.principal;
        uint256 toReturn = loan.collateral + refund;

        emit LoanRepaid(msg.sender, loan.principal, loan.collateral);

        (bool sent,) = msg.sender.call{value: toReturn}("");
        require(sent, "CreditVault: collateral return failed");
    }

    /// @notice Lets anyone (the deployer, for a demo) fund the lending pool.
    receive() external payable {}
}
