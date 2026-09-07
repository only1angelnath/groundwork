"use client";

// Checks the mocked-KYC status backed by backend/routers/kyc.py. This is a
// public, no-auth read (GET /api/kyc/status/{wallet}) — it only exposes a
// boolean per wallet, no more sensitive than the on-chain score itself, so
// /upload and /borrow can gate on it without forcing a SIWE sign-in just
// to check.
import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "./api";

export function useKycStatus(address: `0x${string}` | undefined) {
  const [verified, setVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!address) {
      setVerified(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/kyc/status/${address}`);
      if (!res.ok) throw new Error("Could not check verification status");
      const body = await res.json();
      setVerified(!!body.verified);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check verification status");
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { verified, isLoading, error, refetch };
}
