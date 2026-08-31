"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { parseEther, formatEther } from "viem";
import { creditcoinTestnet } from "@/lib/chains";
import { CREDIT_VAULT_ABI, CREDIT_VAULT_ADDRESS } from "@/lib/abis";
import { Nav } from "@/components/sections/Nav";
import { Footer } from "@/components/sections/Footer";

export default function BorrowPage() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [amountInput, setAmountInput] = useState("0.01");

  const { data: ratioBps, refetch: refetchRatio } = useReadContract({
    address: CREDIT_VAULT_ADDRESS,
    abi: CREDIT_VAULT_ABI,
    functionName: "requiredCollateralRatioOf",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled: isConnected && !!address },
  });

  const { data: loan, refetch: refetchLoan } = useReadContract({
    address: CREDIT_VAULT_ADDRESS,
    abi: CREDIT_VAULT_ABI,
    functionName: "loanOf",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled: isConnected && !!address },
  });

  const {
    writeContract: writeBorrow,
    data: borrowTxHash,
    isPending: isBorrowSending,
    error: borrowError,
  } = useWriteContract();

  const {
    writeContract: writeRepay,
    data: repayTxHash,
    isPending: isRepaySending,
    error: repayError,
  } = useWriteContract();

  const { isLoading: isBorrowConfirming, isSuccess: isBorrowConfirmed } =
    useWaitForTransactionReceipt({ hash: borrowTxHash });

  const { isLoading: isRepayConfirming, isSuccess: isRepayConfirmed } =
    useWaitForTransactionReceipt({ hash: repayTxHash });

  useEffect(() => {
    if (isBorrowConfirmed || isRepayConfirmed) {
      refetchLoan();
      refetchRatio();
    }
  }, [isBorrowConfirmed, isRepayConfirmed, refetchLoan, refetchRatio]);

  const principal = loan ? (loan as readonly [bigint, bigint])[0] : BigInt(0);
  const collateral = loan
    ? (loan as readonly [bigint, bigint])[1]
    : BigInt(0);
  const hasActiveLoan = principal > BigInt(0);

  const ratio = typeof ratioBps === "bigint" ? ratioBps : BigInt(30000);
  const ratioPercent = Number(ratio) / 100;

  let amountWei: bigint | null = null;
  try {
    amountWei = amountInput ? parseEther(amountInput) : null;
  } catch {
    amountWei = null;
  }
  const requiredCollateralWei =
    amountWei !== null ? (amountWei * ratio) / BigInt(10000) : null;

  async function ensureCreditcoinChain() {
    if (chainId !== creditcoinTestnet.id) {
      await switchChainAsync({ chainId: creditcoinTestnet.id });
    }
  }

  async function handleBorrow() {
    if (!requiredCollateralWei || !amountWei) return;
    await ensureCreditcoinChain();
    writeBorrow({
      address: CREDIT_VAULT_ADDRESS,
      abi: CREDIT_VAULT_ABI,
      functionName: "borrow",
      args: [amountWei],
      value: requiredCollateralWei,
      chainId: creditcoinTestnet.id,
    });
  }

  async function handleRepay() {
    if (principal === BigInt(0)) return;
    await ensureCreditcoinChain();
    writeRepay({
      address: CREDIT_VAULT_ADDRESS,
      abi: CREDIT_VAULT_ABI,
      functionName: "repay",
      args: [],
      value: principal,
      chainId: creditcoinTestnet.id,
    });
  }

  return (
    <main className="flex flex-1 flex-col">
      <Nav />

      <section className="flex flex-col items-center gap-10 px-6 py-16">
        <div className="text-center">
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl">
            <span className="font-semibold text-ink-900">Unlock</span>{" "}
            <span className="font-normal italic text-warmgray-500">
              liquidity
            </span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-warmgray-500">
            Post collateral based on your payment history, borrow instantly,
            and repay whenever you like to reclaim your collateral in full.
          </p>
        </div>

        {!isConnected && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-warmgray-500">
              Connect a wallet to see your rate and borrow.
            </p>
            <ConnectButton />
          </div>
        )}

        {isConnected && (
          <div className="w-full max-w-md space-y-6">
            <div className="rounded-2xl border border-glass-border bg-glass-100 p-6 backdrop-blur-md">
              <p className="text-sm text-warmgray-500">
                Your required collateral ratio
              </p>
              <p className="font-[family-name:var(--font-data)] text-3xl text-brass-500">
                {ratioPercent}%
              </p>
            </div>

            {hasActiveLoan ? (
              <div className="rounded-2xl border border-glass-border bg-glass-100 p-6 backdrop-blur-md">
                <p className="text-sm text-warmgray-500">Active loan</p>
                <p className="font-[family-name:var(--font-data)] text-2xl text-ink-900">
                  {formatEther(principal)} ETH borrowed
                </p>
                <p className="mt-1 font-[family-name:var(--font-data)] text-sm text-warmgray-500">
                  {formatEther(collateral)} ETH collateral locked
                </p>

                <button
                  onClick={handleRepay}
                  disabled={isRepaySending || isRepayConfirming}
                  className="mt-6 w-full rounded-full bg-gradient-to-r from-pink-500 to-pink-400 px-8 py-3 font-[family-name:var(--font-body)] text-white transition hover:scale-[1.02] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isRepaySending
                    ? "Confirm in wallet..."
                    : isRepayConfirming
                      ? "Confirming..."
                      : "Repay " + formatEther(principal) + " ETH"}
                </button>

                {repayTxHash && (
                  <a
                    href={
                      "https://creditcoin3-testnet.subscan.io/tx/" +
                      repayTxHash
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 block text-center text-sm text-warmgray-500 underline transition-colors hover:text-pink-500"
                  >
                    View transaction
                  </a>
                )}

                {isRepayConfirmed && (
                  <p className="mt-3 text-center text-sm text-leaf-500">
                    Repaid. Your collateral has been returned.
                  </p>
                )}

                {repayError && (
                  <p className="mt-3 text-center text-sm text-pink-500">
                    {repayError.message}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-glass-border bg-glass-100 p-6 backdrop-blur-md">
                <label className="text-sm text-warmgray-500">
                  Amount to borrow (ETH)
                </label>
                <input
                  type="text"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-line-200 bg-cream-50 px-4 py-2 font-[family-name:var(--font-data)] text-ink-900 outline-none transition focus:border-pink-400"
                />

                {requiredCollateralWei !== null && (
                  <p className="mt-3 text-sm text-warmgray-500">
                    Requires{" "}
                    <span className="font-[family-name:var(--font-data)] text-ink-900">
                      {formatEther(requiredCollateralWei)} ETH
                    </span>{" "}
                    collateral at your current {ratioPercent}% ratio.
                  </p>
                )}

                <button
                  onClick={handleBorrow}
                  disabled={
                    !requiredCollateralWei ||
                    isBorrowSending ||
                    isBorrowConfirming
                  }
                  className="mt-6 w-full rounded-full bg-gradient-to-r from-pink-500 to-pink-400 px-8 py-3 font-[family-name:var(--font-body)] text-white transition hover:scale-[1.02] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isBorrowSending
                    ? "Confirm in wallet..."
                    : isBorrowConfirming
                      ? "Confirming..."
                      : "Borrow"}
                </button>

                {borrowTxHash && (
                  <a
                    href={
                      "https://creditcoin3-testnet.subscan.io/tx/" +
                      borrowTxHash
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 block text-center text-sm text-warmgray-500 underline transition-colors hover:text-pink-500"
                  >
                    View transaction
                  </a>
                )}

                {isBorrowConfirmed && (
                  <p className="mt-3 text-center text-sm text-leaf-500">
                    Borrowed successfully.
                  </p>
                )}

                {borrowError && (
                  <p className="mt-3 text-center text-sm text-pink-500">
                    {borrowError.message}
                  </p>
                )}
              </div>
            )}

            <p className="text-center text-xs text-warmgray-300">
              Testnet demo. No interest is charged — repaying in full returns
              exactly the collateral you posted.
            </p>
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}
