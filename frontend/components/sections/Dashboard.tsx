"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { sepolia } from "wagmi/chains";
import { parseEther } from "viem";
import { creditcoinTestnet } from "@/lib/chains";
import { supabase } from "@/lib/supabase";
import {
  BILLPAY_ABI,
  BILLPAY_ADDRESS,
  CREDIT_VAULT_ABI,
  CREDIT_VAULT_ADDRESS,
  DEMO_BILLERS,
  DEMO_BILL_AMOUNT_ETH,
} from "@/lib/abis";

type BillStatus = "pending" | "proof_fetched" | "verified" | "failed";

const STATUS_STEPS: { key: BillStatus; label: string }[] = [
  { key: "pending", label: "Payment detected on Sepolia" },
  { key: "proof_fetched", label: "Proof fetched from Attestcoin Prover" },
  { key: "verified", label: "Verified on Creditcoin, score updated" },
];

function statusStepIndex(status: BillStatus | null): number {
  if (!status) return -1;
  return STATUS_STEPS.findIndex((s) => s.key === status);
}

export function Dashboard() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [selectedBillerLabel, setSelectedBillerLabel] = useState<
    string | null
  >(null);
  const [billStatus, setBillStatus] = useState<BillStatus | null>(null);

  const {
    data: score,
    refetch: refetchScore,
    isLoading: isScoreLoading,
  } = useReadContract({
    address: CREDIT_VAULT_ADDRESS,
    abi: CREDIT_VAULT_ABI,
    functionName: "scoreOf",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled: isConnected && !!address },
  });

  const {
    data: ratioBps,
    refetch: refetchRatio,
    isLoading: isRatioLoading,
  } = useReadContract({
    address: CREDIT_VAULT_ADDRESS,
    abi: CREDIT_VAULT_ABI,
    functionName: "requiredCollateralRatioOf",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled: isConnected && !!address },
  });

  const {
    writeContract,
    data: payTxHash,
    isPending: isPaySending,
    error: payError,
  } = useWriteContract();

  const { isLoading: isPayConfirming } = useWaitForTransactionReceipt({
    hash: payTxHash,
  });

  useEffect(() => {
    if (!address) return;
    const lowerAddress = address.toLowerCase();
    const channel = supabase
      .channel("score_history_" + lowerAddress)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "score_history",
          filter: "wallet_address=eq." + lowerAddress,
        },
        () => {
          refetchScore();
          refetchRatio();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [address, refetchScore, refetchRatio]);

  useEffect(() => {
    if (!payTxHash) return;
    setBillStatus(null);
    let cancelled = false;

    supabase
      .from("bill_events")
      .select("status")
      .eq("sepolia_tx_hash", payTxHash)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.status) {
          setBillStatus(data.status as BillStatus);
        }
      });

    const channel = supabase
      .channel("bill_events_" + payTxHash)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bill_events",
          filter: "sepolia_tx_hash=eq." + payTxHash,
        },
        (payload) => {
          const row = payload.new as { status?: string } | undefined;
          if (row?.status) setBillStatus(row.status as BillStatus);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [payTxHash]);

  if (!isConnected || !address) {
    return null;
  }

  const ratioPercent =
    typeof ratioBps === "bigint" ? Number(ratioBps) / 100 : null;

  const txUrl = payTxHash
    ? "https://sepolia.etherscan.io/tx/" + payTxHash
    : null;

  const currentStepIndex = statusStepIndex(billStatus);
  const showTracker = payTxHash && billStatus !== null && billStatus !== "verified";

  async function handlePayBill(label: string, billerAddress: `0x${string}`) {
    setSelectedBillerLabel(label);
    if (chainId !== sepolia.id) {
      await switchChainAsync({ chainId: sepolia.id });
    }
    writeContract({
      address: BILLPAY_ADDRESS,
      abi: BILLPAY_ABI,
      functionName: "payBill",
      args: [billerAddress],
      value: parseEther(DEMO_BILL_AMOUNT_ETH),
      chainId: sepolia.id,
    });
  }

  return (
    <section className="relative flex flex-col items-center gap-8 px-6 py-16">
      <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl">
        <span className="font-semibold text-ink-900">Your</span>{" "}
        <span className="font-normal italic text-warmgray-500">
          credit standing
        </span>
      </h2>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-glass-border bg-glass-100 p-6 backdrop-blur-md transition hover:scale-[1.02]">
          <p className="text-sm text-warmgray-500">Verified payments</p>
          {isScoreLoading ? (
            <div className="mt-2 h-9 w-16 animate-pulse rounded bg-line-200" />
          ) : (
            <p className="font-[family-name:var(--font-data)] text-3xl text-ink-900">
              {typeof score === "bigint" ? score.toString() : "-"}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-glass-border bg-glass-100 p-6 backdrop-blur-md transition hover:scale-[1.02]">
          <p className="text-sm text-warmgray-500">
            Required collateral ratio
          </p>
          {isRatioLoading ? (
            <div className="mt-2 h-9 w-20 animate-pulse rounded bg-line-200" />
          ) : (
            <p className="font-[family-name:var(--font-data)] text-3xl text-brass-500">
              {ratioPercent !== null ? ratioPercent + "%" : "-"}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-warmgray-500">
          Pay a demo bill ({DEMO_BILL_AMOUNT_ETH} ETH on Sepolia)
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {DEMO_BILLERS.map((biller) => (
            <button
              key={biller.label}
              onClick={() =>
                biller.address && handlePayBill(biller.label, biller.address)
              }
              disabled={!biller.address || isPaySending || isPayConfirming}
              className="rounded-full bg-gradient-to-r from-pink-500 to-pink-400 px-6 py-3 font-[family-name:var(--font-body)] text-white transition hover:scale-[1.04] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPaySending && selectedBillerLabel === biller.label ? (
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Confirm in wallet...
                </span>
              ) : isPayConfirming && selectedBillerLabel === biller.label ? (
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Confirming...
                </span>
              ) : (
                "Pay " + biller.label
              )}
            </button>
          ))}
        </div>
        <p className="max-w-sm text-center text-xs text-warmgray-300">
          Symbolic demo billers — the trustless part is the on-chain
          attestation of the Sepolia payment, not who the wallet belongs to.
          Real biller integration is out of scope for this build.
        </p>
        {DEMO_BILLERS.some((b) => !b.address) && (
          <p className="max-w-md text-center text-sm text-pink-500">
            One or more demo biller addresses are not configured
            (NEXT_PUBLIC_DEMO_PAYEE_ADDRESS / _2).
          </p>
        )}
      </div>

      {txUrl && (
        <a
          href={txUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-warmgray-500 underline transition-colors hover:text-pink-500"
        >
          View transaction
        </a>
      )}

      {showTracker && (
        <div className="w-full max-w-sm rounded-2xl border border-glass-border bg-glass-100 p-6 backdrop-blur-md">
          <p className="mb-4 flex items-center justify-center gap-2 text-center text-sm text-warmgray-500">
            {billStatus !== "failed" && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-brass-500 border-t-transparent" />
            )}
            {billStatus === "failed"
              ? "Attestation hit a snag — the worker retries automatically."
              : "Tracking your payment through attestation"}
          </p>
          <ol className="space-y-3">
            {STATUS_STEPS.map((step, i) => {
              const done = billStatus === "failed" ? false : i <= currentStepIndex;
              return (
                <li key={step.key} className="flex items-center gap-3">
                  <span
                    className={
                      "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs " +
                      (done
                        ? "bg-leaf-500 text-white"
                        : "border border-line-200 text-warmgray-300")
                    }
                  >
                    {done ? "\u2713" : i + 1}
                  </span>
                  <span
                    className={
                      "text-sm " + (done ? "text-ink-900" : "text-warmgray-500")
                    }
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {payError && (
        <p className="max-w-md text-center text-sm text-pink-500">
          {payError.message}
        </p>
      )}

      <Link
        href="/borrow"
        className="mt-2 text-sm text-ink-900 underline decoration-pink-400 underline-offset-4 transition-colors hover:text-pink-500"
      >
        Manage your loan &rarr;
      </Link>
    </section>
  );
}
