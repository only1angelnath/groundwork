"use client";

// Wraps the parts of /upload and /borrow that require identity
// verification first. Only renders `children` once the connected wallet's
// KYC submission has been approved by the validator (see
// backend/routers/kyc.py) — otherwise shows a card reflecting whichever
// state the wallet is actually in (never submitted, awaiting review, or
// rejected with a reason and a chance to resubmit).
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
  const { status, rejectionReason, isLoading } = useKycStatus(address);

  if (isLoading) {
    return (
      <p className="text-sm text-warmgray-500">Checking verification status...</p>
    );
  }

  if (status === "approved") {
    return <>{children}</>;
  }

  if (status === "pending") {
    return (
      <div className="w-full max-w-md rounded-2xl border border-glass-border bg-glass-100 p-6 text-center backdrop-blur-md">
        <p className="text-sm text-warmgray-500">
          Your identity verification is awaiting validator review.
        </p>
        <p className="mt-2 text-xs text-warmgray-300">
          Testnet demo — a single permissioned validator reviews these
          manually, not an automated identity check.
        </p>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="w-full max-w-md rounded-2xl border border-glass-border bg-glass-100 p-6 text-center backdrop-blur-md">
        <p className="text-sm text-pink-500">Verification was rejected.</p>
        {rejectionReason && (
          <p className="mt-2 text-xs text-warmgray-500">{rejectionReason}</p>
        )}
        <Link
          href={`/kyc?next=${encodeURIComponent(next)}`}
          className="mt-4 inline-block rounded-full bg-gradient-to-r from-pink-500 to-pink-400 px-8 py-3 font-[family-name:var(--font-body)] text-white transition hover:scale-[1.02] hover:shadow-lg"
        >
          Resubmit
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-glass-border bg-glass-100 p-6 text-center backdrop-blur-md">
      <p className="text-sm text-warmgray-500">
        This action requires identity verification first.
      </p>
      <p className="mt-2 text-xs text-warmgray-300">
        Testnet demo — a simulated verification step, reviewed by the same
        permissioned validator that reviews bill submissions.
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
