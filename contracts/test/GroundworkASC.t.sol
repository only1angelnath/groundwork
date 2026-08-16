// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {GroundworkASC, INativeQueryVerifier} from "../src/GroundworkASC.sol";

/// @dev Always returns false from verifyAndEmit — used to prove GroundworkASC correctly
/// rejects a failed precompile verification rather than proceeding anyway.
contract RejectingMockVerifier {
    function verify(uint64, uint64, bytes calldata, INativeQueryVerifier.MerkleProof calldata, INativeQueryVerifier.ContinuityProof calldata)
        external
        pure
        returns (bool)
    {
        return false;
    }

    function verifyAndEmit(
        uint64,
        uint64,
        bytes calldata,
        INativeQueryVerifier.MerkleProof calldata,
        INativeQueryVerifier.ContinuityProof calldata
    ) external pure returns (bool) {
        return false;
    }
}

/// @notice Covers what's genuinely unit-testable without a real Sepolia-attested proof:
/// constructor guards and the precompile-rejection path. The full verify -> decode ->
/// extract -> record path needs a real EvmV1Decoder-encoded transaction blob, which is
/// exactly what Phase 1's manual curl + cast send proof-of-concept produces — that's the
/// right place to exercise it, not a fabricated blob here.
contract GroundworkASCTest is Test {
    address constant PRECOMPILE_ADDRESS = 0x0000000000000000000000000000000000000FD2;

    function test_Constructor_RevertsOnZeroCreditVault() public {
        vm.expectRevert("GroundworkASC: creditVault is the zero address");
        new GroundworkASC(address(0), 1);
    }

    function test_Constructor_SetsSourceChainKey() public {
        GroundworkASC asc = new GroundworkASC(address(0xC0FFEE), 1);
        assertEq(asc.sourceChainKey(), 1);
    }

    function test_VerifyBillProof_RevertsWhenPrecompileRejects() public {
        // Place the rejecting mock's bytecode at the real precompile address so the
        // ASC's hardcoded VERIFIER call resolves to it.
        RejectingMockVerifier mock = new RejectingMockVerifier();
        vm.etch(PRECOMPILE_ADDRESS, PRECOMPILE_ADDRESS.code.length > 0 ? PRECOMPILE_ADDRESS.code : address(mock).code);

        GroundworkASC asc = new GroundworkASC(address(0xC0FFEE), 1);

        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](0);
        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({root: bytes32(0), siblings: siblings});
        bytes32[] memory roots = new bytes32[](0);
        INativeQueryVerifier.ContinuityProof memory continuityProof =
            INativeQueryVerifier.ContinuityProof({lowerEndpointDigest: bytes32(0), roots: roots});

        vm.expectRevert("GroundworkASC: proof verification failed");
        asc.verifyBillProof(1, hex"00", merkleProof, continuityProof);
    }
}
