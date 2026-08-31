"use client";

import { useEffect, useRef, useState } from "react";
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

// How long to wait for the Realtime score_history INSERT before giving up
// and telling the user to check back rather than spinning forever.
const ATTESTATION_TIMEOUT_MS = 90_000;

export function Dashboard() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [waitingForAttestation, setWaitingForAttestation] = useState(false);
  const [attestationTimedOut, setAttestationTimedOut] = useState(false);
  const [selectedBillerLabel, setSelectedBillerLabel] = useState<
    string | null
  >(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Realtime subscription. IMPORTANT: the worker writes wallet_address in
  // lowercase (worker/supabase_client.py, to match the backend's lowercased
  // JWT claims) — wagmi's `address` is checksummed mixed-case, and Postgres
  // string equality is case-sensitive, so this filter silently matched
  // nothing until it was lowercased here too.
  useEffect(() => {
    if (!address) return;
    const lowerAddress = address.toLowerCase();

    const channelName = "score_history_" + lowerAddress;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "score_history",
          filter: "wallet_address=eq." + lowerAddress,
        },
        () => {
          refetchScore();
          refetchRatio();
          setWaitingForAttestation(false);
          setAttestationTimedOut(false);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
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
      setAttestationTimedOut(false);
      timeoutRef.current = setTimeout(() => {
        setWaitingForAttestation(false);
        setAttestationTimedOut(true);
      }, ATTESTATION_TIMEOUT_MS);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isPayConfirmed]);

  if (!isConnected || !address) {
    return null;
  }

  const ratioPercent =
    typeof ratioBps === "bigint" ? Number(ratioBps) / 100 : null;

  const scoreDisplay = typeof score === "bigint" ? score.toString() : "-";
  const ratioDisplay = ratioPercent !== null ? ratioPercent + "%" : "-";

  const txUrl = payTxHash
    ? "https://sepolia.etherscan.io/tx/" + payTxHash
    : null;

  async function handlePayBill(label: string, billerAddress: `0x${string}`) {
    setSelectedBillerLabel(label);
    setAttestationTimedOut(false);
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
              {isPaySending && selectedBillerLabel === biller.label
                ? "Confirm in wallet..."
                : isPayConfirming && selectedBillerLabel === biller.label
                  ? "Confirming..."
                  : "Pay " + biller.label}
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

      {waitingForAttestation && (
        <p className="text-sm text-brass-500">
          Payment confirmed. Waiting for attestation and score update
          (usually under a minute).
        </p>
      )}

      {attestationTimedOut && (
        <p className="max-w-md text-center text-sm text-pink-500">
          Still waiting on the score update after {ATTESTATION_TIMEOUT_MS / 1000}
          s — the payment itself succeeded, but the attestation is taking
          longer than expected. Check back shortly, or refresh.
        </p>
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
