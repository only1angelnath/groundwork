export function FeatureVerify() {
  return (
    <section className="border-b border-line-700 bg-ink-900 px-6 py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 sm:grid-cols-2">
        <div>
          <span className="text-xs uppercase tracking-[0.2em] text-brass-300">
            Transparent by design
          </span>
          <h2 className="mt-3 max-w-md font-[family-name:var(--font-display)] text-3xl font-bold sm:text-4xl">
            Every proof, checked on-chain.
          </h2>
          <p className="mt-5 max-w-md text-muted-400">
            A bill payment on Sepolia gets attested by the Attestcoin
            Protocol, then carried to Creditcoin and verified against the
            real transaction before it ever touches your collateral ratio.
          </p>
        </div>

        <div className="rounded-2xl border border-line-700 bg-ink-950 p-6">
          <dl className="space-y-4 font-[family-name:var(--font-data)] text-sm">
            <div className="flex justify-between border-b border-line-700 pb-4">
              <dt className="text-muted-400">source chain</dt>
              <dd>Ethereum Sepolia</dd>
            </div>
            <div className="flex justify-between border-b border-line-700 pb-4">
              <dt className="text-muted-400">verification</dt>
              <dd>Creditcoin CC3 Testnet</dd>
            </div>
            <div className="flex justify-between border-b border-line-700 pb-4">
              <dt className="text-muted-400">protocol</dt>
              <dd>Attestcoin Protocol</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-400">status</dt>
              <dd className="text-leaf-500">verified</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
