export function Context() {
  return (
    <section className="flex min-h-screen items-center bg-concrete-50 px-6 py-24">
      <div className="mx-auto grid w-full max-w-5xl gap-16 sm:grid-cols-2">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold text-concrete-900 sm:text-4xl">
            Undercollateralized lending is out of reach if you don&apos;t
            already hold capital.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-rebar-700">
            Most on-chain credit still asks you to lock up more than you
            want to borrow. Groundwork asks for something else: proof that
            you already pay your bills. Each verified payment lowers what
            you need to put up, until you can borrow without it.
          </p>
        </div>

        <div className="flex flex-col justify-center gap-8 rounded-sm bg-paper-100 p-10">
          <div>
            <div className="font-[family-name:var(--font-data)] text-5xl font-medium text-clay-600">
              300%
            </div>
            <p className="mt-2 text-sm text-rebar-700">
              Starting collateral ratio, before a single payment is proven.
            </p>
          </div>
          <div className="h-px w-full bg-rebar-700/20" />
          <div>
            <div className="font-[family-name:var(--font-data)] text-5xl font-medium text-brass-500">
              110%
            </div>
            <p className="mt-2 text-sm text-rebar-700">
              The floor. Every verified payment steps the ratio down 20
              points toward it.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
