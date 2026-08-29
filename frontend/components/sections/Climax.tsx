export function Climax() {
  return (
    <section
      data-beat="climax"
      className="flex min-h-screen flex-col items-center justify-center bg-concrete-900/90 px-6 py-16 text-center text-paper-100 sm:items-start sm:bg-concrete-900/80 sm:pr-[45%] sm:text-left"
    >
      <h2 className="max-w-2xl font-[family-name:var(--font-display)] text-4xl font-bold sm:text-5xl">
        At the floor, the loan unlocks.
      </h2>
      <p className="mt-4 max-w-lg text-lg text-paper-100/70">
        No new collateral. Just the payment history you already proved.
      </p>

      <dl className="mt-10 flex flex-wrap justify-center gap-x-10 gap-y-4 font-[family-name:var(--font-data)] text-sm sm:justify-start">
        <div>
          <dt className="text-paper-100/50">collateral ratio</dt>
          <dd className="text-lg text-brass-500">110%</dd>
        </div>
        <div>
          <dt className="text-paper-100/50">status</dt>
          <dd className="text-lg text-brass-500">eligible</dd>
        </div>
      </dl>
    </section>
  );
}
