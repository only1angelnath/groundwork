"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useReadContract } from "wagmi";
import { creditcoinTestnet } from "@/lib/chains";
import {
  SOULBOUND_BILL_RECORD_ABI,
  SOULBOUND_BILL_RECORD_ADDRESS,
} from "@/lib/abis";

export type SbtReceipt = {
  tokenId: bigint;
  billId: bigint;
  claimedAmount: bigint;
};

type SbtReceiptsResult = {
  count: number | null;
  receipts: SbtReceipt[];
  isLoading: boolean;
  // true if the detailed per-receipt list couldn't be fetched (e.g. an RPC
  // that rejects a full-range eth_getLogs query) and `count` is falling
  // back to a plain balanceOf() read instead.
  usingCountOnly: boolean;
};

/**
 * SoulboundBillRecord has no enumeration support (no tokenOfOwnerByIndex —
 * see contracts/src/SoulboundBillRecord.sol), so a wallet's receipts are
 * read via RecordMinted's indexed `payer` topic instead of iterating token
 * IDs. balanceOf() is the reliable fallback if that log fetch ever fails
 * (e.g. an RPC provider that limits eth_getLogs block ranges) — the count
 * still shows even if the detailed list doesn't.
 */
export function useSbtReceipts(address: `0x${string}` | undefined): SbtReceiptsResult {
  const publicClient = usePublicClient({ chainId: creditcoinTestnet.id });
  const [receipts, setReceipts] = useState<SbtReceipt[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [usingCountOnly, setUsingCountOnly] = useState(false);

  const { data: balance, isLoading: isBalanceLoading } = useReadContract({
    address: SOULBOUND_BILL_RECORD_ADDRESS,
    abi: SOULBOUND_BILL_RECORD_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled: !!address },
  });

  useEffect(() => {
    if (!address || !publicClient) return;
    let cancelled = false;
    setLogsLoaded(false);
    setUsingCountOnly(false);

    publicClient
      .getContractEvents({
        address: SOULBOUND_BILL_RECORD_ADDRESS,
        abi: SOULBOUND_BILL_RECORD_ABI,
        eventName: "RecordMinted",
        args: { payer: address },
        fromBlock: BigInt(0),
        toBlock: "latest",
      })
      .then((logs) => {
        if (cancelled) return;
        const parsed = logs
          .map((log) => {
            const args = log.args as {
              tokenId?: bigint;
              billId?: bigint;
              claimedAmount?: bigint;
            };
            if (
              args.tokenId === undefined ||
              args.billId === undefined ||
              args.claimedAmount === undefined
            ) {
              return null;
            }
            return {
              tokenId: args.tokenId,
              billId: args.billId,
              claimedAmount: args.claimedAmount,
            };
          })
          .filter((r): r is SbtReceipt => r !== null)
          .sort((a, b) => (a.tokenId < b.tokenId ? -1 : 1));
        setReceipts(parsed);
        setLogsLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Fall back to balanceOf's count alone — some public RPCs reject a
        // full-range eth_getLogs query. Not fatal: the count still shows.
        setUsingCountOnly(true);
        setLogsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [address, publicClient]);

  const balanceCount = typeof balance === "bigint" ? Number(balance) : null;
  const count = usingCountOnly ? balanceCount : logsLoaded ? receipts.length : balanceCount;

  return {
    count,
    receipts,
    isLoading: isBalanceLoading || !logsLoaded,
    usingCountOnly,
  };
}
