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
        className="flex-1 rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={isBusy || !value.trim()}
        className="rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium px-5 py-3 whitespace-nowrap disabled:opacity-40"
      >
        {isBusy ? "Thinking…" : "Ask"}
      </button>
    </form>
  );
}
