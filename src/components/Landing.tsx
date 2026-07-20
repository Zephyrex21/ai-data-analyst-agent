import { FeatureHighlights } from "./FeatureHighlights";
import { ArchitectureVisual } from "./ArchitectureVisual";
import { TechStackBadges } from "./TechStackBadges";

const GITHUB_URL = "https://github.com/Zephyrex21/ai-data-analyst-agent";

interface LandingProps {
  onTryDemo: () => void;
}

export function Landing({ onTryDemo }: LandingProps) {
  return (
    <div className="w-full max-w-4xl flex flex-col items-center gap-10 py-8">
      <div className="text-center flex flex-col items-center gap-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
          Zero-cost · Client-side · Self-correcting
        </span>
        <h2 className="text-3xl sm:text-4xl font-semibold text-[var(--color-text)] max-w-2xl">
          Ask your data questions in plain English.
        </h2>
        <p className="text-lg text-[var(--color-text-muted)] max-w-xl">
          Get a real, verified answer back — not a guess. Every response is actual SQL or Python,
          executed and checked, not just confident-sounding prose.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          <button
            onClick={onTryDemo}
            className="rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium px-6 py-3 transition-transform active:scale-[0.98]"
          >
            Try the live demo ↓
          </button>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm font-medium px-6 py-3 hover:border-[var(--color-accent)]/40 transition-colors"
          >
            View on GitHub
          </a>
        </div>
      </div>

      <FeatureHighlights />
      <ArchitectureVisual />
      <TechStackBadges />

      <div className="w-full border-t border-[var(--color-border)]" />
    </div>
  );
}
