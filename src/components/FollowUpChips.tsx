import { useEffect, useState } from "react";

interface FollowUpChipsProps {
  suggestions: string[];
  onAsk: (question: string) => void;
  isBusy: boolean;
  cooldownUntil?: number;
}

export function FollowUpChips({ suggestions, onAsk, isBusy, cooldownUntil = 0 }: FollowUpChipsProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  if (suggestions.length === 0) return null;

  const cooling = cooldownUntil > now;
  const disabled = isBusy || cooling;

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      <span className="text-xs text-[var(--color-text-muted)] w-full">Maybe ask next:</span>
      {suggestions.map((q) => (
        <button
          key={q}
          onClick={() => onAsk(q)}
          disabled={disabled}
          className="clay clay-pressable text-xs px-3.5 py-2 text-[var(--color-text)] hover:text-[var(--color-accent)] disabled:opacity-50 disabled:cursor-default disabled:pointer-events-none"
          style={{ borderRadius: 9999 }}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
