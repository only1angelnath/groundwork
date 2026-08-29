import { Logo } from "@/components/Logo";

export function Footer() {
  return (
    <footer className="border-t border-line-200 px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center text-xs text-warmgray-500 sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-2">
          <Logo size={20} />
          <span>© 2026 Groundwork</span>
        </div>
        <a
          href="https://github.com/only1angelnath"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-line-200 underline-offset-4 transition hover:text-ink-900"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}
