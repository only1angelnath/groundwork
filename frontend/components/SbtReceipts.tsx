"use client";

import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { useSbtReceipts } from "@/lib/useSbtReceipts";

/**
 * Shows a wallet's minted SoulboundBillRecord tokens — the permanent,
 * non-transferable on-chain receipt minted when a validator approves a
 * manually-uploaded bill (automated Sepolia-attested payments don't mint
 * one; see contracts/src/BillValidator.sol's approveBill). Pure receipt,
 * no functional effect on score/collateral/loan size — deliberately, per
 * the Sept 2026 SBT/pool design discussion.
 *
 * Renders nothing for a wallet with zero receipts, so this stays invisible
 * for anyone who's only used the automated path — no empty state to
 * explain for a feature that isn't relevant to them yet.
 */
export function SbtReceipts() {
  const { address, isConnected } = useAccount();
  const { count, receipts, isLoading, usingCountOnly } = useSbtReceipts(
    isConnected ? address : undefined
  );

  if (!isConnected || !address) return null;
  if (isLoading) return null;
  if (!count || count === 0) return null;

  return (
    <div className="w-full max-w-2xl rounded-2xl border border-glass-border bg-glass-100 p-6 backdrop-blur-md">
      <h3 className="font-[family-name:var(--font-display)] text-xl">
        <span className="font-semibold text-ink-900">Verified</span>{" "}
        <span className="font-normal italic text-warmgray-500">
          bill receipts
        </span>
      </h3>
      <p className="mt-1 text-xs text-warmgray-300">
        A non-transferable on-chain record minted each time a validator
        approves an uploaded bill — permanent proof, not a score input.
      </p>

      {usingCountOnly ? (
        <p className="mt-4 font-[family-name:var(--font-data)] text-2xl text-brass-500">
          {count}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {receipts.map((r) => (
            <li
              key={r.tokenId.toString()}
              className="flex items-center justify-between rounded-xl border border-line-200 bg-cream-50 px-4 py-2"
            >
              <span className="font-[family-name:var(--font-data)] text-sm text-warmgray-500">
                Receipt #{r.tokenId.toString()}
              </span>
              <span className="font-[family-name:var(--font-data)] text-sm font-semibold text-ink-900">
                {parseFloat(formatEther(r.claimedAmount)).toLocaleString(
                  undefined,
                  { maximumFractionDigits: 2 }
                )}{" "}
                tCTC
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
