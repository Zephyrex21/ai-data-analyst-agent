const GITHUB_URL = "https://github.com/Zephyrex21/ai-data-analyst-agent";

interface FooterProps {
  onBackToTop: () => void;
}

export function Footer({ onBackToTop }: FooterProps) {
  return (
    <footer className="w-full max-w-4xl flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-sm text-[var(--color-text-muted)]">
        Built by{" "}
        <a
          href="https://github.com/Zephyrex21"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[var(--color-accent)] hover:underline"
        >
          Saurabh
        </a>{" "}
        — zero-cost, client-side, self-correcting.
      </p>
      <div className="flex items-center gap-4">
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
        >
          GitHub
        </a>
        <span className="text-[var(--color-border)]">·</span>
        <button
          onClick={onBackToTop}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
        >
          Back to top ↑
        </button>
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        © {new Date().getFullYear()} · No data leaves your browser except the LLM call.
      </p>
    </footer>
  );
}
