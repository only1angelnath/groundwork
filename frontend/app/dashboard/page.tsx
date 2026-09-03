import { Nav } from "@/components/sections/Nav";
import { Dashboard } from "@/components/sections/Dashboard";
import { PaymentHistory } from "@/components/sections/PaymentHistory";
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
      <PaymentHistory />
      <Footer />
    </main>
  );
}
