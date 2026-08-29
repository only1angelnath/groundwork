import { defineChain } from "viem";

// Creditcoin CC3 Testnet — EVM chain ID and RPC confirmed against
// docs.creditcoin.org/smart-contract-guides/creditcoin-endpoints.
// This is where CreditVault.sol and GroundworkASC.sol are deployed, and
// where the user signs borrow() directly (frontend -> Creditcoin, never
// through the backend — see docs/architecture-and-design.md §2).
export const creditcoinTestnet = defineChain({
  id: 102031,
  name: "Creditcoin Testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "tCTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.cc3-testnet.creditcoin.network"] },
  },
  blockExplorers: {
    default: {
      name: "Creditcoin Testnet Explorer",
      url: "https://creditcoin3-testnet.subscan.io",
    },
  },
  testnet: true,
});
