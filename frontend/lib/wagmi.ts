import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  coinbaseWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { creditcoinTestnet } from "./chains";

// Two chains, two purposes (docs/architecture-and-design.md §2):
//   Sepolia          — user signs BillPay.payBill() directly
//   Creditcoin Testnet — user signs CreditVault.borrow() directly
// The backend/worker never touch either of these user-signed transactions;
// they only relay the *proof* of the Sepolia payment.
//
// WalletConnect's QR-code connector is deliberately excluded here (not just
// omitted from a "recommended" list) — its bundled modal UI currently
// crashes with "invalid border=0" on the latest available RainbowKit
// (2.2.11) + @walletconnect/ethereum-provider combination, and no newer
// RainbowKit release exists yet to fix it (verified: 2.2.11 is npm's
// current `latest` tag). injectedWallet already covers any EIP-6963
// browser-extension wallet generically (this is how SafePal connects
// today without a dedicated connector), so MetaMask/Coinbase/SafePal/etc.
// all still work via the standard flow — only the QR-scan-a-mobile-wallet
// path is unavailable until this upstream bug is fixed.
const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [metaMaskWallet, coinbaseWallet, injectedWallet],
    },
  ],
  {
    appName: "Groundwork",
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
  },
);

export const wagmiConfig = createConfig({
  connectors,
  chains: [sepolia, creditcoinTestnet],
  transports: {
    [sepolia.id]: http(),
    [creditcoinTestnet.id]: http(),
  },
  ssr: true,
});
