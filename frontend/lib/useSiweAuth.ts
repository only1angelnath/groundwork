"use client";

// Reuses the backend's existing SIWE auth (backend/auth.py) — built for
// Phase 3, never wired into the frontend since Phase 5's dashboard
// deliberately went with direct on-chain reads instead. The upload and
// validator pages are the first frontend code to need real wallet-
// ownership proof (you're this bill's payer / you're the validator),
// which can't be done client-side, so this is worth the extra sign-in
// step those other pages skip.
//
// Session lives in React state only, not persisted across reloads —
// simple and fine for a demo; sign in again after a refresh.
import { useCallback, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";
import { API_BASE_URL } from "./api";

export function useSiweAuth() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [token, setToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    if (!address) return;
    setIsSigningIn(true);
    setError(null);

    try {
      const nonceRes = await fetch(`${API_BASE_URL}/auth/nonce`);
      if (!nonceRes.ok) throw new Error("Failed to fetch a sign-in nonce");
      const { nonce } = await nonceRes.json();

      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to Groundwork to manage bill submissions.",
        uri: window.location.origin,
        version: "1",
        chainId: chainId ?? 1,
        nonce,
      });
      const message = siweMessage.prepareMessage();

      const signature = await signMessageAsync({ message });

      const verifyRes = await fetch(`${API_BASE_URL}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => ({}));
        throw new Error(body.detail ?? "Sign-in verification failed");
      }

      const { token: jwt } = await verifyRes.json();
      setToken(jwt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setIsSigningIn(false);
    }
  }, [address, chainId, signMessageAsync]);

  return { token, signIn, isSigningIn, error, isSignedIn: !!token };
}
