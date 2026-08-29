import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { Providers } from "./providers";

// Groundwork's type system:
// - display: Fraunces — a characterful serif with real optical-size range,
//   reads better at both large headline sizes and smaller card titles than
//   a fixed-contrast serif like Playfair does.
// - body: a clean grotesk sans
// - mono: anything that's real verified on-chain data (scores, tx hashes, amounts)
const displaySerif = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "variable",
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
});

const bodySans = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const dataMono = JetBrains_Mono({
  variable: "--font-data",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Groundwork — Credit built from what's real",
  description:
    "Undercollateralized micro-credit on Creditcoin, built from attested real-world payment history via the Attestcoin Protocol.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${displaySerif.variable} ${bodySans.variable} ${dataMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream-50 text-ink-900 font-[family-name:var(--font-body)]">
        {/* Fixed background wash — soft blurred color blobs that glass
            surfaces throughout the page pick up via backdrop-blur. A flat
            solid background shows zero glass effect, so this exists purely
            to give the effect something to blur. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-pink-400/30 blur-[100px]" />
          <div className="absolute right-[-10rem] top-1/3 h-[28rem] w-[28rem] rounded-full bg-brass-300/25 blur-[100px]" />
          <div className="absolute -bottom-40 left-1/4 h-[26rem] w-[26rem] rounded-full bg-pink-500/20 blur-[100px]" />
        </div>
        <div className="relative z-10 flex flex-1 flex-col">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
