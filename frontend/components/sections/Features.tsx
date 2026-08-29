export function Features() {
  return (
    <section className="mx-auto max-w-5xl border-t border-line-200 px-6 py-8">
      <div className="grid gap-10 sm:grid-cols-2">
        <div className="group rounded-2xl border border-transparent p-4 transition duration-300 hover:border-glass-border hover:bg-glass-100 hover:backdrop-blur-md">
          <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-ink-900 transition-colors duration-300 group-hover:text-pink-500">
            Transparent by Design
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-warmgray-500">
            The full verification path is on-chain. Every attestation, every
            replay check, happens transparently, not behind an API.
          </p>
        </div>
        <div className="group rounded-2xl border border-transparent p-4 transition duration-300 hover:border-glass-border hover:bg-glass-100 hover:backdrop-blur-md">
          <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-ink-900 transition-colors duration-300 group-hover:text-pink-500">
            Your Rate, Your Terms
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-warmgray-500">
            No lock-up periods, no staking. Your collateral ratio moves only
            when you have new verified history to show for it.
          </p>
        </div>
      </div>
    </section>
  );
}
