import Link from "next/link";
import { Logo } from "@/components/Logo";
import { NotificationBell } from "@/components/NotificationBell";

export function Nav() {
  return (
    <div className="sticky top-4 z-50 mx-auto w-full max-w-5xl px-4">
      <header className="flex items-center justify-between rounded-full border border-glass-border bg-glass-100 px-4 py-2.5 shadow-sm backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={30} />
          <span className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink-900">
            groundwork
          </span>
        </Link>

        <nav className="hidden gap-8 text-xs font-medium uppercase tracking-wide text-warmgray-500 sm:flex">
          <Link href="/#benefits" className="transition hover:text-ink-900">
            Benefits
          </Link>
          <Link
            href="/#how-it-works"
            className="transition hover:text-ink-900"
          >
            How it Works
          </Link>
          <Link href="/#faq" className="transition hover:text-ink-900">
            FAQ
          </Link>
          <Link href="/#roadmap" className="transition hover:text-ink-900">
            Roadmap
          </Link>
          <Link href="/dashboard" className="transition hover:text-ink-900">
            Dashboard
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <NotificationBell />
          <Link
            href="/dashboard"
            className="rounded-full bg-gradient-to-b from-pink-400 to-pink-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:scale-105 hover:shadow-md"
          >
            Get Started
          </Link>
        </div>
      </header>
    </div>
  );
}
