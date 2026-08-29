#!/usr/bin/env python3
"""
Phase 2 integration test driver.

Fetches the BillPaid event emitted on the local Anvil instance (set up by
run_integration_test.sh) and runs it through the REAL pipeline:

    listener.process_event()
        -> prover_client.get_proof()   [PROVER_API_URL points at mock_prover_server.py]
        -> submitter.submit_proof()    [points at the REAL Creditcoin CC3 Testnet + relayer]

This deliberately does NOT call listener.run_forever() — a single
deterministic call to process_event() is easier to assert on than a
polling loop, and this test only needs to prove the pipeline's plumbing is
correct end-to-end, not the loop's scheduling behavior.

Expected result: submitter.AlreadyProcessedError, since the mock prover
always serves the Phase 1 proof, and that exact transaction is already
recorded in GroundworkASC.processedTransactions on the real deployed
contract. This is a PASS for this test, not a failure — see
tests/mock_prover_server.py's docstring for why that's the intended check.

Usage (env vars set by run_integration_test.sh before invoking this):
    python3 tests/test_integration.py <billpay_address> <payer_address> <payee_address>
"""
from __future__ import annotations

import io
import json
import logging
import sys
from pathlib import Path

from web3 import Web3

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")

import os

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import listener  # noqa: E402  (import after sys.path fix, and after env vars are set by the shell wrapper)
import submitter  # noqa: E402

_ABI_DIR = Path(__file__).resolve().parent.parent.parent / "shared" / "abis"


def _load_abi(name: str) -> list:
    with open(_ABI_DIR / f"{name}.json") as f:
        return json.load(f)


def main() -> None:
    if len(sys.argv) != 4:
        print("Usage: python3 tests/test_integration.py <billpay_address> <payer_address> <payee_address>")
        sys.exit(1)

    billpay_address, payer_address, payee_address = sys.argv[1], sys.argv[2], sys.argv[3]

    sepolia_w3 = Web3(Web3.HTTPProvider(os.environ["SEPOLIA_RPC_URL"]))
    creditcoin_w3 = Web3(Web3.HTTPProvider(os.environ["CREDITCOIN_TESTNET_RPC_URL"]))

    if not sepolia_w3.is_connected():
        print("FAIL: could not connect to local Anvil instance — is it running?")
        sys.exit(1)
    if not creditcoin_w3.is_connected():
        print("FAIL: could not connect to real Creditcoin CC3 Testnet RPC")
        sys.exit(1)

    billpay_abi = _load_abi("BillPay")
    creditvault_abi = _load_abi("CreditVault")
    billpay = sepolia_w3.eth.contract(address=Web3.to_checksum_address(billpay_address), abi=billpay_abi)

    print(f"Scanning local Anvil chain (tip={sepolia_w3.eth.block_number}) for BillPaid events...")
    events = billpay.events.BillPaid.get_logs(from_block=0, to_block="latest")

    matching = [
        e for e in events
        if e["args"]["payer"].lower() == payer_address.lower()
        and e["args"]["payee"].lower() == payee_address.lower()
    ]
    if not matching:
        print(f"FAIL: no BillPaid event found for payer={payer_address} payee={payee_address}")
        print(f"      (found {len(events)} BillPaid events total on this local chain)")
        sys.exit(1)

    event = matching[-1]
    print(f"Found event: payer={event['args']['payer']} payee={event['args']['payee']} "
          f"amount={event['args']['amount']} tx={event['transactionHash'].hex()}")

    print("\nRunning listener.process_event() — expect prover_client to hit the mock server, "
          "then submitter to hit the REAL GroundworkASC on Creditcoin...\n")
    print("NOTE: process_event() deliberately CATCHES AlreadyProcessedError internally and")
    print("returns normally (that's correct production behavior — a duplicate event should be")
    print("a silent no-op, not a crash). This test checks the logs for that internal handling")
    print("rather than expecting the exception to propagate up to us.\n")

    log_capture = io.StringIO()
    handler = logging.StreamHandler(log_capture)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logging.getLogger("groundwork.worker.submitter").addHandler(handler)

    try:
        listener.process_event(event, billpay_abi, creditvault_abi, creditcoin_w3)
    except Exception as exc:
        print(f"\nFAIL: unexpected exception: {type(exc).__name__}: {exc}")
        sys.exit(1)

    captured = log_capture.getvalue()
    if "already processed on-chain" in captured:
        print("\nPASS: submitter correctly detected GroundworkASC's on-chain replay guard,")
        print("raised AlreadyProcessedError internally, and listener.process_event() correctly")
        print("caught it and treated it as a successful no-op. This confirms:")
        print("  1. listener.process_event's full plumbing works end-to-end (event -> proof -> submit)")
        print("  2. submitter.py correctly detects and handles GroundworkASC's on-chain replay guard")
        print("  3. listener.py correctly treats a replay as success, not a failure")
        sys.exit(0)

    print("\nUNEXPECTED: process_event() completed but no 'already processed' log was seen.")
    print("Either the mock prover isn't serving the Phase 1 proof, or GroundworkASC's replay")
    print("guard didn't fire as expected — investigate before trusting this as a pass.")
    sys.exit(1)


if __name__ == "__main__":
    main()