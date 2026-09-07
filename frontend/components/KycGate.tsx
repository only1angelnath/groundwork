"use client";

// Wraps the parts of /upload and /borrow that require identity
// verification first. Only renders `children` once the connected wallet
// has completed the mocked KYC flow (see backend/routers/kyc.py) —
// otherwise shows a card linking to /kyc with `next` set so the person
// lands back where they started once verified.
import Link from "next/link";
import { useKycStatus } from "@/lib/useKycStatus";

export function KycGate({
  address,
  next,
  children,
}: {
  address: `0x${string}` | undefined;
  next: string;
  children: React.ReactNode;
}) {
  const { verified, isLoading } = useKycStatus(address);

  if (isLoading) {
    return (
      <p className="text-sm text-warmgray-500">Checking verification status...</p>
    );
  }

  if (!verified) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-glass-border bg-glass-100 p-6 text-center backdrop-blur-md">
        <p className="text-sm text-warmgray-500">
          This action requires identity verification first.
        </p>
        <p className="mt-2 text-xs text-warmgray-300">
          Testnet demo — a simulated verification step, not a real identity
          check.
        </p>
        <Link
          href={`/kyc?next=${encodeURIComponent(next)}`}
          className="mt-4 inline-block rounded-full bg-gradient-to-r from-pink-500 to-pink-400 px-8 py-3 font-[family-name:var(--font-body)] text-white transition hover:scale-[1.02] hover:shadow-lg"
        >
          Complete verification
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
