// Small inlined ABI fragments — NOT the full ABIs. Mirrors the relevant
// functions from shared/abis/BillPay.json and shared/abis/CreditVault.json.
// Reason for inlining rather than importing shared/abis directly: Next.js
// can't cleanly resolve ../shared/abis from outside the frontend/ root
// without extra webpack config, and contracts are frozen/deployed at this
// point (docs/HANDOFFphase5.md, step 4). If either contract's ABI ever
// changes, update shared/abis/*.json AND this file together.

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
] as const;

// Deployed addresses (docs/attestcoin-integration.md). Env vars let you
// override without a redeploy; fallbacks are the real addresses already
// live on Sepolia / Creditcoin CC3 Testnet.
export const BILLPAY_ADDRESS = (process.env.NEXT_PUBLIC_BILLPAY_ADDRESS ??
  "0xF0572C9E81943374f8A707F6821710D2262E8B22") as `0x${string}`;

export const CREDIT_VAULT_ADDRESS = (process.env
  .NEXT_PUBLIC_CREDIT_VAULT_ADDRESS ??
  "0xF0572C9E81943374f8A707F6821710D2262E8B22") as `0x${string}`;

// Demo payee — symbolic for the hackathon demo (docs/HANDOFFphase5.md:
// "For the demo, payee is symbolic — use a fixed address you already
// control"). MUST be set before the demo; the Dashboard disables the
// pay-bill button and shows a warning if this is unset.
export const DEMO_PAYEE_ADDRESS = process.env.NEXT_PUBLIC_DEMO_PAYEE_ADDRESS as
  | `0x${string}`
  | undefined;

// Fixed demo payment amount, matching the Phase 1 proof-of-concept.
export const DEMO_BILL_AMOUNT_ETH = "0.001";
