import { BrandMotion } from "@/components/illustrations/BrandMotion";

function DotGrid() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 rounded-3xl opacity-40"
      style={{
        backgroundImage:
          "radial-gradient(circle, #D8D3C6 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    />
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative overflow-hidden px-6 py-12">
      <BrandMotion />
      <div className="relative z-10 mx-auto max-w-5xl">
        <h2 className="text-center font-[family-name:var(--font-display)] text-4xl sm:text-5xl">
          <span className="font-bold text-ink-900">How it</span>{" "}
          <span className="font-normal text-warmgray-500">Works</span>
        </h2>

        <div className="mt-8 space-y-6">
          {/* Step 01 — Pay */}
          <div className="grid items-center gap-8 border-t border-line-200 pt-6 sm:grid-cols-2">
            <div>
              <span className="inline-block rounded-lg border border-line-200 bg-white/40 px-2.5 py-1 font-[family-name:var(--font-data)] text-xs text-warmgray-500 backdrop-blur-sm">
                STEP 01
              </span>
              <h3 className="mt-3 text-xl font-bold text-ink-900 transition-colors duration-300 hover:text-pink-500">
                A bill gets paid on Sepolia.
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-warmgray-500">
                Rent, a utility bill. Pay it like you always do. Groundwork
                watches for it.
              </p>
            </div>
            <div className="group relative h-44 overflow-hidden rounded-3xl border border-glass-border bg-glass-100 shadow-sm backdrop-blur-md transition duration-300 hover:shadow-lg">
              <DotGrid />
              <div className="absolute left-1/2 top-1/2 w-44 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-glass-border bg-white/60 p-4 shadow-sm backdrop-blur-sm transition duration-300 group-hover:scale-105">
                <span className="font-[family-name:var(--font-data)] text-xs text-warmgray-500">
                  bill payment
                </span>
                <div className="mt-1 font-[family-name:var(--font-data)] text-lg font-semibold text-ink-900">
                  0.01 ETH
                </div>
              </div>
            </div>
          </div>

          {/* Step 02 — Verify */}
          <div className="grid items-center gap-8 border-t border-line-200 pt-6 sm:grid-cols-2">
            <div>
              <span className="inline-block rounded-lg border border-line-200 bg-white/40 px-2.5 py-1 font-[family-name:var(--font-data)] text-xs text-warmgray-500 backdrop-blur-sm">
                STEP 02
              </span>
              <h3 className="mt-3 text-xl font-bold text-ink-900 transition-colors duration-300 hover:text-pink-500">
                The payment is verified on-chain.
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-warmgray-500">
                The Attestcoin Protocol attests the transaction and carries
                the proof to Creditcoin for verification.
              </p>
            </div>
            <div className="group relative h-44 overflow-hidden rounded-3xl border border-glass-border bg-glass-100 shadow-sm backdrop-blur-md transition duration-300 hover:shadow-lg">
              <DotGrid />
              <div className="absolute left-1/2 top-1/2 w-64 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-glass-border bg-white/60 p-4 shadow-sm backdrop-blur-sm transition duration-300 group-hover:scale-105">
                <dl className="space-y-2 font-[family-name:var(--font-data)] text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="shrink-0 text-warmgray-500">chain</dt>
                    <dd className="text-right text-ink-900">sepolia → creditcoin</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="shrink-0 text-warmgray-500">status</dt>
                    <dd className="text-leaf-500">verified</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          {/* Step 03 — Step down */}
          <div className="grid items-center gap-8 border-t border-line-200 pt-6 sm:grid-cols-2">
            <div>
              <span className="inline-block rounded-lg border border-line-200 bg-white/40 px-2.5 py-1 font-[family-name:var(--font-data)] text-xs text-warmgray-500 backdrop-blur-sm">
                STEP 03
              </span>
              <h3 className="mt-3 text-xl font-bold text-ink-900 transition-colors duration-300 hover:text-pink-500">
                Your required collateral drops.
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-warmgray-500">
                Each verified payment steps the ratio down 20 points, from
                300% toward a 110% floor.
              </p>
            </div>
            <div className="group relative h-44 overflow-hidden rounded-3xl border border-glass-border bg-glass-100 shadow-sm backdrop-blur-md transition duration-300 hover:shadow-lg">
              <DotGrid />
              <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-2xl border border-glass-border bg-white/60 px-5 py-4 shadow-sm backdrop-blur-sm transition duration-300 group-hover:scale-105">
                <span className="font-[family-name:var(--font-data)] text-lg text-warmgray-300 line-through">
                  300%
                </span>
                <span className="text-warmgray-500">→</span>
                <span className="font-[family-name:var(--font-data)] text-lg font-semibold text-brass-500">
                  110%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
