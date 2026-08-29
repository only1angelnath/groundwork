#!/usr/bin/env bash
# Phase 2 integration test — per docs/build-roadmap.md's testing strategy:
# "run [the worker] against a local Anvil fork of Sepolia first, with a
# mocked Prover API response, before ever pointing it at the real testnet."
#
# What this does:
#   1. Starts a local Anvil instance standing in for Sepolia.
#   2. Deploys a fresh BillPay.sol to it and calls payBill() to emit a real
#      BillPaid event.
#   3. Starts the mock Prover server (tests/mock_prover_server.py), which
#      always serves the real Phase 1 proof regardless of what's asked.
#   4. Runs tests/test_integration.py, which feeds that local event through
#      the REAL pipeline: prover_client -> submitter -> the REAL
#      GroundworkASC on Creditcoin CC3 Testnet, using the funded relayer.
#   5. Tears everything down (Anvil, mock server) on exit, success or fail.
#
# The Creditcoin side is intentionally NOT mocked — GroundworkASC's proof
# verification depends on the real Block Prover Precompile at
# 0x...0FD2, which only exists on real Creditcoin, so a local mock of that
# side would test nothing meaningful.
#
# Usage (from worker/):
#   ./tests/run_integration_test.sh
#
# Requires: anvil, forge, cast on PATH; worker/.env filled in with a real,
# FUNDED RELAYER_PRIVATE_KEY and real CREDITCOIN_TESTNET_RPC_URL /
# GROUNDWORK_ASC_ADDRESS / CREDIT_VAULT_ADDRESS.

set -euo pipefail

WORKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$WORKER_DIR/.." && pwd)"
ANVIL_PORT=8545
MOCK_PROVER_PORT=8765
ANVIL_LOG="$WORKER_DIR/tests/.anvil.log"
MOCK_PROVER_LOG="$WORKER_DIR/tests/.mock_prover.log"

# Anvil's well-known default account #0 — funded with test ETH automatically,
# safe to hardcode since this is a throwaway local chain, never real funds.
ANVIL_DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ANVIL_ACCOUNT_0="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
ANVIL_ACCOUNT_1="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"  # used as the demo payee

ANVIL_PID=""
MOCK_PROVER_PID=""

cleanup() {
    echo ""
    echo "Tearing down..."
    if [[ -n "$ANVIL_PID" ]] && kill -0 "$ANVIL_PID" 2>/dev/null; then
        kill "$ANVIL_PID" 2>/dev/null || true
        echo "  Stopped Anvil (pid $ANVIL_PID)"
    fi
    if [[ -n "$MOCK_PROVER_PID" ]] && kill -0 "$MOCK_PROVER_PID" 2>/dev/null; then
        kill "$MOCK_PROVER_PID" 2>/dev/null || true
        echo "  Stopped mock Prover server (pid $MOCK_PROVER_PID)"
    fi
}
trap cleanup EXIT

for bin in anvil forge cast; do
    if ! command -v "$bin" &>/dev/null; then
        echo "FAIL: '$bin' not found on PATH — install Foundry first (see contracts/README.md)."
        exit 1
    fi
done

if [[ ! -f "$WORKER_DIR/.env" ]]; then
    echo "FAIL: $WORKER_DIR/.env not found — fill it in from .env.example first"
    echo "      (needs a real, funded RELAYER_PRIVATE_KEY and real Creditcoin RPC/contract addresses)."
    exit 1
fi

echo "Loading worker/.env for Creditcoin-side config (relayer key, Prover URL will be overridden)..."
set -a
# shellcheck disable=SC1091
source "$WORKER_DIR/.env"
set +a

echo ""
echo "=== Step 1: Starting local Anvil (standing in for Sepolia) on port $ANVIL_PORT ==="
anvil --port "$ANVIL_PORT" > "$ANVIL_LOG" 2>&1 &
ANVIL_PID=$!
sleep 1
if ! kill -0 "$ANVIL_PID" 2>/dev/null; then
    echo "FAIL: Anvil did not start — check $ANVIL_LOG"
    exit 1
fi
echo "  Anvil running (pid $ANVIL_PID), log: $ANVIL_LOG"

echo ""
echo "=== Step 2: Deploying BillPay.sol to local Anvil ==="
DEPLOY_OUTPUT=$(forge create "$REPO_ROOT/contracts/src/BillPay.sol:BillPay" \
    --rpc-url "http://localhost:$ANVIL_PORT" \
    --private-key "$ANVIL_DEPLOYER_KEY" \
    --broadcast \
    --root "$REPO_ROOT/contracts")
BILLPAY_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "Deployed to:" | awk '{print $3}')
if [[ -z "$BILLPAY_ADDRESS" ]]; then
    echo "FAIL: could not parse deployed BillPay address from forge create output:"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi
echo "  BillPay deployed at $BILLPAY_ADDRESS"

echo ""
echo "=== Step 3: Calling payBill() to emit a real BillPaid event ==="
cast send "$BILLPAY_ADDRESS" "payBill(address)" "$ANVIL_ACCOUNT_1" \
    --value 0.001ether \
    --rpc-url "http://localhost:$ANVIL_PORT" \
    --private-key "$ANVIL_DEPLOYER_KEY" > /dev/null
echo "  payBill() sent: payer=$ANVIL_ACCOUNT_0 payee=$ANVIL_ACCOUNT_1"

echo ""
echo "=== Step 4: Starting mock Prover server on port $MOCK_PROVER_PORT ==="
python3 "$WORKER_DIR/tests/mock_prover_server.py" "$MOCK_PROVER_PORT" > "$MOCK_PROVER_LOG" 2>&1 &
MOCK_PROVER_PID=$!
sleep 1
if ! kill -0 "$MOCK_PROVER_PID" 2>/dev/null; then
    echo "FAIL: mock Prover server did not start — check $MOCK_PROVER_LOG"
    exit 1
fi
echo "  Mock Prover running (pid $MOCK_PROVER_PID), log: $MOCK_PROVER_LOG"

echo ""
echo "=== Step 5: Running the real pipeline (listener -> mock Prover -> REAL GroundworkASC) ==="
echo ""

export SEPOLIA_RPC_URL="http://localhost:$ANVIL_PORT"
export BILLPAY_CONTRACT_ADDRESS="$BILLPAY_ADDRESS"
export PROVER_API_URL="http://localhost:$MOCK_PROVER_PORT"
# CREDITCOIN_TESTNET_RPC_URL, GROUNDWORK_ASC_ADDRESS, CREDIT_VAULT_ADDRESS,
# RELAYER_PRIVATE_KEY all come from worker/.env, loaded above — real values,
# this step genuinely submits to real Creditcoin CC3 Testnet.

cd "$WORKER_DIR"
python3 tests/test_integration.py "$BILLPAY_ADDRESS" "$ANVIL_ACCOUNT_0" "$ANVIL_ACCOUNT_1"
TEST_EXIT_CODE=$?

echo ""
if [[ $TEST_EXIT_CODE -eq 0 ]]; then
    echo "=== Integration test PASSED ==="
else
    echo "=== Integration test FAILED (exit $TEST_EXIT_CODE) ==="
fi
exit $TEST_EXIT_CODE
