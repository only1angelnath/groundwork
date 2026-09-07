"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useSiweAuth } from "@/lib/useSiweAuth";
import { useKycStatus } from "@/lib/useKycStatus";
import { API_BASE_URL } from "@/lib/api";
import { Nav } from "@/components/sections/Nav";
import { Footer } from "@/components/sections/Footer";

const ID_TYPES = ["Passport", "National ID", "Driver's License"];

function KycForm() {
  const { address, isConnected } = useAccount();
  const { token, signIn, isSigningIn, error: siweError, isSignedIn } = useSiweAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const { status, rejectionReason, isLoading: statusLoading, refetch: refetchStatus } =
    useKycStatus(address);

  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [country, setCountry] = useState("");
  const [idType, setIdType] = useState(ID_TYPES[0]);
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [stage, setStage] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit =
    isSignedIn &&
    fullName.trim().length > 0 &&
    dateOfBirth.length > 0 &&
    country.trim().length > 0 &&
    !!idDocument &&
    stage !== "submitting";

  async function handleSubmit() {
    if (!token || !idDocument) return;
    setStage("submitting");
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append("full_name", fullName);
      formData.append("date_of_birth", dateOfBirth);
      formData.append("country", country);
      formData.append("id_type", idType);
      formData.append("id_document", idDocument);

      const res = await fetch(`${API_BASE_URL}/api/kyc/submit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Submission failed");
      }
      setStage("done");
      await refetchStatus();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
      setStage("error");
    }
  }

  // Someone visiting /kyc who is already pending or approved shouldn't see
  // a blank form — show their current state instead. Rejected still shows
  // the form (that's the resubmission path KycGate links here for).
  const showExistingStatus =
    isSignedIn && stage === "idle" && !statusLoading && (status === "pending" || status === "approved");

  return (
    <section className="flex flex-col items-center gap-10 px-6 py-16">
      <div className="text-center">
        <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl">
          <span className="font-semibold text-ink-900">Verify</span>{" "}
          <span className="font-normal italic text-warmgray-500">your identity</span>
        </h1>
        <p className="mt-3 max-w-md text-sm text-warmgray-500">
          A quick check before uploading bills or borrowing.
        </p>
        <p className="mt-2 max-w-md text-xs text-warmgray-300">
          Testnet demo — this is a simulated verification step reviewed by
          the same permissioned validator that reviews bill submissions,
          not a real identity check. Your ID document is stored privately
          and is never shared with a third-party KYC provider.
        </p>
      </div>

      {!isConnected && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-warmgray-500">Connect a wallet to continue.</p>
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
            {isSigningIn ? "Check your wallet..." : "Sign in to verify"}
          </button>
          {siweError && <p className="text-sm text-pink-500">{siweError}</p>}
        </div>
      )}

      {showExistingStatus && status === "pending" && (
        <div className="w-full max-w-md rounded-2xl border border-glass-border bg-glass-100 p-6 text-center backdrop-blur-md">
          <p className="text-sm text-warmgray-500">
            Your submission is awaiting validator review.
          </p>
        </div>
      )}

      {showExistingStatus && status === "approved" && (
        <div className="w-full max-w-md rounded-2xl border border-glass-border bg-glass-100 p-6 text-center backdrop-blur-md">
          <p className="text-leaf-500">You&apos;re already verified.</p>
          <button
            onClick={() => router.push(next)}
            className="mt-4 rounded-full bg-gradient-to-r from-pink-500 to-pink-400 px-8 py-3 font-[family-name:var(--font-body)] text-white transition hover:scale-[1.02] hover:shadow-lg"
          >
            Continue
          </button>
        </div>
      )}

      {isSignedIn && !statusLoading && status === "rejected" && stage === "idle" && rejectionReason && (
        <div className="w-full max-w-md rounded-2xl border border-glass-border bg-glass-100 p-4 text-center backdrop-blur-md">
          <p className="text-sm text-pink-500">
            Your last submission was rejected: {rejectionReason}
          </p>
        </div>
      )}

      {isSignedIn &&
        stage !== "done" &&
        status !== "pending" &&
        status !== "approved" && (
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-glass-border bg-glass-100 p-6 backdrop-blur-md">
            <div>
              <label className="text-sm text-warmgray-500">Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-2 w-full rounded-lg border border-line-200 bg-cream-50 px-4 py-2 text-ink-900 outline-none transition focus:border-pink-400"
              />
            </div>

            <div>
              <label className="text-sm text-warmgray-500">Date of birth</label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="mt-2 w-full rounded-lg border border-line-200 bg-cream-50 px-4 py-2 text-ink-900 outline-none transition focus:border-pink-400"
              />
            </div>

            <div>
              <label className="text-sm text-warmgray-500">Country</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. Nigeria"
                className="mt-2 w-full rounded-lg border border-line-200 bg-cream-50 px-4 py-2 text-ink-900 outline-none transition focus:border-pink-400"
              />
            </div>

            <div>
              <label className="text-sm text-warmgray-500">ID type</label>
              <select
                value={idType}
                onChange={(e) => setIdType(e.target.value)}
                className="mt-2 w-full rounded-lg border border-line-200 bg-cream-50 px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-pink-400"
              >
                {ID_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-warmgray-500">ID document</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setIdDocument(e.target.files?.[0] ?? null)}
                className="mt-2 w-full text-sm text-warmgray-500 file:mr-4 file:rounded-full file:border-0 file:bg-cream-200 file:px-4 file:py-2 file:text-sm file:text-ink-900"
              />
              <p className="mt-1 text-xs text-warmgray-300">
                A photo or scan of your {idType.toLowerCase()}.
              </p>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="mt-2 w-full rounded-full bg-gradient-to-r from-pink-500 to-pink-400 px-8 py-3 font-[family-name:var(--font-body)] text-white transition hover:scale-[1.02] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
            >
              {stage === "submitting" ? "Submitting..." : "Submit for review"}
            </button>

            {errorMessage && (
              <p className="text-center text-sm text-pink-500">{errorMessage}</p>
            )}
          </div>
        )}

      {stage === "done" && (
        <div className="w-full max-w-md rounded-2xl border border-glass-border bg-glass-100 p-6 text-center backdrop-blur-md">
          <p className="text-leaf-500">Submitted — awaiting validator review.</p>
          <button
            onClick={() => router.push(next)}
            className="mt-4 rounded-full bg-gradient-to-r from-pink-500 to-pink-400 px-8 py-3 font-[family-name:var(--font-body)] text-white transition hover:scale-[1.02] hover:shadow-lg"
          >
            Back
          </button>
        </div>
      )}
    </section>
  );
}

export default function KycPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Nav />
      <Suspense fallback={null}>
        <KycForm />
      </Suspense>
      <Footer />
    </main>
  );
}
