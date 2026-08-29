#!/usr/bin/env python3
"""
Mock Attestcoin Protocol Prover REST API — Phase 2 integration testing.

Serves GET /api/v1/proof-by-tx/{chainKey}/{txHash} and always returns the
real proof captured during Phase 1's manual walkthrough
(contracts/proof.json), regardless of what txHash is actually requested.

This is deliberate: Anvil-local transactions can't be attested by the real
Prover (they don't exist on real Sepolia), so there's no way to get a
*fresh* real proof for a fresh local event. Serving the Phase 1 proof lets
the integration test exercise the full pipeline shape (listener ->
prover_client -> submitter -> real GroundworkASC on Creditcoin) using data
that's real and was already proven valid once — and since GroundworkASC's
replay guard means resubmitting it now must be rejected as already
processed, this doubles as a genuine test of submitter.py's
AlreadyProcessedError handling against the real deployed contract.

Stdlib-only (http.server), no extra dependency, since this never ships —
it's a local dev-time tool.

Usage:
    python3 tests/mock_prover_server.py [port]   # default port 8765
"""
from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

_PROOF_PATH = Path(__file__).resolve().parent.parent.parent / "contracts" / "proof.json"


class MockProverHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 (stdlib naming convention)
        parts = self.path.strip("/").split("/")
        # Expected: api/v1/proof-by-tx/{chainKey}/{txHash}
        if len(parts) >= 3 and parts[0] == "api" and parts[1] == "v1" and parts[2] == "proof-by-tx":
            self._serve_proof()
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'{"error": "mock prover: unrecognized path"}')

    def _serve_proof(self) -> None:
        if not _PROOF_PATH.exists():
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f'{{"error": "mock prover: {_PROOF_PATH} not found"}}'.encode())
            return

        with open(_PROOF_PATH) as f:
            proof = json.load(f)

        body = json.dumps(proof).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[mock-prover] {self.address_string()} - {fmt % args}")


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = HTTPServer(("localhost", port), MockProverHandler)
    print(f"[mock-prover] Serving {_PROOF_PATH.name} on http://localhost:{port} for any proof-by-tx request")
    print("[mock-prover] Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[mock-prover] Stopped")


if __name__ == "__main__":
    main()
