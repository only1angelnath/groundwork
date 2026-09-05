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

// v3 CreditVault (Phase 6) — multi-recorder redesign, replaces the v2 address.
export const CREDIT_VAULT_ADDRESS = (process.env
  .NEXT_PUBLIC_CREDIT_VAULT_ADDRESS ??
  "0xe5233ee60688A151AB47F788E164eA9BB013AB05") as `0x${string}`;

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
