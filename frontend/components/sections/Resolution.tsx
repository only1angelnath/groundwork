import Link from "next/link";
import { BrandMotion } from "@/components/illustrations/BrandMotion";

const ROADMAP_ITEMS = [
  {
    title: "Decentralized validator network",
    today: "Permissioned validator",
    next: "Staked & slashed",
  },
  {
    title: "Lender marketplace",
    today: "Single pool, algorithmic rate",
    next: "Individual lenders",
  },
  {
    title: "Real biller integrations",
    today: "Self-attested",
    next: "Direct integrations",
  },
  {
    title: "Full KYC",
    today: "Lightweight",
    next: "Compliance-grade KYC/AML",
  },
];

export function Resolution() {
  return (
    <section
      id="roadmap"
      className="relative flex flex-col items-center gap-10 overflow-hidden bg-cream-50 px-6 py-16 text-center"
    >
      <BrandMotion />

      <div className="relative z-10 max-w-2xl">
        <h2 className="font-[family-name:var(--font-display)] text-4xl leading-tight sm:text-5xl">
          <span className="font-bold text-ink-900">Where this goes</span>
          <br />
          <span className="font-normal italic text-warmgray-500">from here.</span>
        </h2>
      </div>

      <div className="relative z-10 flex w-full max-w-2xl flex-col divide-y divide-line-200 overflow-hidden rounded-3xl border border-glass-border bg-glass-100 text-left backdrop-blur-md">
        {ROADMAP_ITEMS.map((item) => (
          <div
            key={item.title}
            className="flex flex-col gap-3 p-6 transition hover:bg-white/40 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="font-[family-name:var(--font-body)] text-sm font-semibold text-ink-900">
              {item.title}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap sm:whitespace-nowrap">
              <span className="font-[family-name:var(--font-data)] text-sm text-warmgray-300 line-through">
                {item.today}
              </span>
              <span className="text-warmgray-500">&rarr;</span>
              <span className="font-[family-name:var(--font-data)] text-sm font-semibold text-brass-500">
                {item.next}
              </span>
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/dashboard"
        className="relative z-10 rounded-full bg-gradient-to-r from-pink-500 to-pink-400 px-8 py-3 font-[family-name:var(--font-body)] text-white shadow-sm transition hover:scale-105 hover:shadow-md"
      >
        Get Started
      </Link>
    </section>
  );
}