const benefits = [
  {
    title: "Undercollateralized",
    body: "Starts at 300% collateral. Every verified payment steps it down 20 points, toward a 110% floor.",
  },
  {
    title: "Verified On-Chain",
    body: "Every payment is attested via the Attestcoin Protocol and checked on Creditcoin before it counts.",
  },
  {
    title: "Your History, Your Rate",
    body: "The more you prove, the less you need to lock up. Real payment history becomes real credit.",
  },
];

export function Benefits() {
  return (
    <section id="benefits" className="px-6 py-12">
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="mx-auto max-w-md font-[family-name:var(--font-display)] text-4xl sm:text-5xl">
          <span className="font-bold text-ink-900">Earn</span>{" "}
          <span className="font-normal text-warmgray-500">credit.</span>{" "}
          <span className="font-bold text-ink-900">Risk</span>{" "}
          <span className="font-normal text-warmgray-500">less.</span>
        </h2>

        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {benefits.map((b) => (
            <div
              key={b.title}
              className="rounded-3xl border border-glass-border bg-glass-100 p-6 text-left shadow-sm backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:bg-white/50 hover:shadow-lg"
            >
              <div className="mb-4 h-2 w-8 rounded-full bg-pink-400/50" aria-hidden />
              <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-ink-900 transition-colors duration-300 hover:text-pink-500">
                {b.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-warmgray-500">
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
