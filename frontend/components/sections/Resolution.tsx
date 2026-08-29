"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { BrandMotion } from "@/components/illustrations/BrandMotion";

export function Resolution() {
  return (
    <section
      id="connect"
      className="relative flex flex-col items-center gap-8 overflow-hidden px-6 py-16 text-center"
      style={{
        background:
          "radial-gradient(circle at 50% 20%, #F5F3EF 0%, #EDEAE3 100%)",
      }}
    >
      <BrandMotion />

      <h2 className="relative z-10 max-w-2xl font-[family-name:var(--font-display)] text-4xl leading-tight sm:text-5xl">
        <span className="font-bold text-ink-900">Connect a wallet.</span>
        <br />
        <span className="font-normal text-warmgray-500">
          Watch your collateral drop.
        </span>
      </h2>
      <div className="relative z-10 [&_button]:font-[family-name:var(--font-body)]">
        <ConnectButton
          label="Connect wallet"
          accountStatus="address"
          chainStatus="icon"
          showBalance={false}
        />
      </div>
    </section>
  );
}
