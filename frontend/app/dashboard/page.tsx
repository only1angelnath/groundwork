import { Nav } from "@/components/sections/Nav";
import { Dashboard } from "@/components/sections/Dashboard";
import { PaymentHistory } from "@/components/sections/PaymentHistory";
import { SbtReceipts } from "@/components/SbtReceipts";
import { Footer } from "@/components/sections/Footer";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function DashboardPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Nav />

      <section className="flex flex-col items-center gap-4 px-6 pb-4 pt-12">
        <ConnectButton />
      </section>

      <Dashboard />
      <section className="flex flex-col items-center px-6 pb-4">
        <SbtReceipts />
      </section>
      <PaymentHistory />
      <Footer />
    </main>
  );
}
