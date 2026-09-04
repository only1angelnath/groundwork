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
contract CreditVault is Ownable, ReentrancyGuard {
    /// @dev Basis points, i.e. 10_000 = 100%.
    uint256 public constant STARTING_COLLATERAL_RATIO_BPS = 30_000; // 300%
    uint256 public constant FLOOR_COLLATERAL_RATIO_BPS = 11_000; // 110%
    uint256 public constant STEP_DOWN_BPS = 2_000; // -20 points per verified payment

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

    event ScoreUpdated(address indexed payer, uint256 newScore, uint256 newCollateralRatioBps);
    event LoanUnlocked(address indexed borrower, uint256 amount, uint256 collateralRatioBps);
    event LoanRepaid(address indexed borrower, uint256 principal, uint256 collateralReturned);
    event RecorderAdded(address indexed recorder);
    event RecorderRemoved(address indexed recorder);

    modifier onlyRecorder() {
        require(isRecorder[msg.sender], "CreditVault: caller is not an authorized recorder");
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

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

    /// @notice Called by any authorized recorder once a bill payment has been
    /// verified — either cryptographically (GroundworkASC, for Attestcoin-attested
    /// on-chain payments) or by validator approval (for uploaded bills). Increments
    /// the payer's score and steps their required collateral ratio down toward the
    /// floor.
    function recordVerifiedPayment(address payer, uint256 /* amount */, uint256 /* timestamp */) external onlyRecorder {
        uint256 newScore = scoreOf[payer] + 1;
        scoreOf[payer] = newScore;

        uint256 currentRatio = collateralRatioOf[payer];
        if (currentRatio == 0) {
            currentRatio = STARTING_COLLATERAL_RATIO_BPS;
        }

        uint256 newRatio = currentRatio > STEP_DOWN_BPS ? currentRatio - STEP_DOWN_BPS : FLOOR_COLLATERAL_RATIO_BPS;
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
