import { FeatureHighlights } from "./FeatureHighlights";
import { ArchitectureVisual } from "./ArchitectureVisual";
import { TechStackBadges } from "./TechStackBadges";
import { TerminalDemo } from "./TerminalDemo";

interface LandingProps {
  onTryDemo: () => void;
}

export function Landing({ onTryDemo }: LandingProps) {
  return (
    <div className="w-full max-w-4xl flex flex-col items-center gap-16 py-8">
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
            className="clay clay-pressable clay-solid-accent text-white text-sm font-medium px-6 py-3"
          >
            Try the live demo ↓
          </button>
        </div>
      </div>

      <TerminalDemo />

      <div id="features" className="w-full flex flex-col items-center gap-6 scroll-mt-24">
        <h3 className="text-xl font-semibold text-[var(--color-text)]">Why this is different</h3>
        <FeatureHighlights />
      </div>

      <div id="architecture" className="w-full flex flex-col items-center gap-6 scroll-mt-24">
        <h3 className="text-xl font-semibold text-[var(--color-text)]">How it works</h3>
        <ArchitectureVisual />
      </div>

      <div className="w-full flex flex-col items-center gap-6">
        <h3 className="text-xl font-semibold text-[var(--color-text)]">Built with</h3>
        <TechStackBadges />
      </div>

      <div className="w-full h-px" style={{ background: "var(--color-border)" }} />
    </div>
  );
}
