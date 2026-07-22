import { ThemeToggle } from "./ThemeToggle";

const GITHUB_URL = "https://github.com/Zephyrex21/ai-data-analyst-agent";

interface NavbarProps {
  onNavigate: (id: string) => void;
}

const NAV_LINKS = [
  { label: "Features", id: "features" },
  { label: "Architecture", id: "architecture" },
  { label: "Try Demo", id: "tool" },
];

export function Navbar({ onNavigate }: NavbarProps) {
  return (
    <div className="sticky top-4 z-20 w-full max-w-4xl px-2">
      <nav className="clay flex items-center justify-between gap-3 px-5 py-2.5">
        <button
          onClick={() => onNavigate("top")}
          className="font-semibold text-sm text-[var(--color-text)]"
        >
          AI Data Analyst Agent
        </button>

        <div className="hidden sm:flex items-center gap-5">
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              onClick={() => onNavigate(link.id)}
              className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
            >
              {link.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
            title="View source on GitHub"
            className="clay clay-pressable flex items-center justify-center h-9 w-9 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
            style={{ borderRadius: 9999 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.54 2.87 8.39 6.84 9.75.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.36-3.37-1.36-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.05a9.3 9.3 0 015 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.02 10.02 0 0022 12.26C22 6.58 17.52 2 12 2z" />
            </svg>
          </a>
          <ThemeToggle />
        </div>
      </nav>
    </div>
  );
}
