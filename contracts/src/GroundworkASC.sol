// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";

/// @notice Struct layouts and the view-only `verify` here are kept byte-identical with
/// the canonical interface vendored in the gluwa usc-contracts package
/// (write-ability/INativeQueryVerifier.sol), confirmed against the published package.
/// `verifyAndEmit` is additionally declared here — the published package only vendors
/// `verify`, but Creditcoin's own ASC reference pattern (docs.creditcoin.org, Attestcoin
/// Smart Contracts page) calls `verifyAndEmit` for the state-changing, event-emitting path.
interface INativeQueryVerifier {
    struct MerkleProofEntry {
        bytes32 hash;
        bool isLeft;
    }

    struct MerkleProof {
        bytes32 root;
        MerkleProofEntry[] siblings;
    }

    struct ContinuityProof {
        bytes32 lowerEndpointDigest;
        bytes32[] roots;
    }

    function verify(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external view returns (bool);

    function verifyAndEmit(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external returns (bool);
}

interface ICreditVault {
    function recordVerifiedPayment(address payer, uint256 amount, uint256 timestamp) external;
}

/// @title GroundworkASC
/// @notice Deployed on Creditcoin CC3 Testnet. Verifies a BillPay.sol `BillPaid` event
/// from Ethereum Sepolia via the Block Prover Precompile (address 0x...0FD2), then
/// forwards the verified payment to CreditVault. Follows the reference ASC pattern from
/// docs.creditcoin.org (Attestcoin Smart Contracts): verify -> replay-check -> extract
/// -> execute business logic, all in one transaction.
contract GroundworkASC {
    /// @dev Block Prover Precompile address, confirmed against
    /// the gluwa usc-contracts package's NativeQueryVerifierLib.PRECOMPILE_ADDRESS.
    address constant PRECOMPILE_ADDRESS = 0x0000000000000000000000000000000000000FD2;
    INativeQueryVerifier constant VERIFIER = INativeQueryVerifier(PRECOMPILE_ADDRESS);

    /// @dev keccak256("BillPaid(address,address,uint256,uint256)")
    bytes32 public constant BILL_PAID_EVENT_SIGNATURE =
        0x4112c87bb6b33df7c39789e375cbdef65ff342a26cfd011bc0b40b80496769e1;

    ICreditVault public immutable creditVault;

    /// @notice The Attestcoin Protocol chain key for the source chain BillPay.sol is
    /// deployed on (e.g. Ethereum Sepolia). Set at deploy time rather than hardcoded,
    /// since the exact key depends on which testnet environment this is pointed at —
    /// confirm the current value against docs.creditcoin.org's chains/environments page
    /// before deploying, chain keys are environment-specific and have changed before.
    uint64 public immutable sourceChainKey;

    /// @notice Replay protection: once a given (chainKey, blockHeight, encodedTransaction)
    /// tuple has been processed, it can never be processed again.
    mapping(bytes32 => bool) public processedTransactions;

    event PaymentVerified(
        address indexed payer, address indexed payee, uint256 amount, uint256 timestamp, bytes32 indexed txKey
    );

    constructor(address _creditVault, uint64 _sourceChainKey) {
        require(_creditVault != address(0), "GroundworkASC: creditVault is the zero address");
        creditVault = ICreditVault(_creditVault);
        sourceChainKey = _sourceChainKey;
    }

    /// @notice Called by the Python readability worker once it has fetched a proof for a
    /// Sepolia BillPay transaction. Verifies the proof synchronously against the
    /// precompile, extracts the BillPaid event from the verified transaction bytes, and
    /// records the payment in CreditVault — all in this one transaction.
    function verifyBillProof(
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        INativeQueryVerifier.MerkleProof calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) external returns (address payer, uint256 amount, uint256 timestamp) {
        bytes32 txKey = keccak256(abi.encodePacked(sourceChainKey, blockHeight, encodedTransaction));
        require(!processedTransactions[txKey], "GroundworkASC: transaction already processed");

        bool verified =
            VERIFIER.verifyAndEmit(sourceChainKey, blockHeight, encodedTransaction, merkleProof, continuityProof);
        require(verified, "GroundworkASC: proof verification failed");

        // Mark processed immediately after verification succeeds, before any further
        // logic that could revert for an unrelated reason and be retried maliciously.
        processedTransactions[txKey] = true;

        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        require(EvmV1Decoder.isValidTransactionType(txType), "GroundworkASC: unsupported transaction type");

        // The precompile only proves inclusion, not success — the ASC itself must check
        // the receipt status, per docs.creditcoin.org's own explicit warning on this.
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        require(receipt.receiptStatus == 1, "GroundworkASC: source transaction did not succeed");

        EvmV1Decoder.LogEntry[] memory billPaidLogs =
            EvmV1Decoder.getLogsByEventSignature(receipt, BILL_PAID_EVENT_SIGNATURE);
        require(billPaidLogs.length > 0, "GroundworkASC: no BillPaid event found in transaction");

        EvmV1Decoder.LogEntry memory log = billPaidLogs[0];
        require(log.topics.length == 3, "GroundworkASC: unexpected BillPaid topic count");
        require(log.topics[0] == BILL_PAID_EVENT_SIGNATURE, "GroundworkASC: topic[0] is not BillPaid");

        payer = address(uint160(uint256(log.topics[1])));
        address payee = address(uint160(uint256(log.topics[2])));
        require(log.data.length == 64, "GroundworkASC: unexpected BillPaid data length");
        (amount, timestamp) = abi.decode(log.data, (uint256, uint256));

        creditVault.recordVerifiedPayment(payer, amount, timestamp);

        emit PaymentVerified(payer, payee, amount, timestamp, txKey);
    }
}
