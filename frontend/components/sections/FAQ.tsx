"use client";

import { useState } from "react";

const faqs = [
  {
    q: "What is Groundwork?",
    a: "Groundwork is an undercollateralized micro-credit protocol on Creditcoin. Real-world bill payments, attested on Ethereum Sepolia via the Attestcoin Protocol, progressively lower the collateral required to borrow.",
  },
  {
    q: "Why does verifying bill payments lower my collateral?",
    a: "Traditional on-chain lending only looks at what you lock up. Groundwork adds a second signal: proof that you already pay your bills. Each verified payment steps your required ratio down 20 points, toward a 110% floor.",
  },
  {
    q: "What chains does Groundwork use?",
    a: "Bill payments happen on Ethereum Sepolia. Verification, the credit vault, and borrowing happen on Creditcoin, using the Attestcoin Protocol to carry proof between the two.",
  },
  {
    q: "Is this live on mainnet?",
    a: "No. Groundwork currently runs on Sepolia and the Creditcoin CC3 Testnet only, built for the BUIDL CTC 2026 Fall hackathon. No real funds are involved anywhere in this flow.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="border-t border-line-200 px-6 py-12">
      <div className="mx-auto grid max-w-5xl gap-10 sm:grid-cols-[1fr_2fr]">
        <span className="font-[family-name:var(--font-display)] text-4xl font-bold text-warmgray-300">
          FAQ
        </span>

        <div className="space-y-3">
          {faqs.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={item.q}
                className="group overflow-hidden rounded-2xl border border-glass-border bg-glass-100 shadow-sm backdrop-blur-md transition duration-300 hover:bg-white/50"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="font-medium text-ink-900 transition-colors duration-300 group-hover:text-pink-500">{item.q}</span>
                  <span className="text-warmgray-500">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && (
                  <p className="px-5 pb-4 text-sm leading-relaxed text-warmgray-500">
                    {item.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
