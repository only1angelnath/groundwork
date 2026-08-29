import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";
import { creditcoinTestnet } from "./chains";

// Two chains, two purposes (docs/architecture-and-design.md §2):
//   Sepolia          — user signs BillPay.payBill() directly
//   Creditcoin Testnet — user signs CreditVault.borrow() directly
// The backend/worker never touch either of these user-signed transactions;
// they only relay the *proof* of the Sepolia payment.
export const wagmiConfig = getDefaultConfig({
  appName: "Groundwork",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
  chains: [sepolia, creditcoinTestnet],
  ssr: true,
});
