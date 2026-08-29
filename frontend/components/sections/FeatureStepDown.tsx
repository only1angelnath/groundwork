export function FeatureStepDown() {
  return (
    <section className="border-b border-line-700 bg-ink-950 px-6 py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 sm:grid-cols-2">
        <div className="order-2 rounded-2xl border border-line-700 bg-ink-900 p-8 sm:order-1">
          <div className="flex items-baseline justify-between">
            <span className="font-[family-name:var(--font-data)] text-4xl font-semibold text-muted-400 line-through decoration-line-700">
              300%
            </span>
            <span className="text-muted-400">→</span>
            <span className="font-[family-name:var(--font-data)] text-4xl font-semibold text-brass-300">
              110%
            </span>
          </div>
          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-muted-400">
            Starting ratio → floor, 20 points per verified payment
          </p>
        </div>

        <div className="order-1 sm:order-2">
          <span className="text-xs uppercase tracking-[0.2em] text-brass-300">
            Collateral that listens
          </span>
          <h2 className="mt-3 max-w-md font-[family-name:var(--font-display)] text-3xl font-bold sm:text-4xl">
            Your required collateral drops as you prove yourself.
          </h2>
          <p className="mt-5 max-w-md text-muted-400">
            Every verified payment steps the ratio down 20 percentage
            points, from 300% at the start to a 110% floor. It's tracked as
            a growing history, not a one-time score.
          </p>
        </div>
      </div>
    </section>
  );
}
