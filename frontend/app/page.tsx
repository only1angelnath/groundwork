import { Nav } from "@/components/sections/Nav";
import { Hero } from "@/components/sections/Hero";
import { Benefits } from "@/components/sections/Benefits";
import { Features } from "@/components/sections/Features";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { FAQ } from "@/components/sections/FAQ";
import { Resolution } from "@/components/sections/Resolution";
import { Dashboard } from "@/components/sections/Dashboard";
import { PaymentHistory } from "@/components/sections/PaymentHistory";
import { Footer } from "@/components/sections/Footer";
import { Reveal } from "@/components/Reveal";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <Nav />
      <Hero />
      <Reveal>
        <Benefits />
      </Reveal>
      <Reveal>
        <Features />
      </Reveal>
      <Reveal>
        <HowItWorks />
      </Reveal>
      <Reveal>
        <FAQ />
      </Reveal>
      <Reveal>
        <Resolution />
      </Reveal>
      <Reveal>
        <Dashboard />
      </Reveal>
      <Reveal>
        <PaymentHistory />
      </Reveal>
      <Footer />
    </main>
  );
}
