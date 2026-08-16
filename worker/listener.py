"""
Sepolia event listener — Phase 2.

Watches BillPay.sol's BillPaid event and hands each new event off to the
attestation pipeline (prover_client.py -> submitter.py). Left as a stub
during Phase 0; implemented once BillPay.sol exists and is deployed
(Phase 1) and this can be pointed at a real contract address.
"""

def main() -> None:
    raise NotImplementedError("Implement in Phase 2, once BillPay.sol is deployed.")


if __name__ == "__main__":
    main()
