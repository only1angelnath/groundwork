import type { Metadata } from "next";
import { Roboto_Slab, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Groundwork's type system per the brand plan:
// - display: a slab serif (reads as "built" — matches the tower/foundation metaphor)
// - body: a clean grotesk sans
// - mono: anything that's real verified on-chain data (scores, tx hashes, amounts)
const displaySlab = Roboto_Slab({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
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
      className={`${displaySlab.variable} ${bodySans.variable} ${dataMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F2F3F1] text-[#14171C] font-[family-name:var(--font-body)]">
        {children}
      </body>
    </html>
  );
}
