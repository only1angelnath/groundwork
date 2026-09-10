// Small inlined ABI fragments — NOT the full ABIs. Mirrors the relevant
// functions from shared/abis/BillPay.json and shared/abis/CreditVault.json.
// Reason for inlining rather than importing shared/abis directly: Next.js
// can't cleanly resolve ../shared/abis from outside the frontend/ root
// without extra webpack config (docs/HANDOFFphase5.md, step 4).
//
// CreditVault v2 (Phase 5.5): added repay() and loanOf() after the v1
// vault turned out to have no way to reclaim posted collateral. Redeployed
// on Creditcoin CC3 Testnet — GroundworkASC had to be redeployed alongside
// it since it stores the vault address as immutable. BillPay on Sepolia
// was untouched.
//
// CreditVault v4 (security-audit follow-up, Sept 2026): recordVerifiedPayment
// now tiers its collateral step-down by claimed amount instead of a flat
// rate — see docs/collateral-tiers-addendum.md. Redeployed alongside
// GroundworkASC and, for the first time, BillValidator too (it also holds
// an immutable creditVault reference — see the same doc for why).
// SoulboundBillRecord did NOT need redeploying (its minter set is
// owner-managed, not immutable) — only re-authorized for the new
// BillValidator via addMinter.

export const BILLPAY_ABI = [
  {
    type: "function",
    name: "payBill",
    stateMutability: "payable",
    inputs: [{ name: "payee", type: "address" }],
    outputs: [],
  },
] as const;

export const CREDIT_VAULT_ABI = [
  {
    type: "function",
    name: "scoreOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "requiredCollateralRatioOf",
    stateMutability: "view",
    inputs: [{ name: "payer", type: "address" }],
    outputs: [{ name: "ratioBps", type: "uint256" }],
  },
  {
    type: "function",
    name: "loanOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "principal", type: "uint256" },
      { name: "collateral", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "borrow",
    stateMutability: "payable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "repay",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

// Deployed addresses. Env vars let you override without a redeploy;
// fallbacks are the real addresses currently live on Sepolia / Creditcoin
// CC3 Testnet.
export const BILLPAY_ADDRESS = (process.env.NEXT_PUBLIC_BILLPAY_ADDRESS ??
  "0xF0572C9E81943374f8A707F6821710D2262E8B22") as `0x${string}`;

// v4 CreditVault (security-audit follow-up, Sept 2026) — tiered step-down,
// replaces the v3 address.
export const CREDIT_VAULT_ADDRESS = (process.env
  .NEXT_PUBLIC_CREDIT_VAULT_ADDRESS ??
  "0x7C458Ef4347D95449c021350e9FdCcb548474Bf4") as `0x${string}`;

// Demo billers — symbolic addresses labelled as recognizable use cases so
// the demo reads as a real product rather than one placeholder button.
// Both point at wallets Angel controls; real biller integration is
// explicitly out of scope for this hackathon (see FAQ).
export const DEMO_BILLERS = [
  {
    label: "Rent",
    address: process.env.NEXT_PUBLIC_DEMO_PAYEE_ADDRESS as
      | `0x${string}`
      | undefined,
  },
  {
    label: "Electricity",
    address: process.env.NEXT_PUBLIC_DEMO_PAYEE_ADDRESS_2 as
      | `0x${string}`
      | undefined,
  },
] as const;

// Fixed demo payment amount, matching the Phase 1 proof-of-concept.
export const DEMO_BILL_AMOUNT_ETH = "0.001";

// Maps a known demo biller address back to its friendly label for display
// in the payment history / status tracker. Falls back to a truncated
// address for anything else (shouldn't normally happen, since payee is
// always one of DEMO_BILLERS today, but this keeps the UI safe if that
// ever changes).
export function getBillerLabel(address: string): string {
  const lower = address.toLowerCase();
  const match = DEMO_BILLERS.find(
    (b) => b.address && b.address.toLowerCase() === lower
  );
  if (match) return match.label;
  return address.slice(0, 6) + "..." + address.slice(-4);
}

// BillValidator (Phase 6.5, validator/upload system) — only the functions
// the frontend calls directly: submitBill (upload page), approveBill/
// rejectBill (validator review page), SUBMISSION_FEE (upload page, to
// send the exact right value). getPendingBillIds/bills are read by the
// backend instead (see backend/chain_bills.py) since that route already
// needs a service-role Supabase client for signed URLs.
export const BILL_VALIDATOR_ABI = [
  {
    type: "function",
    name: "submitBill",
    stateMutability: "payable",
    inputs: [
      { name: "claimedAmount", type: "uint256" },
      { name: "documentHash", type: "bytes32" },
    ],
    outputs: [{ name: "billId", type: "uint256" }],
  },
  {
    type: "function",
    name: "approveBill",
    stateMutability: "nonpayable",
    inputs: [{ name: "billId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "rejectBill",
    stateMutability: "nonpayable",
    inputs: [
      { name: "billId", type: "uint256" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "SUBMISSION_FEE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const BILL_VALIDATOR_ADDRESS = (process.env
  .NEXT_PUBLIC_BILL_VALIDATOR_ADDRESS ??
  "0xB44C6EB9fd286Ec9dc87ECc23A05b876404D6C94") as `0x${string}`;

// SoulboundBillRecord — the non-transferable ERC-721 minted by BillValidator
// on approval (see contracts/src/SoulboundBillRecord.sol). Deliberately NOT
// enumerable (no tokenOfOwnerByIndex) — a wallet's receipts are read instead
// via RecordMinted's indexed `payer` topic, filtered client-side with
// getContractEvents (see lib/useSbtReceipts.ts). balanceOf is kept as a
// reliable fallback count if the log fetch ever fails.
export const SOULBOUND_BILL_RECORD_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "RecordMinted",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "billId", type: "uint256", indexed: true },
      { name: "claimedAmount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const SOULBOUND_BILL_RECORD_ADDRESS =
  "0x19B9BC1905Fba793A4ff469262B2626fd74c6F6f" as `0x${string}`;
