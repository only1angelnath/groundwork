#!/usr/bin/env python3
"""
Reads proof.json (fetched from the Attestcoin Protocol Prover REST API) and
submits it to GroundworkASC.verifyBillProof on Creditcoin CC3 Testnet via
`cast send`. Builds the command programmatically from the JSON so none of
the 32-byte hashes get hand-typed or truncated.

Usage:
    python3 submit_proof.py <GroundworkASC_address> <path_to_proof.json>

Requires: CREDITCOIN_TESTNET_RPC_URL and PRIVATE_KEY already exported in
your shell (source .env first, same as every other command in this
walkthrough).
"""
import json
import os
import subprocess
import sys


def main():
    if len(sys.argv) != 3:
        print("Usage: python3 submit_proof.py <GroundworkASC_address> <path_to_proof.json>")
        sys.exit(1)

    asc_address = sys.argv[1]
    proof_path = sys.argv[2]

    rpc_url = os.environ.get("CREDITCOIN_TESTNET_RPC_URL")
    private_key = os.environ.get("PRIVATE_KEY")
    if not rpc_url or not private_key:
        print("CREDITCOIN_TESTNET_RPC_URL and/or PRIVATE_KEY not set in this shell.")
        print("Run: set -a && source .env && set +a   (from the contracts/ directory)")
        sys.exit(1)

    with open(proof_path) as f:
        proof = json.load(f)

    block_height = proof["headerNumber"]
    tx_bytes = proof["txBytes"]

    merkle_root = proof["merkleProof"]["root"]
    siblings = proof["merkleProof"]["siblings"]
    siblings_str = "[" + ",".join(
        f'({s["hash"]},{str(s["isLeft"]).lower()})' for s in siblings
    ) + "]"
    merkle_proof_arg = f"({merkle_root},{siblings_str})"

    lower_digest = proof["continuityProof"]["lowerEndpointDigest"]
    roots = proof["continuityProof"]["roots"]
    roots_str = "[" + ",".join(roots) + "]"
    continuity_proof_arg = f"({lower_digest},{roots_str})"

    signature = "verifyBillProof(uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))"

    cmd = [
        "cast", "send", asc_address, signature,
        str(block_height), tx_bytes, merkle_proof_arg, continuity_proof_arg,
        "--rpc-url", rpc_url,
        "--private-key", private_key,
    ]

    print("Running:")
    # Don't print the private key to the terminal
    printable = [c if c != private_key else "<PRIVATE_KEY>" for c in cmd]
    print(" ".join(printable))
    print()

    result = subprocess.run(cmd)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
