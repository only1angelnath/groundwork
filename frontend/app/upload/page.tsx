"use client";

import { useEffect, useState, useCallback } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useConfig,
  useSwitchChain,
} from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { parseEther } from "viem";
import { creditcoinTestnet } from "@/lib/chains";
import { BILL_VALIDATOR_ABI, BILL_VALIDATOR_ADDRESS } from "@/lib/abis";
import { useSiweAuth } from "@/lib/useSiweAuth";
import { useCtcConversion, SUPPORTED_CURRENCIES, CurrencyCode } from "@/lib/useCtcConversion";
import { API_BASE_URL } from "@/lib/api";
import {
  ALLOWED_UPLOAD_ACCEPT,
  UPLOAD_HELP_TEXT,
  validateUploadFile,
} from "@/lib/uploadValidation";
import { Nav } from "@/components/sections/Nav";
import { Footer } from "@/components/sections/Footer";
import { KycGate } from "@/components/KycGate";

// SHA-256 of the file, client-side — this is what gets submitted on-chain
// as documentHash, and what the backend recomputes server-side to confirm
// the uploaded bytes actually match what was committed to on submission
// (see backend/routers/bills.py's upload_bill_document).
async function hashFile(file: File): Promise<`0x${string}`> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

type Stage = "idle" | "submitting" | "uploading" | "done" | "error";
type MyBillStatus = "pending" | "approved" | "rejected";
type MyBill = {
  bill_id: number;
  claimed_amount: string;
  status: MyBillStatus;
  submitted_at: number;
  document_url: string | null;
};

const STATUS_STYLES: Record<MyBillStatus, string> = {
  pending: "text-warmgray-500",
  approved: "text-leaf-500",
  rejected: "text-pink-500",
};

