"use client";

import { useEffect, useState } from "react";
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

export function PaymentHistory() {
  const { address, isConnected } = useAccount();
  const [events, setEvents] = useState<BillEvent[]>([]);

  useEffect(() => {
    if (!address) return;
    const lowerAddress = address.toLowerCase();
    let cancelled = false;

    supabase
      .from("bill_events")
      .select(
        "id, sepolia_tx_hash, payee, amount, status, creditcoin_tx_hash, created_at"
      )
      .eq("wallet_address", lowerAddress)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!cancelled && data) setEvents(data as BillEvent[]);
      });

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
        (payload) => {
          const row = payload.new as BillEvent | undefined;
          if (!row) return;
          setEvents((prev) => {
            const withoutThisRow = prev.filter((e) => e.id !== row.id);
            return [row, ...withoutThisRow]
              .sort(
                (a, b) =>
                  new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime()
              )
              .slice(0, 20);
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [address]);

  if (!isConnected || !address) {
    return null;
  }

  return (
    <section className="flex flex-col items-center gap-6 px-6 py-16">
      <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl">
        <span className="font-semibold text-ink-900">Payment</span>{" "}
        <span className="font-normal italic text-warmgray-500">history</span>
      </h2>

      {events.length === 0 ? (
        <p className="text-sm text-warmgray-500">
          No payments yet — pay a demo bill above to see it here.
        </p>
      ) : (
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
                    "https://sepolia.etherscan.io/tx/" + event.sepolia_tx_hash
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
      )}
    </section>
  );
}
