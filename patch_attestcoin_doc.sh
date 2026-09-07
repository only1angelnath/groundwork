python3 << 'PYEOF'
path = "docs/attestcoin-integration.md"
with open(path) as f:
    content = f.read()

old = '''**Current (live in production):**

| Contract | Chain | Address |
|---|---|---|
| `BillPay.sol` | Ethereum Sepolia | `0xF0572C9E81943374f8A707F6821710D2262E8B22` |
| `EvmV1Decoder` library | Creditcoin CC3 Testnet | `0x16b79d87f11883bb57a3d42480804B637e5a2f8D` |
| `CreditVault.sol` (v2, adds `repay()`) | Creditcoin CC3 Testnet | `0x21209299B5B21F0f599f19aF5C1a9D8EF96cC74A` |
| `GroundworkASC.sol` | Creditcoin CC3 Testnet | `0x77e07d8626E506498D01F8B504305C856473A6b4` |

**Superseded (v1, pre-`repay()`, dead — kept here only for the record):**

| Contract | Chain | Address |
|---|---|---|
| `CreditVault.sol` (v1) | Creditcoin CC3 Testnet | `0xF0572C9E81943374f8A707F6821710D2262E8B22` |
| `GroundworkASC.sol` (v1) | Creditcoin CC3 Testnet | `0x9fa9Cd49d73449A5AC03E7d957048675C6AC04bE` |

**Pending (v3, written and tested, not yet deployed):** `CreditVault`
replaces its single-recorder (`asc`) design with a `mapping(address =>
bool) isRecorder` set plus `addRecorder()`/`removeRecorder()`, so more
than one validator address — not just `GroundworkASC` — can call
`recordVerifiedPayment`. This is preparation for the validator-approved
bill-upload path (see `docs/HANDOFF.md`'s "Next" section); `GroundworkASC`
itself is unchanged, it just needs redeploying to point at the new vault
address once v3 goes live (its `creditVault` reference is immutable).'''

new = '''**Current (live in production):**

| Contract | Chain | Address |
|---|---|---|
| `BillPay.sol` | Ethereum Sepolia | `0xF0572C9E81943374f8A707F6821710D2262E8B22` |
| `EvmV1Decoder` library | Creditcoin CC3 Testnet | `0x16b79d87f11883bb57a3d42480804B637e5a2f8D` |
| `CreditVault.sol` (v3, multi-recorder) | Creditcoin CC3 Testnet | `0xe5233ee60688A151AB47F788E164eA9BB013AB05` |
| `GroundworkASC.sol` (redeployed, points at v3 vault) | Creditcoin CC3 Testnet | `0x182F1DbfE77784bC2f575233829A253c4bCC7D16` |
| `BillValidator.sol` | Creditcoin CC3 Testnet | `0x63E11DFA6E0141d52ceB0Bac88B41aAf273e9c28` |
| `SoulboundBillRecord.sol` | Creditcoin CC3 Testnet | `0x19B9BC1905Fba793A4ff469262B2626fd74c6F6f` |

`CreditVault` v3 replaced its single-recorder (`asc`) design with a
`mapping(address => bool) isRecorder` set plus
`addRecorder()`/`removeRecorder()`, so more than one address can call
`recordVerifiedPayment` — both `GroundworkASC` (the automated Sepolia-
attestation path) and `BillValidator` (the manual upload/review path,
see `docs/HANDOFFphase7.md`) are authorized recorders on the live v3
vault, confirmed via `isRecorder()`. `SoulboundBillRecord` is a
non-transferable ERC-721 minted by `BillValidator` on approval — the
permanent on-chain receipt for a manually-reviewed bill. Both are
authorized: `CreditVault.addRecorder(BillValidator)` and
`SoulboundBillRecord.addMinter(BillValidator)`.

**Superseded (dead — kept here only for the record):**

| Contract | Chain | Address |
|---|---|---|
| `CreditVault.sol` (v2, adds `repay()`) | Creditcoin CC3 Testnet | `0x21209299B5B21F0f599f19aF5C1a9D8EF96cC74A` |
| `GroundworkASC.sol` (v2-wired) | Creditcoin CC3 Testnet | `0x77e07d8626E506498D01F8B504305C856473A6b4` |
| `CreditVault.sol` (v1) | Creditcoin CC3 Testnet | `0xF0572C9E81943374f8A707F6821710D2262E8B22` |
| `GroundworkASC.sol` (v1) | Creditcoin CC3 Testnet | `0x9fa9Cd49d73449A5AC03E7d957048675C6AC04bE` |'''

assert old in content, "expected block not found — check for drift before patching"
content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("Patched docs/attestcoin-integration.md")
PYEOF