function UploadFlow() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const config = useConfig();
  const { token, signIn, isSigningIn, error: siweError, isSignedIn } =
    useSiweAuth();

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("10");
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [billId, setBillId] = useState<number | null>(null);

  const { convertToCtc, isReady: ratesReady, error: ratesError } = useCtcConversion();

  const [myBills, setMyBills] = useState<MyBill[]>([]);
  const [myBillsError, setMyBillsError] = useState<string | null>(null);

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setFileError(selected ? validateUploadFile(selected) : null);
  }

  const loadMyBills = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/bills/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Failed to load your submissions");
      }
      setMyBills(await res.json());
    } catch (err) {
      setMyBillsError(err instanceof Error ? err.message : "Failed to load your submissions");
    }
  }, [token]);

  useEffect(() => {
    if (isSignedIn) loadMyBills();
  }, [isSignedIn, loadMyBills]);

  const { data: fee } = useReadContract({
    address: BILL_VALIDATOR_ADDRESS,
    abi: BILL_VALIDATOR_ABI,
    functionName: "SUBMISSION_FEE",
    chainId: creditcoinTestnet.id,
  });

  const { writeContractAsync } = useWriteContract();

  const parsedAmount = parseFloat(amountInput);
  const ctcAmount =
    Number.isFinite(parsedAmount) && parsedAmount > 0
      ? convertToCtc(parsedAmount, currency)
      : null;

  // Non-CTC currencies need live rates resolved before there's a real
  // number to submit; CTC entered directly never depends on the rate APIs
  // at all, which is the fallback path if CoinGecko/open.er-api.com are
  // down during a demo.
  const needsRates = currency !== "CTC";
  const conversionBlocked = needsRates && !ratesReady;

  let claimedAmountWei: bigint | null = null;
  try {
    claimedAmountWei = ctcAmount !== null ? parseEther(ctcAmount.toFixed(8)) : null;
  } catch {
    claimedAmountWei = null;
  }

  async function handleSubmit() {
    if (!file || !address || !token || claimedAmountWei === null) return;
    setErrorMessage(null);
    setStage("submitting");

    try {
      if (chainId !== creditcoinTestnet.id) {
        await switchChainAsync({ chainId: creditcoinTestnet.id });
      }

      const documentHash = await hashFile(file);
      const submissionFee = (fee as bigint | undefined) ?? parseEther("0.0005");

      const txHash = await writeContractAsync({
        address: BILL_VALIDATOR_ADDRESS,
        abi: BILL_VALIDATOR_ABI,
        functionName: "submitBill",
        args: [claimedAmountWei, documentHash],
        value: submissionFee,
        chainId: creditcoinTestnet.id,
      });

      const receipt = await waitForTransactionReceipt(config, { hash: txHash });

      // Pull billId straight off BillSubmitted's first indexed topic rather
      // than assuming it equals the pre-submission nextBillId, which could
      // race with another submission landing first.
      const submittedLog = receipt.logs.find(
        (log) => log.address.toLowerCase() === BILL_VALIDATOR_ADDRESS.toLowerCase()
      );
      if (!submittedLog || !submittedLog.topics[1]) {
        throw new Error("Could not read billId from the transaction receipt");
      }
      const newBillId = Number(BigInt(submittedLog.topics[1]));
      setBillId(newBillId);

      setStage("uploading");
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch(`${API_BASE_URL}/api/bills/${newBillId}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => ({}));
        throw new Error(body.detail ?? "Upload failed");
      }

      setStage("done");
      await loadMyBills();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
      setStage("error");
    }
  }

  const canSubmit =
    isSignedIn &&
    !!file &&
    !fileError &&
    claimedAmountWei !== null &&
    !conversionBlocked &&
    stage !== "submitting" &&
    stage !== "uploading";

  return (
    <>
      {!isSignedIn && (
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={signIn}
            disabled={isSigningIn}
            className="rounded-full bg-gradient-to-r from-pink-500 to-pink-400 px-8 py-3 font-[family-name:var(--font-body)] text-white transition hover:scale-[1.02] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSigningIn ? "Check your wallet..." : "Sign in to submit a bill"}
          </button>
          {siweError && <p className="text-sm text-pink-500">{siweError}</p>}
        </div>
      )}

      {isSignedIn && stage !== "done" && (
        <div className="w-full max-w-md space-y-6">
          <div className="rounded-2xl border border-glass-border bg-glass-100 p-6 backdrop-blur-md">
            <label className="text-sm text-warmgray-500">Amount claimed</label>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="flex-1 rounded-lg border border-line-200 bg-cream-50 px-4 py-2 font-[family-name:var(--font-data)] text-ink-900 outline-none transition focus:border-pink-400"
              />
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="rounded-lg border border-line-200 bg-cream-50 px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-pink-400"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </div>

            {needsRates && (
              <p className="mt-2 text-xs text-warmgray-300">
                {ratesError
                  ? "Live conversion rates unavailable — switch to tCTC to enter an amount directly."
                  : !ratesReady
                    ? "Loading conversion rates..."
                    : ctcAmount !== null
                      ? `≈ ${ctcAmount.toFixed(6)} tCTC (uses Creditcoin's real market price as a stand-in — testnet tCTC itself has no market value)`
                      : null}
              </p>
            )}

            <label className="mt-4 block text-sm text-warmgray-500">
              Bill document
            </label>
            <input
              type="file"
              accept={ALLOWED_UPLOAD_ACCEPT}
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="mt-2 w-full text-sm text-warmgray-500 file:mr-4 file:rounded-full file:border-0 file:bg-cream-200 file:px-4 file:py-2 file:text-sm file:text-ink-900"
            />
            <p className="mt-1 text-xs text-warmgray-300">{UPLOAD_HELP_TEXT}</p>
            {fileError && <p className="mt-1 text-xs text-pink-500">{fileError}</p>}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="mt-6 w-full rounded-full bg-gradient-to-r from-pink-500 to-pink-400 px-8 py-3 font-[family-name:var(--font-body)] text-white transition hover:scale-[1.02] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
            >
              {stage === "submitting"
                ? "Confirm in wallet..."
                : stage === "uploading"
                  ? "Uploading document..."
                  : "Submit bill"}
            </button>

            {errorMessage && (
              <p className="mt-3 text-center text-sm text-pink-500">{errorMessage}</p>
            )}
          </div>
        </div>
      )}

      {stage === "done" && (
        <div className="w-full max-w-md rounded-2xl border border-glass-border bg-glass-100 p-6 text-center backdrop-blur-md">
          <p className="text-leaf-500">
            Bill #{billId} submitted and awaiting validator review.
          </p>
          <button
            onClick={() => {
              setStage("idle");
              setFile(null);
              setFileError(null);
              setBillId(null);
            }}
            className="mt-4 text-sm text-ink-900 underline decoration-pink-400 underline-offset-4 transition-colors hover:text-pink-500"
          >
            Submit another bill
          </button>
        </div>
      )}

      {isSignedIn && myBills.length > 0 && (
        <div className="w-full max-w-md space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-ink-900">
            Your submissions
          </h2>
          {myBillsError && <p className="text-sm text-pink-500">{myBillsError}</p>}
          <div className="space-y-2">
            {myBills.map((bill) => (
              <div
                key={bill.bill_id}
                className="flex flex-col gap-1 rounded-xl border border-glass-border bg-glass-100 px-4 py-3 backdrop-blur-md"
              >
                <div className="flex items-center justify-between">
                  <span className="font-[family-name:var(--font-data)] text-sm text-warmgray-500">
                    Bill #{bill.bill_id}
                  </span>
                  <span
                    className={`font-[family-name:var(--font-data)] text-sm font-semibold capitalize ${STATUS_STYLES[bill.status]}`}
                  >
                    {bill.status}
                  </span>
                </div>
                {bill.status === "approved" && (
                  <p className="text-xs text-warmgray-300">
                    ✓ Permanent on-chain receipt minted —{" "}
                    <a
                      href="/dashboard"
                      className="underline decoration-pink-400 underline-offset-2 transition-colors hover:text-pink-500"
                    >
                      view on your dashboard
                    </a>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function UploadPage() {
  const { address, isConnected } = useAccount();

  return (
    <main className="flex flex-1 flex-col">
      <Nav />

      <section className="flex flex-col items-center gap-10 px-6 py-16">
        <div className="text-center">
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl">
            <span className="font-semibold text-ink-900">Submit</span>{" "}
            <span className="font-normal italic text-warmgray-500">a bill</span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-warmgray-500">
            For bills not paid on-chain: upload proof, pay a small review
            fee, and a validator will approve or reject it.
          </p>
          <p className="mt-2 max-w-md text-xs text-warmgray-300">
            Testnet demo — a single permissioned validator reviews
            submissions manually, not a decentralized staking system.
          </p>
        </div>

        {!isConnected && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-warmgray-500">Connect a wallet to continue.</p>
            <ConnectButton />
          </div>
        )}

        {isConnected && (
          <KycGate address={address} next="/upload">
            <UploadFlow />
          </KycGate>
        )}
      </section>

      <Footer />
    </main>
  );
}
