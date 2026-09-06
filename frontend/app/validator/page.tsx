"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useConfig, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { formatEther } from "viem";
import { creditcoinTestnet } from "@/lib/chains";
import { BILL_VALIDATOR_ABI, BILL_VALIDATOR_ADDRESS } from "@/lib/abis";
import { useSiweAuth } from "@/lib/useSiweAuth";
import { API_BASE_URL } from "@/lib/api";
import { Nav } from "@/components/sections/Nav";
import { Footer } from "@/components/sections/Footer";

type BillStatus = "pending" | "approved" | "rejected";

type Bill = {
  bill_id: number;
  payer: string;
  claimed_amount: string; // sent as a string by the backend — see routers/bills.py
  status: BillStatus;
  submitted_at: number;
  document_url: string | null;
};

const STATUS_STYLES: Record<BillStatus, string> = {
  pending: "text-warmgray-500",
  approved: "text-leaf-500",
  rejected: "text-pink-500",
};

export default function ValidatorPage() {
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const config = useConfig();
  const { token, signIn, isSigningIn, error: siweError, isSignedIn } =
    useSiweAuth();
  const { writeContractAsync } = useWriteContract();

  const [bills, setBills] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyBillId, setBusyBillId] = useState<number | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({});

  const loadBills = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/validator/all-bills`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Failed to load bills");
      }
      setBills(await res.json());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load bills");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isSignedIn) loadBills();
  }, [isSignedIn, loadBills]);

  const pendingBills = useMemo(() => bills.filter((b) => b.status === "pending"), [bills]);

  // Decided bills, grouped by payer wallet — the review-history segment.
  const historyByWallet = useMemo(() => {
    const groups = new Map<string, Bill[]>();
    for (const bill of bills) {
      if (bill.status === "pending") continue;
      const list = groups.get(bill.payer) ?? [];
      list.push(bill);
      groups.set(bill.payer, list);
    }
    return groups;
  }, [bills]);

  async function handleApprove(billId: number) {
    setBusyBillId(billId);
    setLoadError(null);
    try {
      if (chainId !== creditcoinTestnet.id) {
        await switchChainAsync({ chainId: creditcoinTestnet.id });
      }
      const txHash = await writeContractAsync({
        address: BILL_VALIDATOR_ADDRESS,
        abi: BILL_VALIDATOR_ABI,
        functionName: "approveBill",
        args: [BigInt(billId)],
        chainId: creditcoinTestnet.id,
      });
      await waitForTransactionReceipt(config, { hash: txHash });
      await loadBills();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusyBillId(null);
    }
  }

  async function handleReject(billId: number) {
    const reason = rejectReasons[billId]?.trim();
    if (!reason) {
      setLoadError("Enter a rejection reason first.");
      return;
    }
    setBusyBillId(billId);
    setLoadError(null);
    try {
      if (chainId !== creditcoinTestnet.id) {
        await switchChainAsync({ chainId: creditcoinTestnet.id });
      }
      const txHash = await writeContractAsync({
        address: BILL_VALIDATOR_ADDRESS,
        abi: BILL_VALIDATOR_ABI,
        functionName: "rejectBill",
        args: [BigInt(billId), reason],
        chainId: creditcoinTestnet.id,
      });
      await waitForTransactionReceipt(config, { hash: txHash });
      await loadBills();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setBusyBillId(null);
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <Nav />

      <section className="flex flex-col items-center gap-8 px-6 py-16">
        <div className="text-center">
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl">
            <span className="font-semibold text-ink-900">Validator</span>{" "}
            <span className="font-normal italic text-warmgray-500">review</span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-warmgray-500">
            Unlisted demo page. The backend rejects any wallet that isn&apos;t
            the one hardcoded validator address, regardless of sign-in.
          </p>
        </div>

        {!isConnected && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-warmgray-500">
              Connect the validator wallet to continue.
            </p>
            <ConnectButton />
          </div>
        )}

        {isConnected && !isSignedIn && (
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={signIn}
              disabled={isSigningIn}
              className="rounded-full bg-gradient-to-r from-pink-500 to-pink-400 px-8 py-3 font-[family-name:var(--font-body)] text-white transition hover:scale-[1.02] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSigningIn ? "Check your wallet..." : "Sign in to review bills"}
            </button>
            {siweError && <p className="text-sm text-pink-500">{siweError}</p>}
          </div>
        )}

        {isSignedIn && (
          <div className="w-full max-w-2xl space-y-10">
            {loadError && <p className="text-center text-sm text-pink-500">{loadError}</p>}
            {isLoading && (
              <p className="text-center text-sm text-warmgray-500">Loading bills...</p>
            )}

            <div className="space-y-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl text-ink-900">
                Pending review
              </h2>
              {!isLoading && pendingBills.length === 0 && (
                <p className="text-sm text-warmgray-500">No bills pending review.</p>
              )}

              {pendingBills.map((bill) => (
                <div
                  key={bill.bill_id}
                  className="rounded-2xl border border-glass-border bg-glass-100 p-6 backdrop-blur-md"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-[family-name:var(--font-data)] text-sm text-warmgray-500">
                      Bill #{bill.bill_id}
                    </p>
                    <p className="font-[family-name:var(--font-data)] text-xs text-warmgray-300">
                      {new Date(bill.submitted_at * 1000).toLocaleString()}
                    </p>
                  </div>

                  <p className="mt-2 font-[family-name:var(--font-data)] text-lg text-ink-900">
                    {formatEther(BigInt(bill.claimed_amount))} tCTC claimed
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-data)] text-xs text-warmgray-500">
                    {bill.payer}
                  </p>

                  {bill.document_url ? (
                    <a
                      href={bill.document_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block text-sm text-pink-500 underline transition-colors hover:text-pink-400"
                    >
                      View uploaded document
                    </a>
                  ) : (
                    <p className="mt-3 text-sm text-warmgray-300">No document uploaded yet.</p>
                  )}

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={() => handleApprove(bill.bill_id)}
                      disabled={busyBillId === bill.bill_id}
                      className="flex-1 rounded-full bg-gradient-to-r from-pink-500 to-pink-400 px-6 py-2 text-sm text-white transition hover:scale-[1.02] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busyBillId === bill.bill_id ? "Confirming..." : "Approve"}
                    </button>

                    <input
                      type="text"
                      placeholder="Rejection reason"
                      value={rejectReasons[bill.bill_id] ?? ""}
                      onChange={(e) =>
                        setRejectReasons((prev) => ({ ...prev, [bill.bill_id]: e.target.value }))
                      }
                      className="flex-1 rounded-lg border border-line-200 bg-cream-50 px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-pink-400"
                    />
                    <button
                      onClick={() => handleReject(bill.bill_id)}
                      disabled={busyBillId === bill.bill_id}
                      className="rounded-full border border-line-200 px-6 py-2 text-sm text-ink-900 transition hover:border-pink-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl text-ink-900">
                Review history by wallet
              </h2>
              {!isLoading && historyByWallet.size === 0 && (
                <p className="text-sm text-warmgray-500">No decided bills yet.</p>
              )}

              {Array.from(historyByWallet.entries()).map(([payer, payerBills]) => (
                <div
                  key={payer}
                  className="rounded-2xl border border-glass-border bg-glass-100 p-6 backdrop-blur-md"
                >
                  <p className="font-[family-name:var(--font-data)] text-sm text-ink-900">
                    {payer}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {payerBills.map((bill) => (
                      <li
                        key={bill.bill_id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="font-[family-name:var(--font-data)] text-warmgray-500">
                          Bill #{bill.bill_id} &middot;{" "}
                          {formatEther(BigInt(bill.claimed_amount))} tCTC
                        </span>
                        <span
                          className={`font-[family-name:var(--font-data)] font-semibold capitalize ${STATUS_STYLES[bill.status]}`}
                        >
                          {bill.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}
