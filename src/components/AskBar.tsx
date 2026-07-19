import { useState } from "react";

interface AskBarProps {
  onAsk: (question: string) => void;
  isBusy: boolean;
}

export function AskBar({ onAsk, isBusy }: AskBarProps) {
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || isBusy) return;
    onAsk(value.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-4 w-full flex flex-col sm:flex-row gap-3">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask a question about your data, e.g. “what's total revenue by region?”"
        disabled={isBusy}
        className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={isBusy || !value.trim()}
        className="rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium px-5 py-3 whitespace-nowrap transition-transform active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
      >
        {isBusy ? "Thinking…" : "Ask"}
      </button>
    </form>
  );
}
