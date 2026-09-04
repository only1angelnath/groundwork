import Link from "next/link";
import { BrandMotion } from "@/components/illustrations/BrandMotion";

const ROADMAP_ITEMS = [
  {
    title: "Decentralized validator network",
    detail:
      "Today, bill approvals run through a small permissioned validator set. Next: staking, slashing, and a dispute window so anyone can validate.",
  },
  {
    title: "Lender marketplace",
    detail:
      "Today, borrowing draws from a single pool at an algorithmic rate. Next: individual lenders underwriting individual borrowers with real capital.",
  },
  {
    title: "Real biller integrations",
    detail:
      "Today, bill payments are self-attested. Next: direct integrations with utility and rent-payment platforms.",
  },
  {
    title: "Full KYC",
    detail:
      "Today, identity verification is lightweight. Next: a complete compliance-grade KYC/AML flow.",
  },
];

export function Resolution() {
  return (
    <section
      id="roadmap"
      className="relative flex flex-col items-center gap-10 overflow-hidden px-6 py-16 text-center"
      style={{
        background:
          "radial-gradient(circle at 50% 20%, #F5F3EF 0%, #EDEAE3 100%)",
      }}
    >
      <BrandMotion />

      <div className="relative z-10 max-w-2xl">
        <h2 className="font-[family-name:var(--font-display)] text-4xl leading-tight sm:text-5xl">
          <span className="font-bold text-ink-900">Where this goes</span>
          <br />
          <span className="font-normal text-warmgray-500">
            from here.
          </span>
        </h2>
      </div>

      <div className="relative z-10 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {ROADMAP_ITEMS.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-glass-border bg-glass-100 p-5 text-left backdrop-blur-md transition hover:scale-[1.02]"
          >
            <p className="font-[family-name:var(--font-body)] text-sm font-semibold text-ink-900">
              {item.title}
            </p>
            <p className="mt-1 text-sm text-warmgray-500">{item.detail}</p>
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
