import { useEffect, useState } from "react";

interface AskBarProps {
  onAsk: (question: string) => void;
  isBusy: boolean;
  cooldownUntil?: number;
}

export function AskBar({ onAsk, isBusy, cooldownUntil = 0 }: AskBarProps) {
  const [value, setValue] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const cooling = cooldownUntil > now;
  const secondsLeft = cooling ? Math.max(1, Math.ceil((cooldownUntil - now) / 1000)) : 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || isBusy || cooling) return;
    onAsk(value.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="clay p-4 w-full flex flex-col sm:flex-row gap-3">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask a question about your data, e.g. “what's total revenue by region?”"
        disabled={isBusy || cooling}
        className="clay-inset flex-1 px-4 py-3 text-sm text-[var(--color-text)] disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={isBusy || cooling || !value.trim()}
        className="clay clay-pressable clay-solid-accent text-white text-sm font-medium px-5 py-3 whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none"
      >
        {isBusy ? "Thinking…" : cooling ? `Wait ${secondsLeft}s` : "Ask"}
      </button>
    </form>
  );
}
