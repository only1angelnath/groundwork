import { TileGridBackground } from "@/components/illustrations/TileGridBackground";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-6 pt-14 text-center">
      <div className="relative min-h-[26rem] sm:min-h-[30rem]">
        <TileGridBackground />

        <div className="relative z-10">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-3">
            <span className="flex items-center gap-2 rounded-full border border-glass-border bg-glass-100 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-warmgray-500 backdrop-blur-md transition hover:bg-white/50">
              <span className="h-2 w-2 rounded-full bg-leaf-500" />
              Real payment history
            </span>
            <span className="flex items-center gap-2 rounded-full border border-glass-border bg-glass-100 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-warmgray-500 backdrop-blur-md transition hover:bg-white/50">
              <span className="h-2 w-2 rounded-full bg-pink-500" />
              Verified on-chain
            </span>
          </div>

          <h1 className="mx-auto mt-8 max-w-3xl font-[family-name:var(--font-display)] text-5xl leading-tight sm:text-6xl">
            <span className="transition-colors duration-300 hover:text-pink-500 font-semibold text-ink-900">
              What if your
            </span>{" "}
            <span className="transition-colors duration-300 hover:text-ink-900 font-normal italic text-warmgray-500">
              bill payments
            </span>
            <br />
            <span className="transition-colors duration-300 hover:text-pink-500 font-semibold text-ink-900">
              counted toward
            </span>{" "}
            <span className="transition-colors duration-300 hover:text-ink-900 font-normal italic text-warmgray-500">
              what you can borrow?
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-md text-warmgray-500 transition-colors duration-300 hover:text-ink-900">
            That's what Groundwork does. Prove a bill payment, and the
            collateral you need to borrow drops.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a
              href="#connect"
              className="rounded-full bg-gradient-to-b from-pink-400 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:scale-[1.04] hover:shadow-lg"
            >
              Get Started
            </a>
            <a
              href="#how-it-works"
              className="rounded-full border border-glass-border bg-glass-100 px-6 py-3 text-sm font-medium text-ink-900 backdrop-blur-md transition hover:scale-[1.04] hover:bg-white/50"
            >
              See how it works
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
