"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
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
  DEMO_PAYEE_ADDRESS,
  DEMO_BILL_AMOUNT_ETH,
} from "@/lib/abis";

export function Dashboard() {
  const { address, isConnected } = useAccount();
  const [waitingForAttestation, setWaitingForAttestation] = useState(false);

  const { data: score, refetch: refetchScore } = useReadContract({
    address: CREDIT_VAULT_ADDRESS,
    abi: CREDIT_VAULT_ABI,
    functionName: "scoreOf",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled: isConnected && !!address },
  });

  const { data: ratioBps, refetch: refetchRatio } = useReadContract({
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

  const { isLoading: isPayConfirming, isSuccess: isPayConfirmed } =
    useWaitForTransactionReceipt({ hash: payTxHash });

  useEffect(() => {
    if (!address) return;

    const channelName = "score_history_" + address;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "score_history",
          filter: "wallet_address=eq." + address,
        },
        () => {
          refetchScore();
          refetchRatio();
          setWaitingForAttestation(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [address, refetchScore, refetchRatio]);

  useEffect(() => {
    if (isPayConfirmed) {
      setWaitingForAttestation(true);
    }
  }, [isPayConfirmed]);

  if (!isConnected || !address) {
    return null;
  }

  const ratioPercent =
    typeof ratioBps === "bigint" ? Number(ratioBps) / 100 : null;

  const scoreDisplay = typeof score === "bigint" ? score.toString() : "-";
  const ratioDisplay = ratioPercent !== null ? ratioPercent + "%" : "-";

  let buttonLabel = "Pay a bill (" + DEMO_BILL_AMOUNT_ETH + " ETH)";
  if (isPaySending) {
    buttonLabel = "Confirm in wallet...";
  } else if (isPayConfirming) {
    buttonLabel = "Confirming on Sepolia...";
  }

  const txUrl = payTxHash
    ? "https://sepolia.etherscan.io/tx/" + payTxHash
    : null;

  function handlePayBill() {
    if (!DEMO_PAYEE_ADDRESS) return;
    writeContract({
      address: BILLPAY_ADDRESS,
      abi: BILLPAY_ABI,
      functionName: "payBill",
      args: [DEMO_PAYEE_ADDRESS],
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
          <p className="font-[family-name:var(--font-data)] text-3xl text-ink-900">
            {scoreDisplay}
          </p>
        </div>
        <div className="rounded-2xl border border-glass-border bg-glass-100 p-6 backdrop-blur-md transition hover:scale-[1.02]">
          <p className="text-sm text-warmgray-500">
            Required collateral ratio
          </p>
          <p className="font-[family-name:var(--font-data)] text-3xl text-brass-500">
            {ratioDisplay}
          </p>
        </div>
      </div>

      {!DEMO_PAYEE_ADDRESS && (
        <p className="max-w-md text-center text-sm text-pink-500">
          Demo payee address is not configured
          (NEXT_PUBLIC_DEMO_PAYEE_ADDRESS). The pay-bill button is disabled
          until it is set.
        </p>
      )}

      <button
        onClick={handlePayBill}
        disabled={!DEMO_PAYEE_ADDRESS || isPaySending || isPayConfirming}
        className="rounded-full bg-gradient-to-r from-pink-500 to-pink-400 px-8 py-3 font-[family-name:var(--font-body)] text-white transition hover:scale-[1.04] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
      >
        {buttonLabel}
      </button>

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

      {waitingForAttestation && (
        <p className="text-sm text-brass-500">
          Payment confirmed. Waiting for attestation and score update
          (usually under a minute).
        </p>
      )}

      {payError && (
        <p className="max-w-md text-center text-sm text-pink-500">
          {payError.message}
        </p>
      )}
    </section>
  );
}
