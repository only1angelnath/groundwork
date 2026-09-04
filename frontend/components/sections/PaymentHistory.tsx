"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { supabase } from "@/lib/supabase";
import { getBillerLabel } from "@/lib/abis";

type BillEvent = {
  id: number;
  sepolia_tx_hash: string;
  payee: string;
  amount: string;
  status: string;
  creditcoin_tx_hash: string | null;
  created_at: string;
};

const PAGE_SIZE = 10;

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  proof_fetched: "Proof fetched",
  verified: "Verified",
  failed: "Failed (retrying)",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-brass-500",
  proof_fetched: "text-brass-500",
  verified: "text-leaf-500",
  failed: "text-pink-500",
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SkeletonRow() {
  return (
    <div className="flex animate-pulse items-center justify-between gap-4 border-b border-line-200 px-6 py-4 last:border-b-0">
      <div className="flex flex-col gap-2">
        <div className="h-3 w-16 rounded bg-line-200" />
        <div className="h-2 w-24 rounded bg-line-200" />
      </div>
      <div className="h-3 w-32 rounded bg-line-200" />
    </div>
  );
}

export function PaymentHistory() {
  const { address, isConnected } = useAccount();
  const [events, setEvents] = useState<BillEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const fetchPage = useCallback(
    async (walletLower: string, pageIndex: number) => {
      setIsLoading(true);
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from("bill_events")
        .select(
          "id, sepolia_tx_hash, payee, amount, status, creditcoin_tx_hash, created_at",
          { count: "exact" }
        )
        .eq("wallet_address", walletLower)
        .order("created_at", { ascending: false })
        .range(from, to);

      setEvents((data as BillEvent[]) ?? []);
      setTotalCount(count ?? 0);
      setIsLoading(false);
    },
    []
  );

  useEffect(() => {
    if (!address) return;
    setPage(0);
    fetchPage(address.toLowerCase(), 0);
  }, [address, fetchPage]);

  useEffect(() => {
    if (!address) return;
    fetchPage(address.toLowerCase(), page);
  }, [page, address, fetchPage]);

  // Live updates only matter while looking at the first page — a new
  // payment showing up on page 3 would just be confusing, and re-fetching
  // that page out from under someone mid-read is worse than a manual
  // refresh via Next/Prev.
  useEffect(() => {
    if (!address || page !== 0) return;
    const lowerAddress = address.toLowerCase();

    const channel = supabase
      .channel("bill_events_history_" + lowerAddress)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bill_events",
          filter: "wallet_address=eq." + lowerAddress,
        },
        () => {
          fetchPage(lowerAddress, 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [address, page, fetchPage]);

  if (!isConnected || !address) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <section className="flex flex-col items-center gap-6 px-6 py-16">
      <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl">
        <span className="font-semibold text-ink-900">Payment</span>{" "}
        <span className="font-normal italic text-warmgray-500">history</span>
      </h2>

      {isLoading ? (
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-glass-border bg-glass-100 backdrop-blur-md">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-warmgray-500">
          No payments yet — pay a demo bill above to see it here.
        </p>
      ) : (
        <>
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-glass-border bg-glass-100 backdrop-blur-md">
            {events.map((event, i) => (
              <div
                key={event.id}
                className={
                  "flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-glass-100" +
                  (i !== events.length - 1 ? " border-b border-line-200" : "")
                }
              >
                <div className="flex flex-col">
                  <span className="text-sm text-ink-900">
                    {getBillerLabel(event.payee)}
                  </span>
                  <span className="text-xs text-warmgray-500">
                    {formatWhen(event.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={
                      "text-xs font-medium " +
                      (STATUS_COLOR[event.status] ?? "text-warmgray-500")
                    }
                  >
                    {STATUS_LABEL[event.status] ?? event.status}
                  </span>
                  <a
                    href={
                      "https://sepolia.etherscan.io/tx/" +
                      event.sepolia_tx_hash
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-warmgray-500 underline transition-colors hover:text-pink-500"
                  >
                    Sepolia
                  </a>
                  {event.creditcoin_tx_hash && (
                    <a
                      href={
                        "https://creditcoin3-testnet.subscan.io/tx/" +
                        event.creditcoin_tx_hash
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-warmgray-500 underline transition-colors hover:text-pink-500"
                    >
                      Creditcoin
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-4">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="text-sm text-warmgray-500 underline transition-colors hover:text-pink-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
              >
                Previous
              </button>
              <span className="text-xs text-warmgray-300">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() =>
                  setPage((p) => Math.min(totalPages - 1, p + 1))
                }
                disabled={page >= totalPages - 1}
                className="text-sm text-warmgray-500 underline transition-colors hover:text-pink-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
