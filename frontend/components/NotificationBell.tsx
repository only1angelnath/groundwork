"use client";

// Bell + dropdown for KYC/bill review notifications. Reads and subscribes
// straight from Supabase (anon key), same pattern Dashboard.tsx already
// uses for score_history — no backend round-trip needed for reads, since
// notifications' RLS is a public anon SELECT filtered client-side by
// wallet address (see supabase/migrations/0011_notifications.sql).
//
// "Unread" is tracked client-side only (a per-wallet timestamp in
// localStorage of when the bell was last opened) rather than a real
// read/unread column — consistent with this project's other honestly-
// simulated pieces (mocked KYC, demo payee), and it avoids needing a
// SIWE-authed "mark as read" endpoint just to clear a badge.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { supabase } from "@/lib/supabase";

type Notification = {
  id: number;
  type: string;
  message: string;
  reference_id: string | null;
  created_at: string;
};

function seenKey(address: string) {
  return `groundwork_notifications_seen_${address}`;
}

export function NotificationBell() {
  const { address } = useAccount();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on any click outside the bell/dropdown — without this, the
  // dropdown only ever closed by clicking the bell again.
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);
  const [lastSeenAt, setLastSeenAt] = useState<number>(0);

  useEffect(() => {
    // Clear immediately on every address change (including switching
    // between two connected wallets, not just connect/disconnect) — this
    // wallet's data should never render even a single frame with the
    // previous wallet's still on screen while the new fetch is in flight.
    setNotifications([]);

    if (!address) {
      return;
    }
    const lowerAddress = address.toLowerCase();
    setLastSeenAt(Number(localStorage.getItem(seenKey(lowerAddress)) ?? 0));

    let cancelled = false;

    supabase
      .from("notifications")
      .select("id, type, message, reference_id, created_at")
      .eq("wallet_address", lowerAddress)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        // Guards against a slow response for a wallet the user has since
        // switched away from landing after a newer address's effect ran.
        if (!cancelled && data) setNotifications(data as Notification[]);
      });

    const channel = supabase
      .channel("notifications_" + lowerAddress)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: "wallet_address=eq." + lowerAddress,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [address]);

  const unreadCount = notifications.filter(
    (n) => new Date(n.created_at).getTime() > lastSeenAt
  ).length;

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    if (!isOpen && address) {
      const now = Date.now();
      localStorage.setItem(seenKey(address.toLowerCase()), String(now));
      setLastSeenAt(now);
    }
  }, [isOpen, address]);

  if (!address) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleToggle}
        className="relative rounded-full p-2 text-warmgray-500 transition-colors hover:text-pink-500"
        aria-label="Notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.85 23.85 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-pink-500 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-x-4 top-20 z-50 rounded-2xl border border-glass-border bg-cream-50 p-2 shadow-lg backdrop-blur-md sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80">
          {notifications.length === 0 ? (
            <p className="p-4 text-center text-sm text-warmgray-500">No notifications yet.</p>
          ) : (
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className="rounded-xl px-3 py-2 text-sm text-ink-900 transition-colors hover:bg-cream-200"
                >
                  <p>{n.message}</p>
                  <p className="mt-1 text-xs text-warmgray-300">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}