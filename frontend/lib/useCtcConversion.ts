"use client";

// Converts a user-friendly currency amount (USD, EUR, BTC, etc.) into an
// equivalent tCTC amount for the bill-upload form. Testnet tCTC has no
// real market value, so this uses Creditcoin mainnet's real CTC/USD price
// (CoinGecko id "creditcoin-2" — not "creditcoin", a different, unrelated
// token) purely as a realistic stand-in for the demo, not a real exchange
// rate for the testnet token itself.
//
// Two free, no-key, browser-callable APIs, fetched once on mount:
//  - CoinGecko /simple/price for CTC/BTC/ETH in USD
//  - open.er-api.com for USD-based fiat rates
// If either fails, isReady stays false and convertToCtc returns null for
// non-CTC currencies — the upload page falls back to letting the user
// enter a tCTC amount directly rather than blocking the whole flow on a
// third-party API being up during a demo.
import { useEffect, useState } from "react";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=creditcoin-2,bitcoin,ethereum&vs_currencies=usd";
const FX_URL = "https://open.er-api.com/v6/latest/USD";

export const SUPPORTED_CURRENCIES = [
  { code: "CTC", label: "tCTC (native)" },
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "NGN", label: "Nigerian Naira" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "BTC", label: "Bitcoin" },
  { code: "ETH", label: "Ethereum" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

export function useCtcConversion() {
  const [ctcPriceUsd, setCtcPriceUsd] = useState<number | null>(null);
  const [cryptoPricesUsd, setCryptoPricesUsd] = useState<Record<string, number>>({});
  const [fiatRatesUsd, setFiatRatesUsd] = useState<Record<string, number>>({});
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [geckoRes, fxRes] = await Promise.all([fetch(COINGECKO_URL), fetch(FX_URL)]);
        if (!geckoRes.ok || !fxRes.ok) throw new Error("Rate lookup failed");

        const gecko = await geckoRes.json();
        const fx = await fxRes.json();
        if (cancelled) return;

        const ctcPrice = gecko["creditcoin-2"]?.usd;
        if (!ctcPrice) throw new Error("CTC price unavailable");

        setCtcPriceUsd(ctcPrice);
        setCryptoPricesUsd({ BTC: gecko.bitcoin?.usd, ETH: gecko.ethereum?.usd });
        setFiatRatesUsd(fx.rates ?? {});
        setIsReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load conversion rates");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function convertToCtc(amount: number, currency: CurrencyCode): number | null {
    if (currency === "CTC") return amount;
    if (!ctcPriceUsd || !Number.isFinite(amount)) return null;

    let amountUsd: number;
    if (currency === "BTC" || currency === "ETH") {
      const price = cryptoPricesUsd[currency];
      if (!price) return null;
      amountUsd = amount * price;
    } else if (currency === "USD") {
      amountUsd = amount;
    } else {
      const rate = fiatRatesUsd[currency];
      if (!rate) return null;
      amountUsd = amount / rate;
    }

    return amountUsd / ctcPriceUsd;
  }

  return { convertToCtc, isReady, error, ctcPriceUsd };
}
