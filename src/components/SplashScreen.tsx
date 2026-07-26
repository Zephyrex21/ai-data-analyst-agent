import { useEffect, useState } from "react";

const MIN_DISPLAY_MS = 900;
const FADE_MS = 400;

interface SplashScreenProps {
  onDone: () => void;
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setIsFadingOut(true), MIN_DISPLAY_MS);
    const doneTimer = setTimeout(onDone, MIN_DISPLAY_MS + FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 ${
        isFadingOut ? "splash-fade-out" : ""
      }`}
      style={{ background: "var(--color-surface-muted)" }}
      role="status"
      aria-label="Loading"
    >
      <div
        className="clay splash-pulse flex items-center justify-center"
        style={{ width: 72, height: 72, borderRadius: 9999, background: "var(--color-accent-soft)" }}
      >
        <span className="text-2xl font-semibold" style={{ color: "var(--color-accent)" }}>
          AI
        </span>
      </div>
      <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
    </div>
  );
}
