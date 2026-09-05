// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice Minimal interface into CreditVault — BillValidator only ever calls
/// recordVerifiedPayment, exactly like GroundworkASC does. CreditVault does not
/// care which authorized recorder called it (see CreditVault.sol's v3 comment).
interface ICreditVault {
    function recordVerifiedPayment(address payer, uint256 amount, uint256 timestamp) external;
}

/// @title BillValidator
/// @notice Deployed on Creditcoin CC3 Testnet. The upload-approval path for bills that
/// weren't paid on-chain on Sepolia (so Attestcoin/GroundworkASC has nothing to verify):
/// a user submits a bill (small CTC fee, a reference to the uploaded document living in
/// Supabase Storage), a single permissioned validator approves or rejects it, and an
/// approval calls CreditVault.recordVerifiedPayment exactly like a real on-chain
/// verification would.
///
/// Deliberately NOT staking/slashing or a multi-validator DAO — that's the v2 roadmap
/// item, scoped down given the hackathon timeline (see docs/HANDOFFphase6.md, "Next:
/// finish the validator/upload system"). One hardcoded validator address, set at
/// deploy time, no rotation logic — simplest possible for the demo. If the validator
/// key needs to change, redeploy.
///
/// This contract must be authorized as a recorder on CreditVault via
/// CreditVault.addRecorder(address(this)) after deployment — it is not a recorder by
/// default, same as GroundworkASC.
contract BillValidator {
    enum Status {
        Pending,
        Approved,
        Rejected
    }

    struct BillSubmission {
        address payer;
        uint256 claimedAmount;
        bytes32 documentHash;
        uint256 submittedAt;
        Status status;
    }

    /// @notice Small CTC fee required to submit a bill for validator review. Forwarded
    /// in full to CreditVault's lending pool on submission — this is a demo-scale
    /// friction fee, not a real anti-spam/staking mechanism, and it adds to borrowable
    /// liquidity regardless of whether the bill is later approved or rejected.
    uint256 public constant SUBMISSION_FEE = 0.0005 ether; // 0.0005 tCTC

    address public immutable validator;
    ICreditVault public immutable creditVault;

    uint256 public nextBillId;
    mapping(uint256 => BillSubmission) public bills;

    event BillSubmitted(
        uint256 indexed billId, address indexed payer, uint256 claimedAmount, bytes32 documentHash
    );
    event BillApproved(uint256 indexed billId, address indexed payer, uint256 claimedAmount);
    event BillRejected(uint256 indexed billId, address indexed payer, string reason);

    modifier onlyValidator() {
        require(msg.sender == validator, "BillValidator: caller is not the validator");
        _;
    }

    constructor(address _validator, address _creditVault) {
        require(_validator != address(0), "BillValidator: validator is the zero address");
        require(_creditVault != address(0), "BillValidator: creditVault is the zero address");
        validator = _validator;
        creditVault = ICreditVault(_creditVault);
    }

    /// @notice Submit a bill for validator review. `documentHash` is a hash of the
    /// document uploaded to Supabase Storage (the file itself never touches this
    /// contract — this is just an on-chain integrity reference the review UI can check
    /// the uploaded file against). `claimedAmount` mirrors BillPay's `amount` field for
    /// consistency with the on-chain path, though it is self-reported here rather than
    /// cryptographically attested — that trust gap is exactly what validator review
    /// exists to cover.
    function submitBill(uint256 claimedAmount, bytes32 documentHash) external payable returns (uint256 billId) {
        require(msg.value == SUBMISSION_FEE, "BillValidator: incorrect submission fee");
        require(claimedAmount > 0, "BillValidator: claimedAmount must be positive");
        require(documentHash != bytes32(0), "BillValidator: documentHash is empty");

        billId = nextBillId++;
        bills[billId] = BillSubmission({
            payer: msg.sender,
            claimedAmount: claimedAmount,
            documentHash: documentHash,
            submittedAt: block.timestamp,
            status: Status.Pending
        });

        emit BillSubmitted(billId, msg.sender, claimedAmount, documentHash);

        (bool sent,) = address(creditVault).call{value: msg.value}("");
        require(sent, "BillValidator: fee forward to CreditVault failed");
    }

    /// @notice Approve a pending bill. Records the payment on CreditVault exactly as
    /// GroundworkASC would for an on-chain-verified one. Reverts if the bill doesn't
    /// exist or has already been decided.
    function approveBill(uint256 billId) external onlyValidator {
        BillSubmission storage bill = bills[billId];
        require(bill.payer != address(0), "BillValidator: bill does not exist");
        require(bill.status == Status.Pending, "BillValidator: bill already decided");

        bill.status = Status.Approved;

        creditVault.recordVerifiedPayment(bill.payer, bill.claimedAmount, bill.submittedAt);

        emit BillApproved(billId, bill.payer, bill.claimedAmount);
    }

    /// @notice Reject a pending bill. No refund of the submission fee — it already
    /// went to CreditVault's pool on submission, and the fee is friction on submitting
    /// for review, not a stake on the outcome.
    function rejectBill(uint256 billId, string calldata reason) external onlyValidator {
        BillSubmission storage bill = bills[billId];
        require(bill.payer != address(0), "BillValidator: bill does not exist");
        require(bill.status == Status.Pending, "BillValidator: bill already decided");

        bill.status = Status.Rejected;

        emit BillRejected(billId, bill.payer, reason);
    }

    /// @notice Convenience view for the validator review UI — returns every bill still
    /// awaiting a decision. Fine at demo scale; would need pagination or an off-chain
    /// indexer (the same Supabase bill_submissions table) if the pending queue ever
    /// grew large, since this loops over every bill ever submitted.
    function getPendingBillIds() external view returns (uint256[] memory pendingIds) {
        uint256 count;
        for (uint256 i = 0; i < nextBillId; i++) {
            if (bills[i].status == Status.Pending) count++;
        }

        pendingIds = new uint256[](count);
        uint256 j;
        for (uint256 i = 0; i < nextBillId; i++) {
            if (bills[i].status == Status.Pending) {
                pendingIds[j] = i;
                j++;
            }
        }
    }
}
